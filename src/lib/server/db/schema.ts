import {
	pgTable,
	serial,
	integer,
	text,
	boolean,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

// ── Auth ─────────────────────────────────────────────────────────────
// Single-account auth for the church secretary. There is intentionally
// only ever one row in this table (seeded by the entrypoint migration
// from ADMIN_USERNAME/ADMIN_PASSWORD env vars, only if the table is
// empty -- never overwrites an existing account/password).
export const adminUser = pgTable('admin_user', {
	id: serial('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(), // random session token
	adminUserId: integer('admin_user_id')
		.notNull()
		.references(() => adminUser.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

// ── Codes ────────────────────────────────────────────────────────────
// A department's own code (e.g. 61 = "Youth Dept."), matching the
// physical copier-codes sheet. The printer account number embedded on
// each print job is <person.personalCode><department.code> concatenated
// (e.g. 598 + 61 = 59861), same scheme the macOS setup app uses.
export const department = pgTable(
	'department',
	{
		id: serial('id').primaryKey(),
		code: text('code').notNull(),
		label: text('label').notNull(),
		active: boolean('active').notNull().default(true),
		billable: boolean('billable').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('department_code_idx').on(t.code)]
);

// A person's own code (e.g. Will Reeves = 598).
export const person = pgTable(
	'person',
	{
		id: serial('id').primaryKey(),
		personalCode: text('personal_code').notNull(),
		name: text('name').notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('person_personal_code_idx').on(t.personalCode)]
);

// ── Billing rates ────────────────────────────────────────────────────
// Versioned: a new row is inserted whenever rates change, and reports
// use whichever rate was effective on the date of each print job, so
// historical reports stay accurate even after rates change later.
export const rate = pgTable('rate', {
	id: serial('id').primaryKey(),
	bwCostCents: integer('bw_cost_cents').notNull(),
	colorCostCents: integer('color_cost_cents').notNull(),
	paperCostCents: integer('paper_cost_cents').notNull().default(0),
	effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ── Print gateway ────────────────────────────────────────────────────
// One row per person+department queue provisioned on the print gateway
// (see gateway/ -- a CUPS instance this app controls that sits between
// client Macs and the physical copier). Replaces the old model of
// embedding the account code as a fragile per-macOS-user CUPS default
// on each client machine: instead, the code is baked into a queue that
// lives entirely on the gateway (set once, by us, never touched again),
// and each client's local queue is just a static pointer at
// `ipp://<gateway>/printers/<queueName>` -- see docs/GATEWAY_MIGRATION.md.
export const gatewayQueue = pgTable(
	'gateway_queue',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		departmentId: integer('department_id')
			.notNull()
			.references(() => department.id, { onDelete: 'cascade' }),
		queueName: text('queue_name').notNull(), // e.g. "church_598_61", matches the CUPS queue name on the gateway
		fullCode: text('full_code').notNull(), // personalCode + department.code, embedded on the gateway as JCLUserNumber
		status: text('status').notNull().default('pending'), // "pending" | "ready" | "error"
		lastError: text('last_error'),
		lastProvisionedAt: timestamp('last_provisioned_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('gateway_queue_person_dept_idx').on(t.personId, t.departmentId)]
);

// ── Usage ingested from the printer ─────────────────────────────────
// One row per job pulled from the printer's own Job Log (see
// src/lib/server/printer/). printerJobId is the printer's own log
// entry number -- used to detect and skip jobs already imported.
//
// Column mapping confirmed directly against the printer's own Job Log
// table headers (see src/lib/server/printer/jobLog.ts) -- userName/
// loginName are two distinct columns ("User Name" / "Login Name"), and
// bwCount/fullColorCount/twoColorCount/singleColorCount are 4 separate
// counters (there's no separate "total pages" cell on the printer's
// page; totalCount here is just their sum for convenience).
export const printJob = pgTable(
	'print_job',
	{
		id: serial('id').primaryKey(),
		// The printer's own Job Log entry number. Set for walk-up jobs (which
		// we read from the printer's Job Log) and null for gateway jobs (which
		// we capture from the gateway, not the printer). Unique among non-null
		// values so a walk-up job is never imported twice.
		printerJobId: integer('printer_job_id'),
		// The gateway's own job identity ("<queueName>-<cupsJobId>"). Set for
		// gateway-captured jobs, null for walk-up jobs. Unique among non-null
		// values so a gateway job is never imported twice.
		gatewayJobKey: text('gateway_job_key'),
		jobMode: text('job_mode').notNull(), // "Print" | "Copy" | "USB Memory Scan" | ...
		// Where this row came from, and therefore how it's attributed:
		//   "walkup"  -- someone stood at the machine (Copy/Scan/Fax/...).
		//                Read from the printer's Job Log (jobMode != "Print"),
		//                attributed by the code the person typed.
		//   "network" -- a print job that came THROUGH the gateway. Captured
		//                from the gateway itself and attributed by the queue it
		//                arrived on (queue -> person+department), NOT by the
		//                printer echoing the code back (which it may not do).
		//                Its B&W/color split is borrowed from the matching
		//                printer Job Log row -- see src/lib/server/printer/sync.ts.
		// Null on rows imported before this column existed.
		source: text('source'), // "walkup" | "network" | null
		// For gateway ("network") jobs only: whether the B&W/color split was
		// successfully borrowed from a matching printer Job Log row yet. False
		// means it's still counted as all-B&W (the gateway can't see color on
		// its own) pending a match on a later sync. Always false/irrelevant for
		// walk-up jobs, whose counts come straight from the printer.
		colorFromPrinter: boolean('color_from_printer').notNull().default(false),
		loginName: text('login_name'), // the raw account/login code off the printer, or null if "N/A"
		personId: integer('person_id').references(() => person.id),
		departmentId: integer('department_id').references(() => department.id),
		userName: text('user_name'), // printer's "User Name" field -- friendly display name
		startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		bwCount: integer('bw_count').notNull().default(0), // Black & White Total Count
		colorCount: integer('color_count').notNull().default(0), // fullColorCount + twoColorCount + singleColorCount
		totalCount: integer('total_count').notNull().default(0), // bwCount + colorCount
		fullColorCount: integer('full_color_count').notNull().default(0),
		twoColorCount: integer('two_color_count'), // null if "N/A" (not applicable to this job's mode)
		singleColorCount: integer('single_color_count'), // null if "N/A"
		result: text('result'), // "OK" | "Stopped" | "Send OK" | "Send Error" | ...
		errorCause: text('error_cause'), // null if "N/A"
		directAddress: text('direct_address'), // "Image Send Related Item" -- null if "N/A"
		colorSetting: text('color_setting'), // "Common Functionality" -- e.g. "Auto" | "B/W" | "Full Color"
		paperSize: text('paper_size'), // "Paper Select" -- null if "N/A"
		paperType: text('paper_type'), // e.g. "Plain Paper 1" -- null if "N/A"
		duplexSetup: text('duplex_setup'), // null if "N/A"
		resolution: text('resolution'), // e.g. "600x600" -- null if "N/A"
		// Additional fields from CSV export (not available in the old HTML scraper)
		computerName: text('computer_name'), // sending PC's hostname -- null if "N/A"
		fileName: text('file_name'), // document name sent to printer -- null if "N/A" / "No filing"
		outputMode: text('output_mode'), // "Sort" | "Group" | ... -- null if "N/A"
		staple: text('staple'), // "No Staple" | "1 staple" | ... -- null if "N/A"
		stapleCount: integer('staple_count'), // null if N/A
		punch: text('punch'), // "No Punch" | ... -- null if "N/A"
		punchCount: integer('punch_count'), // null if N/A
		completedSets: integer('completed_sets'), // copies completed -- null if N/A
		completedPages: integer('completed_pages'), // pages completed -- null if N/A
		originalCount: integer('original_count'), // original pages scanned -- null if N/A
		originalSize: text('original_size'), // original document size -- null if "N/A"
		syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('print_job_printer_job_id_idx').on(t.printerJobId),
		uniqueIndex('print_job_gateway_job_key_idx').on(t.gatewayJobKey)
	]
);

// ── Sync history ─────────────────────────────────────────────────────
// Lets the dashboard show "last synced 4 minutes ago" / surface errors
// instead of silently failing in the background.
export const syncRun = pgTable('sync_run', {
	id: serial('id').primaryKey(),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true }),
	status: text('status').notNull().default('running'), // "running" | "ok" | "error"
	jobsFound: integer('jobs_found').notNull().default(0),
	jobsNew: integer('jobs_new').notNull().default(0),
	errorMessage: text('error_message')
});
