// Parses the printer's "Quick Job Log View" (System Settings > System
// Control > Job Log > View Job Log > "Quick Job Log View(G)" button).
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
// / Full Color Total Count by name instead of by position. See
// PrinterClient.submitForm -- it already extracts token1/token2/hidden
// fields generically, so wiring up the specific checkbox names for that
// form is the only piece missing.

import { PrinterClient } from './client';

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

/** Fetches and parses the current Job Log via the Quick Job Log View button. */
export async function fetchJobLog(client: PrinterClient): Promise<PrinterJobLogRow[]> {
	const html = await client.submitForm('/sysmgt_joblog_view.html', {
		JoblogSelectWebChange: '',
		action: 'simpledisplaybtn'
	});

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
