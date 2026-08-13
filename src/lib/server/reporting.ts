import { db } from '$lib/server/db';
import { department, person, printJob, rate } from '$lib/server/db/schema';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

export interface DepartmentUsage {
	departmentId: number | null;
	departmentCode: string;
	departmentLabel: string;
	bwCount: number;
	colorCount: number;
	copierCostCents: number;
	paperCostCents: number;
	costCents: number;
	people: {
		personId: number | null;
		name: string;
		bwCount: number;
		colorCount: number;
		copierCostCents: number;
		paperCostCents: number;
		costCents: number;
	}[];
}

export interface UsageReport {
	from: Date;
	to: Date;
	departments: DepartmentUsage[];
	totalBwCount: number;
	totalColorCount: number;
	totalCopierCostCents: number;
	totalPaperCostCents: number;
	totalCostCents: number;
}

/** Finds whichever rate was in effect on the given date. Rates are sorted ascending by effectiveFrom by the caller. */
function rateAt(
	rates: { bwCostCents: number; colorCostCents: number; paperCostCents: number; effectiveFrom: Date }[],
	date: Date
) {
	let current = rates[0];
	for (const r of rates) {
		if (r.effectiveFrom.getTime() <= date.getTime()) current = r;
		else break;
	}
	return current;
}

/** Builds a department/person usage + cost breakdown for jobs started within [from, to]. */
export async function buildUsageReport(from: Date, to: Date): Promise<UsageReport> {
	const rates = await db
		.select({
			bwCostCents: rate.bwCostCents,
			colorCostCents: rate.colorCostCents,
			paperCostCents: rate.paperCostCents,
			effectiveFrom: rate.effectiveFrom
		})
		.from(rate)
		.orderBy(asc(rate.effectiveFrom));

	const jobs = await db
		.select({
			departmentId: printJob.departmentId,
			departmentCode: department.code,
			departmentLabel: department.label,
			personId: printJob.personId,
			personName: person.name,
			bwCount: printJob.bwCount,
			colorCount: printJob.colorCount,
			startedAt: printJob.startedAt
		})
		.from(printJob)
		.leftJoin(department, eq(printJob.departmentId, department.id))
		.leftJoin(person, eq(printJob.personId, person.id))
		.where(and(gte(printJob.startedAt, from), lte(printJob.startedAt, to)));

	const byDept = new Map<string, DepartmentUsage>();
	let totalBwCount = 0;
	let totalColorCount = 0;
	let totalCopierCostCents = 0;
	let totalPaperCostCents = 0;
	let totalCostCents = 0;

	for (const job of jobs) {
		const r = rates.length
			? rateAt(rates, job.startedAt)
			: { bwCostCents: 0, colorCostCents: 0, paperCostCents: 0 };
		const copierCost = job.bwCount * r.bwCostCents + job.colorCount * r.colorCostCents;
		const paperCost = (job.bwCount + job.colorCount) * r.paperCostCents;
		const costCents = copierCost + paperCost;

		const deptKey = job.departmentId ? String(job.departmentId) : 'unassigned';
		if (!byDept.has(deptKey)) {
			byDept.set(deptKey, {
				departmentId: job.departmentId,
				departmentCode: job.departmentCode ?? '—',
				departmentLabel: job.departmentLabel ?? 'Unassigned / unmatched code',
				bwCount: 0,
				colorCount: 0,
				copierCostCents: 0,
				paperCostCents: 0,
				costCents: 0,
				people: []
			});
		}
		const deptUsage = byDept.get(deptKey)!;
		deptUsage.bwCount += job.bwCount;
		deptUsage.colorCount += job.colorCount;
		deptUsage.copierCostCents += copierCost;
		deptUsage.paperCostCents += paperCost;
		deptUsage.costCents += costCents;

		const personKey = job.personId ? String(job.personId) : 'unassigned';
		let personUsage = deptUsage.people.find(
			(p) => (p.personId ? String(p.personId) : 'unassigned') === personKey
		);
		if (!personUsage) {
			personUsage = {
				personId: job.personId,
				name: job.personName ?? 'Unknown',
				bwCount: 0,
				colorCount: 0,
				copierCostCents: 0,
				paperCostCents: 0,
				costCents: 0
			};
			deptUsage.people.push(personUsage);
		}
		personUsage.bwCount += job.bwCount;
		personUsage.colorCount += job.colorCount;
		personUsage.copierCostCents += copierCost;
		personUsage.paperCostCents += paperCost;
		personUsage.costCents += costCents;

		totalBwCount += job.bwCount;
		totalColorCount += job.colorCount;
		totalCopierCostCents += copierCost;
		totalPaperCostCents += paperCost;
		totalCostCents += costCents;
	}

	return {
		from,
		to,
		departments: [...byDept.values()].sort((a, b) =>
			a.departmentLabel.localeCompare(b.departmentLabel)
		),
		totalBwCount,
		totalColorCount,
		totalCopierCostCents,
		totalPaperCostCents,
		totalCostCents
	};
}
