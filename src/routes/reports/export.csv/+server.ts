import type { RequestHandler } from './$types';
import { buildUsageReport } from '$lib/server/reporting';

function csvEscape(v: string | number): string {
	const s = String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET: RequestHandler = async ({ url }) => {
	const now = new Date();
	const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const from = fromParam ? new Date(fromParam) : defaultFrom;
	const to = toParam ? new Date(`${toParam}T23:59:59.999`) : now;

	const report = await buildUsageReport(from, to);

	const lines = [
		['Department Code', 'Department', 'Person', 'B&W Copies', 'Color Copies', 'Cost'].join(',')
	];
	for (const dept of report.departments) {
		for (const p of dept.people) {
			lines.push(
				[
					csvEscape(dept.departmentCode),
					csvEscape(dept.departmentLabel),
					csvEscape(p.name),
					csvEscape(p.bwCount),
					csvEscape(p.colorCount),
					csvEscape((p.costCents / 100).toFixed(2))
				].join(',')
			);
		}
	}
	lines.push(
		[
			'',
			'TOTAL',
			'',
			report.totalBwCount,
			report.totalColorCount,
			(report.totalCostCents / 100).toFixed(2)
		].join(',')
	);

	const rangeLabel = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
	return new Response(lines.join('\n') + '\n', {
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename="billing-report_${rangeLabel}.csv"`
		}
	});
};
