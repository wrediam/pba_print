import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { syncRun } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import { buildUsageReport } from '$lib/server/reporting';
import { syncPrinterUsage } from '$lib/server/printer/sync';
import { resolveDateRange, startOfMonthInZone, toDateInput } from '$lib/server/tz';

export const actions: Actions = {
	sync: async () => {
		try {
			await syncPrinterUsage();
		} catch {
			// The sync_run row already records the error; the page reload
			// after this action picks up the failed status from there.
		}
	}
};

// Defaults to the current calendar month (in the church's own timezone,
// not necessarily the server's) if no from/to params are given, same as
// Reports -- see resolveDateRange. That's what makes the Dashboard
// "always start on this month" while still letting you look back at a
// previous month or range via the same date pickers.
export const load: PageServerLoad = async ({ url }) => {
	const { from, to } = resolveDateRange(url);

	const [report, lastSync] = await Promise.all([
		buildUsageReport(from, to),
		db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(1)
	]);

	return {
		report,
		lastSync: lastSync[0] ?? null,
		fromInput: toDateInput(from),
		toInput: toDateInput(to),
		thisMonthInput: toDateInput(startOfMonthInZone(new Date()))
	};
};
