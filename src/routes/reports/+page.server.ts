import type { PageServerLoad } from './$types';
import { buildUsageReport } from '$lib/server/reporting';

export const load: PageServerLoad = async ({ url }) => {
	const now = new Date();
	const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);

	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const from = fromParam ? new Date(fromParam) : defaultFrom;
	const to = toParam ? new Date(`${toParam}T23:59:59.999`) : now;

	const report = await buildUsageReport(from, to);
	return {
		report,
		fromInput: from.toISOString().slice(0, 10),
		toInput: to.toISOString().slice(0, 10)
	};
};
