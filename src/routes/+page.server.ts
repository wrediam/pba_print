import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { syncRun } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import { buildUsageReport } from '$lib/server/reporting';
import { syncPrinterUsage } from '$lib/server/printer/sync';

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

export const load: PageServerLoad = async () => {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

	const [report, lastSync] = await Promise.all([
		buildUsageReport(startOfMonth, now),
		db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(1)
	]);

	return {
		report,
		lastSync: lastSync[0] ?? null
	};
};
