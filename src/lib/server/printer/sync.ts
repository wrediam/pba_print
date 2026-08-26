import { db } from '$lib/server/db';
import { department, person, printJob, syncRun } from '$lib/server/db/schema';
import { and, eq, inArray, isNull, isNotNull, max, min, or } from 'drizzle-orm';
import { PrinterClient } from './client';
import { fetchJobLog } from './jobLog';

/**
 * Splits a printer account code back into the person and department that
 * produced it. The copier uses two conventions depending on how accounts
 * were set up:
 *
 *   Mode A (personal-first): personalCode + deptCode  e.g. "598"+"61" = "59861"
 *   Mode B (dept-first):     deptCode + personalCode  e.g. "60"+"487" = "60487"
 *
 * Both modes are tried. For dept-first codes the printer sometimes
 * zero-pads the dept prefix (e.g. stores dept "38" as "038"), so the
 * lookup also strips leading zeros from the candidate prefix before
 * matching against the department table.
 */
export function matchCode(
	code: string,
	people: { id: number; personalCode: string }[],
	departments: { id: number; code: string }[]
): { personId: number | null; departmentId: number | null } {
	const deptByCode = new Map(departments.map((d) => [d.code, d]));
	const personByCode = new Map(people.map((p) => [p.personalCode, p]));

	// Mode A: personalCode prefix + deptCode suffix
	for (const p of people) {
		if (code.startsWith(p.personalCode)) {
			const rest = code.slice(p.personalCode.length);
			const dept = deptByCode.get(rest);
			if (dept) return { personId: p.id, departmentId: dept.id };
		}
	}

	// Mode B: deptCode prefix (possibly zero-padded) + personalCode suffix
	// Try longest dept codes first to prefer more-specific matches.
	const deptsByLength = [...departments].sort((a, b) => b.code.length - a.code.length);
	for (const dept of deptsByLength) {
		// Try both the raw dept code and a zero-padded version as prefix.
		const prefixCandidates = new Set([dept.code, '0' + dept.code, '00' + dept.code]);
		for (const prefix of prefixCandidates) {
			if (code.startsWith(prefix) && code.length > prefix.length) {
				const suffix = code.slice(prefix.length);
				const person = personByCode.get(suffix);
				if (person) return { personId: person.id, departmentId: dept.id };
			}
		}
	}

	return { personId: null, departmentId: null };
}

/**
 * Falls back to identifying just the department from the tail of a
 * code, without needing to already know the specific person -- billing
 * is per-department, and department codes are seeded up front (from
 * the church's own codes sheet) well before every individual person's
 * code is entered into the roster. Without this, every job would sit
 * as fully "Unassigned" (including for billing) until someone got
 * around to adding every person, even though which department to bill
 * is already knowable from the code alone.
 *
 * Tries known department codes longest-first (so e.g. "611" -- Youth
 * Sunday School -- wins over the shorter "61" -- Youth Dept. -- for a
 * code ending in "611"), and only matches if there's at least one
 * character left over for the person's own code, consistent with the
 * personalCode+departmentCode concatenation scheme.
 */
function matchDepartmentBySuffix(
	code: string,
	departments: { id: number; code: string }[]
): number | null {
	const candidates = [...departments].sort((a, b) => b.code.length - a.code.length);
	for (const dept of candidates) {
		if (code.length > dept.code.length && code.endsWith(dept.code)) {
			return dept.id;
		}
	}
	return null;
}

/**
 * Resolves a code to a person and/or department, preferring a full
 * exact match (both person and department recognized) but falling back
 * to a department-only match by suffix when the specific person isn't
 * in the roster yet -- see matchDepartmentBySuffix.
 */
function resolveCode(
	code: string,
	people: { id: number; personalCode: string }[],
	departments: { id: number; code: string }[]
): { personId: number | null; departmentId: number | null } {
	const full = matchCode(code, people, departments);
	if (full.departmentId) return full;
	return { personId: full.personId, departmentId: matchDepartmentBySuffix(code, departments) };
}

/**
 * Re-checks every already-imported job that's still missing a person or
 * department against the *current* people/department tables, and fixes
 * up any that now resolve. Needed because jobs get imported as soon as
 * they're seen even if their code isn't recognized yet -- if codes get
 * added later (e.g. bulk-seeding a roster from the office after the
 * fact), those old jobs would otherwise stay "Unassigned" forever.
 * Called automatically at the end of every sync; safe and cheap to call
 * on its own too (e.g. right after a bulk import), which the "Sync Now"
 * button doubles as.
 */
export async function reconcileUnmatchedJobs(): Promise<number> {
	const unmatched = await db
		.select({ id: printJob.id, loginName: printJob.loginName })
		.from(printJob)
		.where(
			and(
				isNotNull(printJob.loginName),
				or(isNull(printJob.personId), isNull(printJob.departmentId))
			)
		);
	if (unmatched.length === 0) return 0;

	const people = await db.select({ id: person.id, personalCode: person.personalCode }).from(person);
	const departments = await db
		.select({ id: department.id, code: department.code })
		.from(department);

	let fixed = 0;
	for (const job of unmatched) {
		if (!job.loginName || !isMatchableCode(job.loginName)) continue;
		const match = resolveCode(job.loginName, people, departments);
		if (match.personId || match.departmentId) {
			await db
				.update(printJob)
				.set({ personId: match.personId, departmentId: match.departmentId })
				.where(eq(printJob.id, job.id));
			fixed++;
		}
	}
	return fixed;
}

// Printer-internal accounts that will never resolve to a person/dept and
// should not be flagged as "unmatched" on every sync.
const SYSTEM_LOGIN_NAMES = new Set(['No Authentication', 'admin', 'service']);

function isMatchableCode(loginName: string): boolean {
	return !SYSTEM_LOGIN_NAMES.has(loginName);
}

/**
 * Classifies a Job Log row by how it reached the copier, from its Job
 * Mode. "Print" is a network print job -- after the gateway migration
 * (see docs/GATEWAY_MIGRATION.md) these come in through the print
 * gateway, which stamps the account code. Everything else (Copy, Scan,
 * Fax, Document Filing, ...) is someone physically at the machine, gated
 * by the copier's own walk-up user-code auth.
 *
 * This drives the "walk-up vs gateway" split the office wants to see --
 * but note both kinds are still billed from this one Job Log, since with
 * the copier's auth left ON every job here already carries its code.
 * "source" is a visibility label, not a second billing path, which is
 * what keeps gateway jobs from being counted twice.
 */
function classifySource(jobMode: string): 'walkup' | 'network' {
	return jobMode.trim().toLowerCase() === 'print' ? 'network' : 'walkup';
}

export interface SyncResult {
	jobsFound: number;
	jobsNew: number;
	jobsReconciled: number;
	unmatchedCodes: string[];
}

/**
 * Pulls the printer's Job Log (paginating through as much history as
 * needed -- see fetchJobLog) and stores any jobs not already imported,
 * then reconciles any previously-unmatched jobs against the current
 * people/department lists.
 */
export async function syncPrinterUsage(): Promise<SyncResult> {
	const [run] = await db.insert(syncRun).values({}).returning();

	try {
		const [{ highest, lowest } = { highest: null, lowest: null }] = await db
			.select({ highest: max(printJob.printerJobId), lowest: min(printJob.printerJobId) })
			.from(printJob);

		// Only trust the "stop once we reach an already-known job ID"
		// shortcut if our earliest imported job is #1 -- i.e. we actually
		// hold the complete, gap-free history back to the start. If it's
		// not (e.g. a partial/sparse import from an earlier bug, or this
		// is the very first sync), fall back to a full pull so nothing
		// gets silently skipped. Self-healing: no manual backfill/DB
		// surgery ever needed if this situation comes up again.
		const hasCompleteHistory = lowest === 1;
		const stopAtOrBelowJobId = hasCompleteHistory ? (highest ?? 0) : 0;

		const client = new PrinterClient();
		const fetchedRows = await fetchJobLog(client, stopAtOrBelowJobId);

		// The printer's pagination can occasionally re-show the same job
		// across two consecutive pages (e.g. a job landing right at a page
		// boundary), so de-dupe by printerJobId before doing anything else.
		// Without this, the same job can appear twice in `rows`, and since
		// neither occurrence is in `existingIds` (both are "new"), the
		// second insert would collide with the printer_job_id unique index
		// and abort the whole sync after the first copy already committed.
		const seenJobIds = new Set<number>();
		const rows = fetchedRows.filter((r) => {
			if (seenJobIds.has(r.printerJobId)) return false;
			seenJobIds.add(r.printerJobId);
			return true;
		});

		const existing = rows.length
			? await db
					.select({ printerJobId: printJob.printerJobId })
					.from(printJob)
					.where(
						inArray(
							printJob.printerJobId,
							rows.map((r) => r.printerJobId)
						)
					)
			: [];
		const existingIds = new Set(existing.map((e) => e.printerJobId));
		// Skip jobs with no pages at all -- they're cancelled/error entries
		// with nothing to bill and only clutter the job log.
		const newRows = rows.filter(
			(r) =>
				!existingIds.has(r.printerJobId) &&
				r.bwCount + r.fullColorCount + (r.twoColorCount ?? 0) + (r.singleColorCount ?? 0) > 0
		);

		const people = await db
			.select({ id: person.id, personalCode: person.personalCode })
			.from(person);
		const departments = await db
			.select({ id: department.id, code: department.code })
			.from(department);

		const unmatchedCodes: string[] = [];
		for (const row of newRows) {
			let personId: number | null = null;
			let departmentId: number | null = null;
			if (row.loginName && isMatchableCode(row.loginName)) {
				const match = resolveCode(row.loginName, people, departments);
				personId = match.personId;
				departmentId = match.departmentId;
				if (!personId || !departmentId) unmatchedCodes.push(row.loginName);
			}
			const colorCount =
				row.fullColorCount + (row.twoColorCount ?? 0) + (row.singleColorCount ?? 0);
			await db.insert(printJob).values({
				printerJobId: row.printerJobId,
				jobMode: row.jobMode,
				source: classifySource(row.jobMode),
				loginName: row.loginName,
				personId,
				departmentId,
				userName: row.userName,
				startedAt: row.startedAt,
				completedAt: row.completedAt,
				bwCount: row.bwCount,
				colorCount,
				totalCount: row.bwCount + colorCount,
				fullColorCount: row.fullColorCount,
				twoColorCount: row.twoColorCount,
				singleColorCount: row.singleColorCount,
				result: row.result,
				errorCause: row.errorCause,
				directAddress: row.directAddress,
				colorSetting: row.colorSetting,
				paperSize: row.paperSize,
				paperType: row.paperType,
				duplexSetup: row.duplexSetup,
				resolution: row.resolution,
				computerName: row.computerName,
				fileName: row.fileName,
				outputMode: row.outputMode,
				staple: row.staple,
				stapleCount: row.stapleCount,
				punch: row.punch,
				punchCount: row.punchCount,
				completedSets: row.completedSets,
				completedPages: row.completedPages,
				originalCount: row.originalCount,
				originalSize: row.originalSize
			});
		}

		const jobsReconciled = await reconcileUnmatchedJobs();

		await db
			.update(syncRun)
			.set({
				finishedAt: new Date(),
				status: 'ok',
				jobsFound: rows.length,
				jobsNew: newRows.length
			})
			.where(eq(syncRun.id, run.id));

		return { jobsFound: rows.length, jobsNew: newRows.length, jobsReconciled, unmatchedCodes };
	} catch (err) {
		await db
			.update(syncRun)
			.set({
				finishedAt: new Date(),
				status: 'error',
				errorMessage: err instanceof Error ? err.message : String(err)
			})
			.where(eq(syncRun.id, run.id));
		throw err;
	}
}
