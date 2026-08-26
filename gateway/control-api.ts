// Print gateway control API.
//
// Small, framework-free HTTP API (plain node:http) that this dashboard's
// server calls to provision CUPS queues and pull job history from the
// cupsd running in this same container. Kept dependency-free on purpose
// -- this container's whole job is to run cupsd reliably, so the control
// API shouldn't drag in a web framework and its own dependency surface.
//
// Every request (except GET /health) must carry
// `Authorization: Bearer <GATEWAY_SHARED_SECRET>` -- this API can create
// printer queues and reconfigure the copier's account codes, so it must
// not be reachable by anything on the LAN other than the dashboard.
//
// See gateway/README.md for the overall architecture this fits into.

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.CONTROL_API_PORT ?? 8631);
const SHARED_SECRET = process.env.GATEWAY_SHARED_SECRET ?? '';
const PRINTER_HOST = process.env.PRINTER_HOST ?? '192.168.1.222';
const PRINTER_PORT = process.env.PRINTER_RAW_PORT ?? '9100';
const PPD_PATH = process.env.PPD_PATH ?? '/opt/gateway/driver/Sharp-BP-71C65-ps.ppd';
const PAGE_LOG_PATH = process.env.PAGE_LOG_PATH ?? '/var/log/cups/page_log';

if (!SHARED_SECRET) {
	console.error('[gateway] GATEWAY_SHARED_SECRET is not set -- refusing to start.');
	process.exit(1);
}

// The real hardware configuration on the copier (see docs/ARCHITECTURE.md
// / the old macOS installer's add_profile_queue.sh, which this mirrors):
// Four Trays, Large Capacity Tray (BP-LC10), Saddle Stitch Finisher
// (Large Stacker), 3-Hole Punch Module, Job Separator on, Folding Unit
// off, Right Tray on, Data Security Kit on. Confirmed identical option
// names/values in this Linux PPD as the macOS one (same driver family).
const HARDWARE_OPTS = [
	'-o',
	'Option5=3TrayDrawer',
	'-o',
	'Option6=Installed',
	'-o',
	'Option1=LSSFinisher',
	'-o',
	'Option9=PModule33',
	'-o',
	'Option3=True',
	'-o',
	'Option7=False',
	'-o',
	'Option2=True',
	'-o',
	'Option4=True'
];

function sanitize(part: string): string {
	return part.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function queueNameFor(personCode: string, departmentCode: string): string {
	return `church_${sanitize(personCode)}_${sanitize(departmentCode)}`;
}

interface ProvisionRequest {
	personCode: string;
	departmentCode: string;
	departmentLabel?: string;
	colorMode?: 'CMBW' | 'CMAuto'; // defaults to CMBW -- see note in provisionQueue
}

interface ProvisionResult {
	queueName: string;
	uri: string;
	fullCode: string;
	status: 'ready' | 'error';
	error?: string;
}

/**
 * Creates (or re-provisions) one CUPS queue for a person+department
 * combo, with the account code and hardware config baked in as the
 * queue's own PPD defaults. Idempotent: safe to call again any time a
 * department's label changes, or just to re-verify an existing queue.
 */
async function provisionQueue(req: ProvisionRequest): Promise<ProvisionResult> {
	const { personCode, departmentCode, departmentLabel } = req;
	const fullCode = `${personCode}${departmentCode}`;
	const queueName = queueNameFor(personCode, departmentCode);
	const description = `Church Copier - ${departmentLabel ?? departmentCode} (person ${personCode})`;
	const deviceUri = `socket://${PRINTER_HOST}:${PRINTER_PORT}/`;

	// JCLUserNumber's PPD-defined parameter is a 5-8 character "passcode"
	// (see Sharp-BP-71C65-ps.ppd, *ParamCustomJCLUserNumber). Codes
	// outside that range would silently fail to embed, so this is
	// checked up front rather than discovered later as a mysteriously
	// unbilled department.
	if (fullCode.length < 5 || fullCode.length > 8) {
		return {
			queueName,
			uri: deviceUri,
			fullCode,
			status: 'error',
			error: `Combined code "${fullCode}" is ${fullCode.length} characters -- the printer's JCLUserNumber option only accepts 5-8.`
		};
	}

	try {
		// Remove and recreate rather than patch in place -- there are only
		// a handful of -o flags and this guarantees no stale option from a
		// previous provisioning attempt lingers.
		await execFileAsync('lpadmin', ['-x', queueName]).catch(() => {
			/* fine if it didn't exist yet */
		});

		await execFileAsync('lpadmin', [
			'-p',
			queueName,
			'-E',
			'-v',
			deviceUri,
			'-P',
			PPD_PATH,
			'-D',
			description,
			...HARDWARE_OPTS,
			'-o',
			`ARCMode=${req.colorMode ?? 'CMBW'}`,
			'-o',
			`JCLUserNumber=Custom.${fullCode}`
		]);

		// Share it so client Macs can add it as a driverless "IPP Everywhere"
		// printer without needing this PPD installed locally.
		await execFileAsync('lpadmin', ['-p', queueName, '-o', 'printer-is-shared=true']);

		// Verify the account code actually landed in the queue's own
		// compiled PPD rather than assuming the lpadmin call above worked
		// just because it exited 0 -- this is the exact class of bug (a
		// setting that "succeeds" without actually taking effect) that
		// motivated moving this off of client Macs in the first place.
		//
		// NOTE: `lpoptions -p <queue> -l` is NOT useful for this check --
		// for a parameterized "Custom" PPD option it always prints the
		// PPD's generic placeholder name (e.g. "Custom.PASSCODE"), not the
		// actual instantiated value, regardless of what's really set. The
		// real, currently-effective value only shows up in the queue's own
		// compiled PPD file on disk, which is what this reads instead.
		const ppdContent = await readFile(`/etc/cups/ppd/${queueName}.ppd`, 'utf-8').catch(() => '');
		const landed = ppdContent.includes(`*DefaultJCLUserNumber: Custom.${fullCode}`);
		if (!landed) {
			return {
				queueName,
				uri: deviceUri,
				fullCode,
				status: 'error',
				error: `Queue created, but *DefaultJCLUserNumber: Custom.${fullCode} was not found in the compiled PPD.`
			};
		}

		return { queueName, uri: `ipp://localhost:631/printers/${queueName}`, fullCode, status: 'ready' };
	} catch (err) {
		return {
			queueName,
			uri: deviceUri,
			fullCode,
			status: 'error',
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

async function removeQueue(personCode: string, departmentCode: string): Promise<void> {
	const queueName = queueNameFor(personCode, departmentCode);
	await execFileAsync('lpadmin', ['-x', queueName]).catch(() => {
		/* fine if it didn't exist */
	});
}

interface PageLogEntry {
	queueName: string;
	jobId: string;
	user: string;
	timestamp: string;
	pageNumber: number;
	copies: number;
}

/**
 * Parses CUPS's own structured page_log (one line per printed sheet:
 * `printer user job-id date-time page-number num-copies job-billing
 * host job-originating-user-name`) rather than scraping the copier's
 * HTML admin panel the way the old Sharp Job Log integration did --
 * this is data our own gateway wrote, in a documented format, not a
 * page a firmware update could silently reformat.
 *
 * NOTE: not yet validated against a real completed job on real
 * hardware -- see gateway/README.md. In particular, whether this alone
 * is enough for accurate B&W-vs-color billing, or whether that still
 * needs cross-checking against the printer's own accounting, is an
 * open question until tested for real.
 */
async function readPageLog(sinceIso: string | null): Promise<PageLogEntry[]> {
	let raw: string;
	try {
		raw = await readFile(PAGE_LOG_PATH, 'utf-8');
	} catch {
		return [];
	}

	const since = sinceIso ? new Date(sinceIso) : null;
	const entries: PageLogEntry[] = [];
	for (const line of raw.split('\n')) {
		if (!line.trim()) continue;
		const parts = line.split(' ');
		if (parts.length < 6) continue;
		const [queueName, user, jobId, date, , pageNumber, copies] = parts;
		// CUPS page_log dates look like "26/Aug/2026:14:32:10 -0500" split
		// across two space-separated tokens (date+time, then tz) -- rejoin.
		const tz = parts[4];
		const timestampRaw = `${date} ${tz}`.replace(/\[|\]/g, '');
		const timestamp = new Date(timestampRaw);
		if (since && !isNaN(timestamp.getTime()) && timestamp < since) continue;
		entries.push({
			queueName,
			user,
			jobId,
			timestamp: isNaN(timestamp.getTime()) ? timestampRaw : timestamp.toISOString(),
			pageNumber: Number(pageNumber) || 0,
			copies: Number(copies) || 1
		});
	}
	return entries;
}

function readBody(req: Parameters<Parameters<typeof createServer>[0]>[0]): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', (chunk) => (data += chunk));
		req.on('end', () => resolve(data));
		req.on('error', reject);
	});
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');

	if (url.pathname === '/health') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ ok: true }));
		return;
	}

	const auth = req.headers.authorization ?? '';
	if (auth !== `Bearer ${SHARED_SECRET}`) {
		res.writeHead(401, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: 'unauthorized' }));
		return;
	}

	try {
		if (req.method === 'POST' && url.pathname === '/queues') {
			const body = JSON.parse((await readBody(req)) || '{}') as ProvisionRequest;
			if (!body.personCode || !body.departmentCode) {
				res.writeHead(400, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ error: 'personCode and departmentCode are required' }));
				return;
			}
			const result = await provisionQueue(body);
			res.writeHead(result.status === 'ready' ? 200 : 422, { 'content-type': 'application/json' });
			res.end(JSON.stringify(result));
			return;
		}

		if (req.method === 'DELETE' && url.pathname === '/queues') {
			const personCode = url.searchParams.get('personCode');
			const departmentCode = url.searchParams.get('departmentCode');
			if (!personCode || !departmentCode) {
				res.writeHead(400, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ error: 'personCode and departmentCode query params are required' }));
				return;
			}
			await removeQueue(personCode, departmentCode);
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.method === 'GET' && url.pathname === '/jobs') {
			const since = url.searchParams.get('since');
			const entries = await readPageLog(since);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(entries));
			return;
		}

		res.writeHead(404, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: 'not found' }));
	} catch (err) {
		console.error('[gateway] request failed:', err);
		res.writeHead(500, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
	}
});

server.listen(PORT, () => {
	console.log(`[gateway] control API listening on :${PORT}`);
});
