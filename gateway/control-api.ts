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
	colorMode?: 'CMBW' | 'CMAuto' | 'CMColor'; // defaults to CMAuto -- see note in provisionQueue
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
			// ARCMode is the account's *color restriction*, not the per-job
			// color choice:
			//   CMAuto -- (the PPD's own default) let each job carry color
			//             only when the user explicitly selects it in the
			//             print dialog. This is the standing decision: every
			//             department gets color.
			//   CMBW   -- force mono regardless of the dialog (still passable
			//             per-queue via colorMode for a mono-only department).
			// IMPORTANT copier-side dependency: the copier enforces a
			// per-department *color authority*. A CMAuto job that asks for
			// color from a department NOT granted color authority is rejected
			// outright with Sharp error 0435 (documented from the field in the
			// macOS installer's add_profile_queue.sh). Defaulting to CMAuto
			// assumes the office has granted color authority to every
			// department on the copier -- if one is left mono-only there,
			// pass colorMode:'CMBW' for its queue so its color jobs don't 0435.
			'-o',
			`ARCMode=${req.colorMode ?? 'CMAuto'}`,
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

interface QueueSummary {
	queueName: string;
	description: string;
	deviceUri: string;
	accepting: boolean;
	enabled: boolean;
	jclUserNumber: string | null; // the account code baked into the queue, read from its compiled PPD
}

/**
 * Lists every church_* queue this gateway owns, with the live enabled/
 * accepting state from cupsd and the account code read back out of each
 * queue's own compiled PPD -- the same authoritative source provisionQueue
 * verifies against (lpoptions can't report a parameterized Custom value).
 * Powers the dashboard's "Gateway" page so the office can see, at a glance,
 * which queues exist and what code each carries, without shelling into the
 * container.
 */
async function listQueues(): Promise<QueueSummary[]> {
	// `lpstat -l -p` prints, per printer: a "printer <name> is idle/…" line
	// (with "enabled"/"disabled") plus indented detail lines. `-v` gives the
	// device-uri. We only care about our own church_* queues.
	const { stdout: pStdout } = await execFileAsync('lpstat', ['-l', '-p']).catch(() => ({
		stdout: ''
	}));
	const { stdout: vStdout } = await execFileAsync('lpstat', ['-v']).catch(() => ({ stdout: '' }));
	const { stdout: aStdout } = await execFileAsync('lpstat', ['-a']).catch(() => ({ stdout: '' }));

	const uriByQueue = new Map<string, string>();
	for (const line of vStdout.split('\n')) {
		// "device for church_598_61: socket://192.168.1.222:9100/"
		const m = line.match(/^device for (\S+): (.+)$/);
		if (m) uriByQueue.set(m[1], m[2]);
	}
	const acceptingQueues = new Set<string>();
	for (const line of aStdout.split('\n')) {
		// "church_598_61 accepting requests since …"
		const m = line.match(/^(\S+) accepting requests/);
		if (m) acceptingQueues.add(m[1]);
	}

	const summaries: QueueSummary[] = [];
	// Split the -l -p output on each "printer <name>" header.
	const blocks = pStdout.split(/\n(?=printer )/);
	for (const block of blocks) {
		const header = block.match(/^printer (\S+) is (\S+)/);
		if (!header) continue;
		const queueName = header[1];
		if (!queueName.startsWith('church_')) continue;
		const enabled = !/is disabled/.test(block) && !/disabled since/.test(block);
		const descMatch = block.match(/Description:\s*(.+)/);
		const ppdContent = await readFile(`/etc/cups/ppd/${queueName}.ppd`, 'utf-8').catch(() => '');
		const codeMatch = ppdContent.match(/\*DefaultJCLUserNumber:\s*Custom\.(\S+)/);
		summaries.push({
			queueName,
			description: descMatch ? descMatch[1].trim() : '',
			deviceUri: uriByQueue.get(queueName) ?? '',
			accepting: acceptingQueues.has(queueName),
			enabled,
			jclUserNumber: codeMatch ? codeMatch[1] : null
		});
	}
	return summaries;
}

interface ActiveJob {
	queueName: string;
	jobId: string;
	user: string;
	sizeBytes: number | null;
	submittedAt: string;
}

/**
 * The live print queue: jobs currently pending/printing on the gateway
 * (i.e. accepted from a Mac but not yet finished at the copier). This is
 * the "queue of jobs sent to the gateway" the dashboard shows -- distinct
 * from readPageLog(), which is the history of already-printed pages.
 */
async function listActiveJobs(): Promise<ActiveJob[]> {
	// `lpstat -o` lists queued jobs: "church_598_61-42  will  10240  Tue 26 Aug …"
	const { stdout } = await execFileAsync('lpstat', ['-o']).catch(() => ({ stdout: '' }));
	const jobs: ActiveJob[] = [];
	for (const line of stdout.split('\n')) {
		if (!line.trim()) continue;
		// job-id is "<queue>-<num>"; split the queue name back off the front.
		const m = line.match(/^(\S+?)-(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
		if (!m) continue;
		const [, queueName, num, user, size, submitted] = m;
		jobs.push({
			queueName,
			jobId: `${queueName}-${num}`,
			user,
			sizeBytes: Number(size) || null,
			submittedAt: submitted.trim()
		});
	}
	return jobs;
}

const ERROR_LOG_PATH = process.env.ERROR_LOG_PATH ?? '/var/log/cups/error_log';

/**
 * Tails the tail of cupsd's error_log so the dashboard can show recent
 * gateway activity/problems without anyone shelling into the container.
 * Bounded to the last `lines` entries so this never returns a huge payload.
 */
async function readRecentLog(lines: number): Promise<string[]> {
	let raw: string;
	try {
		raw = await readFile(ERROR_LOG_PATH, 'utf-8');
	} catch {
		return [];
	}
	return raw
		.split('\n')
		.filter((l) => l.trim())
		.slice(-lines);
}

/**
 * The error_log lines relevant to one queue -- its per-job activity
 * (queued / sent / completed / failed-with-reason). CUPS references jobs as
 * "[Job N]" and logs which queue each was "queued on", so we first collect
 * the job ids that belong to this queue (from lines naming it), then keep
 * every line that names the queue OR one of those jobs. Best-effort; the
 * dashboard shows it as "recent activity for this queue".
 */
async function readQueueLog(queue: string, lines: number): Promise<string[]> {
	let raw: string;
	try {
		raw = await readFile(ERROR_LOG_PATH, 'utf-8');
	} catch {
		return [];
	}
	const all = raw.split('\n').filter((l) => l.trim());

	// Job ids seen on the same line as this queue name.
	const jobIds = new Set<string>();
	for (const line of all) {
		if (!line.includes(queue)) continue;
		const m = line.match(/Job (\d+)/i);
		if (m) jobIds.add(m[1]);
	}

	const relevant = all.filter((line) => {
		if (line.includes(queue)) return true;
		const m = line.match(/\[Job (\d+)\]/i);
		return m ? jobIds.has(m[1]) : false;
	});
	return relevant.slice(-lines);
}

interface GatewayJob {
	queueName: string;
	jobId: string; // the CUPS job id (unique per queue)
	user: string;
	jobName: string;
	completedAt: string; // ISO8601
	impressions: number; // total pages printed for the job (pages x copies)
}

const CLF_MONTHS: Record<string, number> = {
	Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
	Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

// Parses a CLF timestamp like "27/Aug/2026:13:36:36 +0000" (CUPS %T, with
// the surrounding brackets already stripped) into a Date. Returns null if
// it doesn't match.
function parseClf(s: string): Date | null {
	const m = s.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})/);
	if (!m) return null;
	const [, dd, mon, yyyy, HH, MM, SS, tz] = m;
	const month = CLF_MONTHS[mon];
	if (month === undefined) return null;
	const offMin = (tz[0] === '-' ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
	return new Date(Date.UTC(+yyyy, month, +dd, +HH, +MM, +SS) - offMin * 60000);
}

/**
 * Reads the gateway's own page_log -- the authoritative record of what went
 * through the gateway -- and returns one record per completed job. CUPS
 * writes a "total" summary line per job (see PageLogFormat in cupsd.conf):
 *   printer  cups-job-id  user  total  <pages>  [%T]  job-name
 * We key off that line: `pages` is the job's total impressions, and %T is
 * its completion time. (Any per-page lines are ignored so we don't double
 * count.)
 *
 * This is what the dashboard bills gateway jobs from: it attributes them by
 * the queue they arrived on (queue -> person+department), so it never
 * depends on the printer echoing the account code back. The B&W/color split
 * is filled in dashboard-side from the printer's own Job Log (the gateway
 * can't see color -- it just streams PostScript through).
 */
async function readPageLog(sinceIso: string | null): Promise<GatewayJob[]> {
	let raw: string;
	try {
		raw = await readFile(PAGE_LOG_PATH, 'utf-8');
	} catch {
		return [];
	}

	const since = sinceIso ? new Date(sinceIso).getTime() : null;
	const out: GatewayJob[] = [];

	for (const rawLine of raw.split('\n')) {
		// Some CUPS builds wrap the line in quotes -- strip them.
		const line = rawLine.trim().replace(/^"|"$/g, '');
		if (!line) continue;
		const parts = line.split(' ');
		if (parts.length < 7) continue;
		const [queueName, jobId, user, pageNum, copies, dateTok, tzTok] = parts;
		// Only the per-job "total" summary line; skip individual page lines.
		if (pageNum !== 'total') continue;
		const completed = parseClf(`${dateTok} ${tzTok}`.replace(/[[\]]/g, ''));
		if (!completed) continue;
		if (since !== null && completed.getTime() < since) continue;
		out.push({
			queueName,
			jobId,
			user,
			jobName: parts.slice(7).join(' ') || '(untitled)',
			completedAt: completed.toISOString(),
			impressions: Number(copies) || 0
		});
	}

	// Oldest first, so the dashboard imports in job order.
	out.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
	return out;
}

/**
 * A one-shot troubleshooting dump: the raw tails of page_log and error_log,
 * the effective PageLogFormat, and lpstat's view of queues/jobs. Lets us
 * debug what's actually happening on the gateway from the dashboard (or a
 * curl) without shelling into the container each time.
 */
async function debugDump() {
	const tail = async (p: string, n: number) =>
		(await readFile(p, 'utf-8').catch(() => ''))
			.split('\n')
			.filter((l) => l.trim())
			.slice(-n);
	const run = async (cmd: string, args: string[]) =>
		(await execFileAsync(cmd, args).catch((e) => ({ stdout: String(e) }))).stdout.trim();
	const cupsdConf = await readFile('/etc/cups/cupsd.conf', 'utf-8').catch(() => '');
	return {
		pageLogFormat: cupsdConf.split('\n').filter((l) => /PageLogFormat/i.test(l)),
		pageLogTail: await tail(PAGE_LOG_PATH, 50),
		errorLogTail: await tail(ERROR_LOG_PATH, 80),
		completedJobs: await run('lpstat', ['-W', 'completed', '-o']),
		queues: await run('lpstat', ['-v']),
		printers: await run('lpstat', ['-p'])
	};
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
			const queue = url.searchParams.get('queue');
			let entries = await readPageLog(since);
			if (queue) entries = entries.filter((e) => e.queueName === queue);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(entries));
			return;
		}

		// Provisioned queues + their live state and baked-in account codes.
		if (req.method === 'GET' && url.pathname === '/queues') {
			const queues = await listQueues();
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(queues));
			return;
		}

		// The live queue: jobs accepted but not yet finished at the copier.
		if (req.method === 'GET' && url.pathname === '/active-jobs') {
			const jobs = await listActiveJobs();
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(jobs));
			return;
		}

		// One-shot troubleshooting dump (page_log/error_log tails + lpstat).
		if (req.method === 'GET' && url.pathname === '/debug') {
			const dump = await debugDump();
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(dump, null, 2));
			return;
		}

		// Recent cupsd error_log lines, for the dashboard's "what's going on".
		// With ?queue=<name>, just that queue's job activity.
		if (req.method === 'GET' && url.pathname === '/logs') {
			const lines = Math.min(Number(url.searchParams.get('lines')) || 200, 1000);
			const queue = url.searchParams.get('queue');
			const log = queue ? await readQueueLog(queue, lines) : await readRecentLog(lines);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ lines: log }));
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
