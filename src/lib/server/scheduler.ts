import { env } from '$env/dynamic/private';
import { syncPrinterUsage } from '$lib/server/printer/sync';

const INTERVAL_MINUTES = Number(env.SYNC_INTERVAL_MINUTES ?? '15');

let started = false;

/** Starts the periodic printer sync. Safe to call more than once -- only the first call does anything. */
export function startScheduler() {
	if (started) return;
	started = true;

	const run = async () => {
		try {
			const result = await syncPrinterUsage();
			console.log(
				`[scheduler] sync ok: ${result.jobsNew} new job(s) of ${result.jobsFound} found` +
					(result.unmatchedCodes.length
						? `, unmatched codes: ${result.unmatchedCodes.join(', ')}`
						: '')
			);
		} catch (err) {
			console.error('[scheduler] sync failed:', err);
		}
	};

	// Run once shortly after startup, then on the configured interval.
	setTimeout(run, 10_000);
	setInterval(run, INTERVAL_MINUTES * 60_000);
}
