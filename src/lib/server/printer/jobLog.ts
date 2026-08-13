// Parses the printer's "Quick Job Log View" (System Settings > System
// Control > Job Log > View Job Log > "Quick Job Log View(G)" button),
// paginating through as much history as needed.
//
// Column mapping confirmed directly against the printer's own table
// headers (`<th>` cells on the Job Log page), not inferred from sample
// data -- see the two-row header:
//   Job ID | Job Mode | User Name | Login Name | Date [Start, Complete]
//   | Total Count [Black & White, Full Color, 2 Color, Single Color]
//   | Result | Error Cause | Image Send Related Item [Direct Address]
//   | Common Functionality [Color Setting] | Paper Select [Size]
//   | Duplex Setup
// That's 16 <td> cells per row, in that exact order. "Total Count" is
// only a group heading over the 4 count columns -- there's no separate
// overall total cell, so callers sum whichever of the 4 apply.

import type { PrinterClient } from './client';

export interface PrinterJobLogRow {
	printerJobId: number;
	jobMode: string;
	userName: string; // printer's "User Name" -- friendly display name
	loginName: string | null; // printer's "Login Name" -- the code typed in, or null if "N/A"
	startedAt: Date;
	completedAt: Date | null;
	bwCount: number; // Black & White Total Count
	fullColorCount: number; // Full Color Total Count
	twoColorCount: number | null; // 2 Color Total Count, or null if "N/A" (not applicable to this job mode)
	singleColorCount: number | null; // Single Color Total Count, or null if "N/A"
	result: string;
	errorCause: string | null; // null if "N/A"
	directAddress: string | null; // "Image Send Related Item" -- null if "N/A"
	colorSetting: string | null; // "Common Functionality" -- e.g. "Auto" | "B/W" | "Full Color"
	paperSize: string | null; // "Paper Select" -- null if "N/A"
	duplexSetup: string | null; // null if "N/A"
}

const ROW_RE =
	/<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g;

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

/** Decodes entities and normalizes the printer's "N/A" placeholder to null. */
function decodeOrNull(s: string): string | null {
	const decoded = decodeEntities(s);
	return decoded === 'N/A' ? null : decoded;
}

/** Parses one of the 4 count columns: "N/A" means not applicable to this job's mode, not zero. */
function parseCount(s: string): number | null {
	const t = s.trim();
	if (t === 'N/A') return null;
	return Number(t) || 0;
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
		const [
			,
			id,
			jobMode,
			userName,
			loginName,
			started,
			completed,
			bw,
			fullColor,
			twoColor,
			singleColor,
			result,
			errorCause,
			directAddress,
			colorSetting,
			paperSize,
			duplexSetup
		] = m;
		const startedAt = parseDate(started);
		if (!startedAt) continue;
		rows.push({
			printerJobId: Number(id),
			jobMode: decodeEntities(jobMode),
			userName: decodeEntities(userName),
			loginName: decodeOrNull(loginName),
			startedAt,
			completedAt: parseDate(completed),
			bwCount: parseCount(bw) ?? 0,
			fullColorCount: parseCount(fullColor) ?? 0,
			twoColorCount: parseCount(twoColor),
			singleColorCount: parseCount(singleColor),
			result: decodeEntities(result),
			errorCause: decodeOrNull(errorCause),
			directAddress: decodeOrNull(directAddress),
			colorSetting: decodeOrNull(colorSetting),
			paperSize: decodeOrNull(paperSize),
			duplexSetup: decodeOrNull(duplexSetup)
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
