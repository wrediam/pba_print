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

// The gateway's IPP address *as client Macs reach it* on the LAN, e.g.
// "192.168.8.235:631" or "gateway.church.local:631". This is deliberately
// separate from GATEWAY_URL: GATEWAY_URL is how this dashboard's server
// talks to the control API (often a Docker-internal name like
// "gateway:8631"), which a staff Mac can't resolve. The control API can't
// reliably know its own externally-reachable name, so the client-facing
// print URI is built here from this value instead of trusting the
// "ipp://localhost:..." the control API returns. Falls back to the
// GATEWAY_URL host if unset (correct only when the gateway is reachable at
// the same host on 631).
const GATEWAY_PUBLIC_HOST =
	env.GATEWAY_PUBLIC_HOST ?? (GATEWAY_URL ? `${new URL(GATEWAY_URL).hostname}:631` : '');

export function isGatewayConfigured(): boolean {
	return Boolean(GATEWAY_URL);
}

/** The IPP URI a client Mac should point its local queue at for this queue name. */
export function clientPrintUri(queueName: string): string {
	return `ipp://${GATEWAY_PUBLIC_HOST}/printers/${queueName}`;
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
	const result = (await res.json()) as GatewayProvisionResult;
	// Override the control API's own "ipp://localhost:..." uri with the
	// LAN-reachable one a client Mac can actually use -- see clientPrintUri.
	if (result.status === 'ready' && result.queueName) {
		result.uri = clientPrintUri(result.queueName);
	}
	return result;
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

export interface GatewayQueueSummary {
	queueName: string;
	description: string;
	deviceUri: string;
	accepting: boolean;
	enabled: boolean;
	jclUserNumber: string | null;
}

/** Lists every queue the gateway owns, with its live state and baked-in code. */
export async function fetchGatewayQueues(): Promise<GatewayQueueSummary[]> {
	if (!GATEWAY_URL) return [];
	const res = await fetch(`${GATEWAY_URL}/queues`, { headers: authHeaders() });
	if (!res.ok) throw new Error(`Gateway /queues request failed: ${res.status}`);
	return (await res.json()) as GatewayQueueSummary[];
}

export interface GatewayActiveJob {
	queueName: string;
	jobId: string;
	user: string;
	sizeBytes: number | null;
	submittedAt: string;
}

/** The live queue: jobs accepted by the gateway but not yet finished at the copier. */
export async function fetchGatewayActiveJobs(): Promise<GatewayActiveJob[]> {
	if (!GATEWAY_URL) return [];
	const res = await fetch(`${GATEWAY_URL}/active-jobs`, { headers: authHeaders() });
	if (!res.ok) throw new Error(`Gateway /active-jobs request failed: ${res.status}`);
	return (await res.json()) as GatewayActiveJob[];
}

/** Recent cupsd error_log lines from the gateway. */
export async function fetchGatewayLogs(lines = 200): Promise<string[]> {
	if (!GATEWAY_URL) return [];
	const url = new URL(`${GATEWAY_URL}/logs`);
	url.searchParams.set('lines', String(lines));
	const res = await fetch(url, { headers: authHeaders() });
	if (!res.ok) throw new Error(`Gateway /logs request failed: ${res.status}`);
	return ((await res.json()) as { lines: string[] }).lines;
}

export interface GatewayHealth {
	reachable: boolean;
	error?: string;
}

/** Liveness check for the gateway's control API (its public GET /health). */
export async function checkGatewayHealth(): Promise<GatewayHealth> {
	if (!GATEWAY_URL) return { reachable: false, error: 'GATEWAY_URL not configured' };
	try {
		const res = await fetch(`${GATEWAY_URL}/health`);
		return { reachable: res.ok, error: res.ok ? undefined : `status ${res.status}` };
	} catch (err) {
		return { reachable: false, error: err instanceof Error ? err.message : String(err) };
	}
}
