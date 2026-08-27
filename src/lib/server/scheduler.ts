import { env } from '$env/dynamic/private';
import { syncPrinterUsage } from '$lib/server/printer/sync';

const INTERVAL_SECONDS = Number(env.SYNC_INTERVAL_SECONDS ?? '30');

let started = false;
let running = false;

/** Starts the periodic printer sync. Safe to call more than once -- only the first call does anything. */
export function startScheduler() {
	if (started) return;
	started = true;

	const run = async () => {
		// Guard against overlap: incremental syncs are normally fast, but
		// the very first sync against an empty database walks the entire
		// job log and can take a few seconds -- don't let a 30s timer
		// start a second run on top of one still in flight.
		if (running) return;
		running = true;
		try {
			const result = await syncPrinterUsage();
			console.log(
				`[scheduler] sync ok: ${result.jobsNew} new walk-up job(s), ${result.gatewayJobsNew} new gateway job(s)` +
					(result.jobsReconciled
						? `, ${result.jobsReconciled} previously-unmatched job(s) reconciled`
						: '') +
					(result.unmatchedCodes.length
						? `, unmatched codes: ${result.unmatchedCodes.join(', ')}`
						: '')
			);
		} catch (err) {
			console.error('[scheduler] sync failed:', err);
		} finally {
			running = false;
		}
	};

	// Run once shortly after startup, then on the configured interval.
	setTimeout(run, 5_000);
	setInterval(run, INTERVAL_SECONDS * 1_000);
}
