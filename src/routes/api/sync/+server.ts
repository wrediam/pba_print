import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncPrinterUsage } from '$lib/server/printer/sync';

// Triggered by the "Sync Now" button. Requires the normal logged-in
// session, same as every other route (see hooks.server.ts). The
// automatic background sync (src/lib/server/scheduler.ts) calls
// syncPrinterUsage() directly rather than hitting this endpoint, so it
// isn't affected by auth at all.
export const POST: RequestHandler = async () => {
	try {
		const result = await syncPrinterUsage();
		return json(result);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
