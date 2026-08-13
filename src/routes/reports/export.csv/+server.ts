import type { RequestHandler } from './$types';
import { buildUsageReport } from '$lib/server/reporting';
import { resolveDateRange, toDateInput } from '$lib/server/tz';

function csvEscape(v: string | number): string {
	const s = String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET: RequestHandler = async ({ url }) => {
	// Same timezone handling and defaulting as /reports -- see resolveDateRange.
	const { from, to } = resolveDateRange(url);

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

	const rangeLabel = `${toDateInput(from)}_to_${toDateInput(to)}`;
	return new Response(lines.join('\n') + '\n', {
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename="billing-report_${rangeLabel}.csv"`
		}
	});
};
