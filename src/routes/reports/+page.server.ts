import type { PageServerLoad } from './$types';
import { buildUsageReport } from '$lib/server/reporting';
import { resolveDateRange, toDateInput } from '$lib/server/tz';

export const load: PageServerLoad = async ({ url }) => {
	// Defaults to the current calendar month (in the church's own
	// timezone, not necessarily the server's) if no from/to params are
	// given -- see resolveDateRange.
	const { from, to } = resolveDateRange(url);

	const report = await buildUsageReport(from, to);
	return {
		report,
		fromInput: toDateInput(from),
		toInput: toDateInput(to)
	};
};
