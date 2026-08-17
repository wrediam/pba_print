// Public (no auth) endpoint returning active department codes as JSON.
// Intentionally unauthenticated -- it's local-network only and the data
// is non-sensitive (same list printed on the physical copier-codes sheet).
//
// Response shape matches the tab-separated department_codes.txt format
// used by the Fix Church Printer Mac app, making it easy to swap in
// a curl/fetch call to this endpoint instead of reading the bundled file.
//
// GET /api/departments
// → [{ "code": "61", "label": "Youth Dept." }, ...]

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { department } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	const rows = await db
		.select({ code: department.code, label: department.label })
		.from(department)
		.where(eq(department.active, true))
		.orderBy(department.code);

	return json(rows);
};
