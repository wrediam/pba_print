import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { department, person, printJob } from '$lib/server/db/schema';
import { and, desc, eq, gt, ilike, inArray, isNull, or } from 'drizzle-orm';

const PAGE_SIZE = 100;

export const load: PageServerLoad = async ({ url }) => {
	const unmatchedOnly = url.searchParams.get('unmatched') === '1';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const q = url.searchParams.get('q')?.trim() ?? '';

	const baseQuery = db
		.select({
			id: printJob.id,
			printerJobId: printJob.printerJobId,
			jobMode: printJob.jobMode,
			source: printJob.source,
			loginName: printJob.loginName,
			userName: printJob.userName,
			startedAt: printJob.startedAt,
			completedAt: printJob.completedAt,
			bwCount: printJob.bwCount,
			colorCount: printJob.colorCount,
			totalCount: printJob.totalCount,
			fullColorCount: printJob.fullColorCount,
			twoColorCount: printJob.twoColorCount,
			singleColorCount: printJob.singleColorCount,
			result: printJob.result,
			errorCause: printJob.errorCause,
			directAddress: printJob.directAddress,
			colorSetting: printJob.colorSetting,
			paperSize: printJob.paperSize,
			paperType: printJob.paperType,
			duplexSetup: printJob.duplexSetup,
			resolution: printJob.resolution,
			computerName: printJob.computerName,
			fileName: printJob.fileName,
			outputMode: printJob.outputMode,
			staple: printJob.staple,
			stapleCount: printJob.stapleCount,
			punch: printJob.punch,
			punchCount: printJob.punchCount,
			completedSets: printJob.completedSets,
			completedPages: printJob.completedPages,
			originalCount: printJob.originalCount,
			originalSize: printJob.originalSize,
			personId: printJob.personId,
			departmentId: printJob.departmentId,
			personName: person.name,
			departmentLabel: department.label,
			departmentCode: department.code
		})
		.from(printJob)
		.leftJoin(person, eq(printJob.personId, person.id))
		.leftJoin(department, eq(printJob.departmentId, department.id));

	const searchFilter = q
		? or(
				ilike(printJob.loginName, `%${q}%`),
				ilike(printJob.userName, `%${q}%`),
				ilike(person.name, `%${q}%`),
				ilike(department.label, `%${q}%`),
				ilike(department.code, `%${q}%`)
			)
		: undefined;

	const matchFilter = unmatchedOnly
		? or(isNull(printJob.personId), isNull(printJob.departmentId))
		: undefined;

	const rows = await baseQuery
		.where(and(gt(printJob.totalCount, 0), matchFilter, searchFilter))
		.orderBy(desc(printJob.startedAt))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	const [people, departments] = await Promise.all([
		db.select({ id: person.id, name: person.name }).from(person).orderBy(person.name),
		db
			.select({ id: department.id, label: department.label, code: department.code })
			.from(department)
			.orderBy(department.label)
	]);

	return { rows, people, departments, unmatchedOnly, page, pageSize: PAGE_SIZE, q };
};

export const actions: Actions = {
	assign: async ({ request }) => {
		const data = await request.formData();
		const jobId = Number(data.get('jobId'));
		const personIdRaw = data.get('personId');
		const departmentIdRaw = data.get('departmentId');
		if (!jobId) return fail(400, { error: 'Missing job id.' });

		const personId = personIdRaw && personIdRaw !== '' ? Number(personIdRaw) : null;
		const departmentId = departmentIdRaw && departmentIdRaw !== '' ? Number(departmentIdRaw) : null;

		await db.update(printJob).set({ personId, departmentId }).where(eq(printJob.id, jobId));
	},

	bulkAssign: async ({ request }) => {
		const data = await request.formData();
		const jobIds = data.getAll('jobId').map(Number).filter(Boolean);
		const personIdRaw = data.get('personId');
		const departmentIdRaw = data.get('departmentId');
		if (!jobIds.length) return fail(400, { error: 'No jobs selected.' });

		const personId = personIdRaw && personIdRaw !== '' ? Number(personIdRaw) : null;
		const departmentId = departmentIdRaw && departmentIdRaw !== '' ? Number(departmentIdRaw) : null;

		await db.update(printJob).set({ personId, departmentId }).where(inArray(printJob.id, jobIds));
	}
};
