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
		printerJobId: integer('printer_job_id').notNull(),
		jobMode: text('job_mode').notNull(), // "Print" | "Copy" | "USB Memory Scan" | ...
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
		duplexSetup: text('duplex_setup'), // null if "N/A"
		syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('print_job_printer_job_id_idx').on(t.printerJobId)]
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
