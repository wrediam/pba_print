// Fetches the printer job log as CSV via the direct download endpoint
// instead of scraping the paginated HTML Job Log view. One request
// returns every record; columns are resolved by header name so new
// firmware columns don't shift offsets and break parsing.
//
// Endpoint:
//   /joblog_download.html?format=0&order=1&selectItem=<bitmask>&date=0&delAfterSave=0
//   format=0 → CSV, order=1 → ascending Job ID, date=0 → all dates.
//
// Session: still requires the admin login cookie set by PrinterClient.login().

import { APP_TIMEZONE, zonedWallTimeToUtc } from '$lib/server/tz';
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
	twoColorCount: number | null; // 2 Color Total Count, or null if N/A
	singleColorCount: number | null; // Single Color Total Count, or null if N/A
	result: string;
	errorCause: string | null; // null if N/A
	directAddress: string | null; // null if N/A
	colorSetting: string | null; // e.g. "Auto" | "B/W" | "Full Color", null if N/A
	paperSize: string | null; // null if N/A
	paperType: string | null; // e.g. "Plain Paper 1", null if N/A
	duplexSetup: string | null; // null if N/A
	resolution: string | null; // e.g. "600x600", null if N/A
	computerName: string | null; // sending PC hostname, null if N/A
	fileName: string | null; // document name, null if N/A / "No filing"
	outputMode: string | null; // "Sort" | "Group" | ..., null if N/A
	staple: string | null; // "No Staple" | "1 staple" | ..., null if N/A
	stapleCount: number | null;
	punch: string | null; // "No Punch" | ..., null if N/A
	punchCount: number | null;
	completedSets: number | null;
	completedPages: number | null;
	originalCount: number | null;
	originalSize: string | null; // null if N/A
}

// selectItem bitmask matches the "select all fields" default from the
// printer's own export UI. Only the columns we care about need to be
// present; extra columns are ignored by the name-based parser.
const CSV_PATH =
	'/joblog_download.html?format=0&order=1&selectItem=1101111111101111111111111111111111111111111101111111111111111111&date=0&delAfterSave=0';

// CSV column header → field we want. Every other column is ignored.
const WANTED_HEADERS: Record<string, keyof PrinterJobLogRow> = {
	'Job ID': 'printerJobId',
	'Job Mode': 'jobMode',
	'User Name': 'userName',
	'Login Name': 'loginName',
	'Starting Date & Time': 'startedAt',
	'Completing Date & Time': 'completedAt',
	'Black & White Total Count': 'bwCount',
	'Full Color Total Count': 'fullColorCount',
	'2-Color Total Count': 'twoColorCount',
	'Single Color Total Count': 'singleColorCount',
	Result: 'result',
	'Error Cause': 'errorCause',
	'Direct Address': 'directAddress',
	'Color Setting': 'colorSetting',
	'Paper Size': 'paperSize',
	'Paper Type': 'paperType',
	'Duplex Setup': 'duplexSetup',
	Resolution: 'resolution',
	'Computer Name': 'computerName',
	'File Name': 'fileName',
	Output: 'outputMode',
	Staple: 'staple',
	'Staple Count': 'stapleCount',
	Punch: 'punch',
	'Punch Count': 'punchCount',
	'Number of Completed Sets': 'completedSets',
	'Number of Completed Pages': 'completedPages',
	'Original Count': 'originalCount',
	'Original Size': 'originalSize'
};

// Minimal RFC-4180 CSV parser. Handles quoted fields (including embedded
// commas and doubled-quote escapes). Returns an array of rows, each row
// an array of unquoted field strings.
function parseCSV(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	// Strip BOM if present
	const src = text.startsWith('﻿') ? text.slice(1) : text;

	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (inQuotes) {
			if (c === '"' && src[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				inQuotes = false;
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n') {
			row.push(field);
			if (row.some((f) => f !== '')) rows.push(row);
			row = [];
			field = '';
		} else if (c !== '\r') {
			field += c;
		}
	}
	if (row.length > 0 || field !== '') {
		row.push(field);
		if (row.some((f) => f !== '')) rows.push(row);
	}
	return rows;
}

const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function parseDate(s: string): Date | null {
	const m = s.trim().match(NAIVE_DATETIME_RE);
	if (!m) return null;
	const [, y, mo, d, h, mi, se] = m.map(Number);
	return zonedWallTimeToUtc(y, mo, d, h, mi, se, APP_TIMEZONE);
}

function nullable(s: string): string | null {
	const t = s.trim();
	return t === 'N/A' || t === '' ? null : t;
}

function parseCount(s: string): number | null {
	const t = s.trim();
	if (t === 'N/A' || t === '') return null;
	return Number(t) || 0;
}

function parseCsvRows(csv: string): PrinterJobLogRow[] {
	const parsed = parseCSV(csv);
	if (parsed.length < 2) return [];

	// Build a map from header name to column index
	const headers = parsed[0];
	const colIdx: Partial<Record<keyof PrinterJobLogRow, number>> = {};
	for (let i = 0; i < headers.length; i++) {
		const field = WANTED_HEADERS[headers[i]];
		if (field) colIdx[field] = i;
	}

	const get = (row: string[], field: keyof PrinterJobLogRow) => {
		const i = colIdx[field];
		return i !== undefined ? (row[i] ?? '') : '';
	};

	const rows: PrinterJobLogRow[] = [];
	for (let i = 1; i < parsed.length; i++) {
		const cols = parsed[i];
		const idStr = get(cols, 'printerJobId').trim();
		if (!idStr || !/^\d+$/.test(idStr)) continue;

		const startedAt = parseDate(get(cols, 'startedAt'));
		if (!startedAt) continue;

		rows.push({
			printerJobId: Number(idStr),
			jobMode: get(cols, 'jobMode').trim(),
			userName: get(cols, 'userName').trim(),
			loginName: nullable(get(cols, 'loginName')),
			startedAt,
			completedAt: parseDate(get(cols, 'completedAt')),
			bwCount: parseCount(get(cols, 'bwCount')) ?? 0,
			fullColorCount: parseCount(get(cols, 'fullColorCount')) ?? 0,
			twoColorCount: parseCount(get(cols, 'twoColorCount')),
			singleColorCount: parseCount(get(cols, 'singleColorCount')),
			result: get(cols, 'result').trim(),
			errorCause: nullable(get(cols, 'errorCause')),
			directAddress: nullable(get(cols, 'directAddress')),
			colorSetting: nullable(get(cols, 'colorSetting')),
			paperSize: nullable(get(cols, 'paperSize')),
			paperType: nullable(get(cols, 'paperType')),
			duplexSetup: nullable(get(cols, 'duplexSetup')),
			resolution: nullable(get(cols, 'resolution')),
			computerName: nullable(get(cols, 'computerName')),
			fileName: nullable(get(cols, 'fileName')),
			outputMode: nullable(get(cols, 'outputMode')),
			staple: nullable(get(cols, 'staple')),
			stapleCount: parseCount(get(cols, 'stapleCount')),
			punch: nullable(get(cols, 'punch')),
			punchCount: parseCount(get(cols, 'punchCount')),
			completedSets: parseCount(get(cols, 'completedSets')),
			completedPages: parseCount(get(cols, 'completedPages')),
			originalCount: parseCount(get(cols, 'originalCount')),
			originalSize: nullable(get(cols, 'originalSize'))
		});
	}
	return rows;
}

/**
 * Downloads the full job log CSV and returns parsed rows. Pass
 * `stopAtOrBelowJobId` (the highest printerJobId already in the DB) to
 * filter out already-imported records -- same contract as before, just
 * applied as a post-filter instead of a mid-scrape early stop.
 */
export async function fetchJobLog(
	client: PrinterClient,
	stopAtOrBelowJobId = 0
): Promise<PrinterJobLogRow[]> {
	const csv = await client.get(CSV_PATH);
	const rows = parseCsvRows(csv);
	return stopAtOrBelowJobId > 0 ? rows.filter((r) => r.printerJobId > stopAtOrBelowJobId) : rows;
}
