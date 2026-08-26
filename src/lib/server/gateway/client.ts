// HTTP client for the print gateway's control API (see gateway/control-api.ts).
//
// GATEWAY_URL is intentionally optional -- if it's unset, every function
// here either no-ops or reports "skipped" rather than throwing, so this
// app keeps working (on the old Sharp-Job-Log-scraping path) for
// deployments that haven't stood up a gateway yet. See
// docs/GATEWAY_MIGRATION.md for the migration story.

import { env } from '$env/dynamic/private';

const GATEWAY_URL = env.GATEWAY_URL; // e.g. "http://gateway:8631" -- no trailing slash
const GATEWAY_SHARED_SECRET = env.GATEWAY_SHARED_SECRET ?? '';

export function isGatewayConfigured(): boolean {
	return Boolean(GATEWAY_URL);
}

function authHeaders(): Record<string, string> {
	return { authorization: `Bearer ${GATEWAY_SHARED_SECRET}` };
}

export interface GatewayProvisionResult {
	queueName: string;
	uri: string;
	fullCode: string;
	status: 'ready' | 'error';
	error?: string;
}

/** Creates or re-provisions the gateway queue for one person+department combo. */
export async function provisionGatewayQueue(
	personCode: string,
	departmentCode: string,
	departmentLabel: string
): Promise<GatewayProvisionResult> {
	if (!GATEWAY_URL) throw new Error('GATEWAY_URL is not configured');
	const res = await fetch(`${GATEWAY_URL}/queues`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ personCode, departmentCode, departmentLabel })
	});
	// The control API returns 200 for status "ready" and 422 for status
	// "error" (a validation/verification failure it already explains in
	// the body) -- both are valid JSON responses worth returning as-is
	// rather than throwing, so callers can show the actual error.
	return (await res.json()) as GatewayProvisionResult;
}

/** Deletes a person+department queue from the gateway, if it exists. */
export async function removeGatewayQueue(personCode: string, departmentCode: string): Promise<void> {
	if (!GATEWAY_URL) return;
	const url = new URL(`${GATEWAY_URL}/queues`);
	url.searchParams.set('personCode', personCode);
	url.searchParams.set('departmentCode', departmentCode);
	await fetch(url, { method: 'DELETE', headers: authHeaders() });
}

export interface GatewayJobEntry {
	queueName: string;
	user: string;
	jobId: string;
	timestamp: string;
	pageNumber: number;
	copies: number;
}

/** Pulls page_log entries from the gateway, optionally since a given ISO timestamp. */
export async function fetchGatewayJobs(sinceIso: string | null): Promise<GatewayJobEntry[]> {
	if (!GATEWAY_URL) return [];
	const url = new URL(`${GATEWAY_URL}/jobs`);
	if (sinceIso) url.searchParams.set('since', sinceIso);
	const res = await fetch(url, { headers: authHeaders() });
	if (!res.ok) throw new Error(`Gateway /jobs request failed: ${res.status}`);
	return (await res.json()) as GatewayJobEntry[];
}
