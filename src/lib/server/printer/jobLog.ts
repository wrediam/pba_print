// Parses the printer's "Quick Job Log View" (System Settings > System
// Control > Job Log > View Job Log > "Quick Job Log View(G)" button),
// paginating through as much history as needed.
//
// !! VERIFY BEFORE TRUSTING FOR REAL BILLING !!
// The quick view returns a fixed set of columns without letting us pick
// them explicitly. Based on jobs observed during development, the 4
// numeric columns appear in this order:
//   [[Total Count]], [[Black & White Total Count]], [[Full Color Total
//   Count]], [[a 4th column, unconfirmed -- possibly a specific color
//   mode subtotal]]
// This was inferred from a handful of real jobs (a 4-page Copy job
// showed "4" in the 2nd position; a 596-page admin Print job showed 596
// in the 1st position with the rest 0) -- consistent with that ordering,
// but NOT confirmed against a job of deliberately known B&W vs. color
// content. Before trusting this for a real invoice, either (a) print a
// deliberately-color test page and a deliberately-B&W one and confirm
// which column moves, or (b) switch to the full "Select Item" column
// picker on the View Job Log page and request Black & White Total Count
// / Full Color Total Count by name instead of by position.

import type { PrinterClient } from './client';

export interface PrinterJobLogRow {
	printerJobId: number;
	jobMode: string;
	computerName: string;
	accountCode: string | null; // null when the printer logged "N/A"
	startedAt: Date;
	completedAt: Date | null;
	totalCount: number;
	bwCount: number;
	colorCount: number;
	unconfirmedFourthCount: number;
	result: string;
}

const ROW_RE =
	/<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g;

// Hidden inputs on this printer's pages appear in two different
// attribute orders -- token1/token2/action/ordinate as
// `type="hidden" name="X" value="Y"`, but the ~70 ggt_checkbox/
// ggt_radio/ggt_selhidden column-selection fields as
// `name="X" type="hidden" value="Y"` (name before type). Matching the
// whole tag first and pulling name/value out of it, order-independent,
// catches both -- an earlier version only matched the first ordering
// and silently dropped most of the form state, which broke pagination.
const HIDDEN_TAG_RE = /<input\s+[^>]*type="hidden"[^>]*>/g;
const NAME_ATTR_RE = /name\s*=\s*"([^"]+)"/;
const VALUE_ATTR_RE = /value\s*=\s*"([^"]*)"/;
const SELECT_RE = /<select\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g;
const OPTION_SELECTED_RE = /<option\s+value="([^"]*)"\s+selected/;

/**
 * Pulls every current hidden field and every select's currently-chosen
 * option out of a page, so a follow-up POST (e.g. clicking "Next") can
 * echo the entire form state back unchanged except for whatever we're
 * deliberately overriding. This printer's pages require the full state
 * to be resubmitted or pagination silently doesn't advance -- confirmed
 * necessary the hard way earlier in this project (see account_userlist
 * scraping notes).
 */
function extractFormState(html: string): Record<string, string> {
	const state: Record<string, string> = {};
	for (const tag of html.match(HIDDEN_TAG_RE) ?? []) {
		const name = tag.match(NAME_ATTR_RE)?.[1];
		const value = tag.match(VALUE_ATTR_RE)?.[1] ?? '';
		if (name) state[name] = value;
	}
	for (const m of html.matchAll(SELECT_RE)) {
		const [, name, body] = m;
		const selected = body.match(OPTION_SELECTED_RE);
		if (selected) state[name] = selected[1];
	}
	return state;
}

function isNextDisabled(html: string): boolean {
	const m = html.match(/<input name="nextbtn"[^>]*>/);
	return !m || m[0].includes('disabled');
}

function decodeEntities(s: string): string {
	return s
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.trim();
}

function parseDate(s: string): Date | null {
	const t = s.trim();
	if (!t) return null;
	// Printer emits e.g. "2026-08-12T15:20:42" (local time, no timezone).
	const d = new Date(t);
	return Number.isNaN(d.getTime()) ? null : d;
}

function parseRows(html: string): PrinterJobLogRow[] {
	const rows: PrinterJobLogRow[] = [];
	for (const m of html.matchAll(ROW_RE)) {
		const [, id, jobMode, computerName, account, started, completed, c0, c1, c2, c3, result] = m;
		const startedAt = parseDate(started);
		if (!startedAt) continue;
		rows.push({
			printerJobId: Number(id),
			jobMode: decodeEntities(jobMode),
			computerName: decodeEntities(computerName),
			accountCode: decodeEntities(account) === 'N/A' ? null : decodeEntities(account),
			startedAt,
			completedAt: parseDate(completed),
			totalCount: Number(c0) || 0,
			bwCount: Number(c1) || 0,
			colorCount: Number(c2) || 0,
			unconfirmedFourthCount: Number(c3) || 0,
			result: decodeEntities(result)
		});
	}
	return rows;
}

const MAX_PAGES = 200; // safety cap -- at 500/page that's 100,000 jobs, far more than this log will ever hold

/**
 * Fetches the Job Log, paginating as needed. Jobs are sorted newest-
 * first by default, which this relies on: pass `stopAtOrBelowJobId` (the
 * highest printerJobId already imported) to stop paginating as soon as
 * a page's jobs drop to or below that ID, rather than re-walking the
 * entire history on every sync. Omit it (or pass 0) to pull everything
 * available -- used for the very first sync against an empty database.
 */
export async function fetchJobLog(
	client: PrinterClient,
	stopAtOrBelowJobId = 0
): Promise<PrinterJobLogRow[]> {
	// Land on the Quick Job Log View, then bump "Display Items" to its max
	// (500) so a several-thousand-entry log only takes a handful of pages
	// instead of hundreds at the default 10/page.
	let html = await client.submitForm('/sysmgt_joblog_view.html', {
		JoblogSelectWebChange: '',
		action: 'simpledisplaybtn'
	});
	let state = extractFormState(html);
	state['ggt_select(118)'] = '5'; // 500 items
	html = await client.post('/sysmgt_joblog_view.html', { ...state, action: 'ggt_select(118)' });

	const allRows: PrinterJobLogRow[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const rows = parseRows(html);
		if (rows.length === 0) break;
		allRows.push(...rows);

		const reachedKnownJobs =
			stopAtOrBelowJobId > 0 && rows.every((r) => r.printerJobId <= stopAtOrBelowJobId);
		if (reachedKnownJobs || isNextDisabled(html)) break;

		state = extractFormState(html);
		html = await client.post('/sysmgt_joblog_view.html', { ...state, action: 'nextbtn' });
	}

	if (stopAtOrBelowJobId > 0) {
		return allRows.filter((r) => r.printerJobId > stopAtOrBelowJobId);
	}
	return allRows;
}
