import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { department } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const departments = await db
		.select()
		.from(department)
		.where(eq(department.active, true))
		.orderBy(department.code);
	return { departmentCount: departments.length };
};
