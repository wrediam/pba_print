import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { department } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const departments = await db.select().from(department).orderBy(department.code);
	return { departments };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const code = String(data.get('code') ?? '').trim();
		const label = String(data.get('label') ?? '').trim();
		if (!code || !label) return fail(400, { error: 'Code and label are both required.' });

		try {
			await db.insert(department).values({ code, label });
		} catch {
			return fail(400, { error: `Department code "${code}" already exists.` });
		}
	},

	update: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const code = String(data.get('code') ?? '').trim();
		const label = String(data.get('label') ?? '').trim();
		if (!id || !code || !label) return fail(400, { error: 'Code and label are both required.' });

		await db
			.update(department)
			.set({ code, label, updatedAt: new Date() })
			.where(eq(department.id, id));
	},

	toggleActive: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const active = data.get('active') === 'true';
		await db
			.update(department)
			.set({ active: !active, updatedAt: new Date() })
			.where(eq(department.id, id));
	},

	toggleBillable: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const billable = data.get('billable') === 'true';
		await db
			.update(department)
			.set({ billable: !billable, updatedAt: new Date() })
			.where(eq(department.id, id));
	}
};
