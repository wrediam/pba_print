// Shared timezone helpers. The server process itself typically runs on
// UTC (that's the default for this app's Docker image), but the church
// -- and the printer whose naive, zone-less timestamps we import -- are
// in their own local timezone. Anywhere this app reasons about "today"
// or "this month" (report date-range defaults, the dashboard's
// current-month summary, parsing the printer's Job Log timestamps)
// needs to go through APP_TIMEZONE rather than the process's own
// timezone, or it'll silently drift by the church's UTC offset.

import { env } from '$env/dynamic/private';

export const APP_TIMEZONE = env.PRINTER_TIMEZONE ?? 'America/Chicago';

/**
 * How far a wall-clock reading in `timeZone` is from UTC at the given
 * instant, in ms (e.g. -5h for America/Chicago during CDT). Standard
 * "format the instant in the target zone, diff against the instant
 * itself" trick -- avoids pulling in a timezone library for one lookup.
 */
function tzOffsetMs(timeZone: string, instant: Date): number {
	const parts: Record<string, string> = {};
	for (const p of new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(instant)) {
		if (p.type !== 'literal') parts[p.type] = p.value;
	}
	const asUtc = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second)
	);
	return asUtc - instant.getTime();
}

/** Converts wall-clock components in `timeZone` to the UTC instant they represent. */
export function zonedWallTimeToUtc(
	y: number,
	mo: number,
	d: number,
	h = 0,
	mi = 0,
	s = 0,
	timeZone: string = APP_TIMEZONE
): Date {
	// Treat the wall-clock reading as if it were UTC, then correct by
	// that same instant's actual offset from `timeZone`. Using the guess
	// itself (rather than "now") to look up the offset keeps this
	// correct across DST transitions for dates other than today too.
	const guess = Date.UTC(y, mo - 1, d, h, mi, s);
	return new Date(guess - tzOffsetMs(timeZone, new Date(guess)));
}

/** Wall-clock date/time components of `instant` as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string = APP_TIMEZONE) {
	const parts: Record<string, string> = {};
	for (const p of new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(instant)) {
		if (p.type !== 'literal') parts[p.type] = p.value;
	}
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		second: Number(parts.second)
	};
}

/** Start of the calendar month containing `instant`, as measured in `timeZone`. */
export function startOfMonthInZone(instant: Date, timeZone: string = APP_TIMEZONE): Date {
	const { year, month } = zonedParts(instant, timeZone);
	return zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a "YYYY-MM-DD" input as midnight of that day in `timeZone`. */
export function startOfDayInZone(dateOnly: string, timeZone: string = APP_TIMEZONE): Date | null {
	const m = dateOnly.match(DATE_ONLY_RE);
	if (!m) return null;
	const [, y, mo, d] = m.map(Number);
	return zonedWallTimeToUtc(y, mo, d, 0, 0, 0, timeZone);
}

/** Parses a "YYYY-MM-DD" input as the last instant of that day in `timeZone`. */
export function endOfDayInZone(dateOnly: string, timeZone: string = APP_TIMEZONE): Date | null {
	const m = dateOnly.match(DATE_ONLY_RE);
	if (!m) return null;
	const [, y, mo, d] = m.map(Number);
	return zonedWallTimeToUtc(y, mo, d, 23, 59, 59, timeZone);
}

/** Formats a UTC instant as the "YYYY-MM-DD" it falls on in `timeZone`, for date inputs/filenames. */
export function toDateInput(instant: Date, timeZone: string = APP_TIMEZONE): string {
	const { year, month, day } = zonedParts(instant, timeZone);
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves the `from`/`to` query params any of the reporting pages
 * accept into a concrete date range, defaulting to the current calendar
 * month (in APP_TIMEZONE) when either is missing or unparseable --
 * that default is what makes the Dashboard "always start on this
 * month" while still being changeable via the same params Reports/CSV
 * export use.
 */
export function resolveDateRange(url: URL): { from: Date; to: Date } {
	const now = new Date();
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const from = (fromParam && startOfDayInZone(fromParam)) || startOfMonthInZone(now);
	const to = (toParam && endOfDayInZone(toParam)) || now;
	return { from, to };
}
