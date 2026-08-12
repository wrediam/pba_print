import { db } from '$lib/server/db';
import { department, person, printJob, syncRun } from '$lib/server/db/schema';
import { and, eq, inArray, isNull, isNotNull, max, or } from 'drizzle-orm';
import { PrinterClient } from './client';
import { fetchJobLog } from './jobLog';

/**
 * Splits a printer account code (e.g. "59861") back into the person and
 * department it was built from (personalCode + departmentCode
 * concatenated, same scheme the macOS setup app uses). Tries every known
 * person's code as a prefix and checks whether the remainder is a known
 * department code. Ambiguous in theory if one person's code happens to
 * be a prefix of another's, but codes are assigned by church staff and
 * expected to be prefix-free in practice.
 */
export function matchCode(
	code: string,
	people: { id: number; personalCode: string }[],
	departments: { id: number; code: string }[]
): { personId: number | null; departmentId: number | null } {
	for (const p of people) {
		if (code.startsWith(p.personalCode)) {
			const rest = code.slice(p.personalCode.length);
			const dept = departments.find((d) => d.code === rest);
			if (dept) return { personId: p.id, departmentId: dept.id };
		}
	}
	return { personId: null, departmentId: null };
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
		.select({ id: printJob.id, fullCode: printJob.fullCode })
		.from(printJob)
		.where(
			and(
				isNotNull(printJob.fullCode),
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
		if (!job.fullCode) continue;
		const match = matchCode(job.fullCode, people, departments);
		if (match.personId && match.departmentId) {
			await db
				.update(printJob)
				.set({ personId: match.personId, departmentId: match.departmentId })
				.where(eq(printJob.id, job.id));
			fixed++;
		}
	}
	return fixed;
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
		const [{ highest } = { highest: null }] = await db
			.select({ highest: max(printJob.printerJobId) })
			.from(printJob);

		const client = new PrinterClient();
		const rows = await fetchJobLog(client, highest ?? 0);

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
		const newRows = rows.filter((r) => !existingIds.has(r.printerJobId));

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
			if (row.accountCode) {
				const match = matchCode(row.accountCode, people, departments);
				personId = match.personId;
				departmentId = match.departmentId;
				if (!personId || !departmentId) unmatchedCodes.push(row.accountCode);
			}
			await db.insert(printJob).values({
				printerJobId: row.printerJobId,
				jobMode: row.jobMode,
				fullCode: row.accountCode,
				personId,
				departmentId,
				computerName: row.computerName,
				startedAt: row.startedAt,
				completedAt: row.completedAt,
				bwCount: row.bwCount,
				colorCount: row.colorCount,
				totalCount: row.totalCount,
				result: row.result
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
