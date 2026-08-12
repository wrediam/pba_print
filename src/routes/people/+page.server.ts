import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { person } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const people = await db.select().from(person).orderBy(person.name);
	return { people };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const personalCode = String(data.get('personalCode') ?? '').trim();
		const name = String(data.get('name') ?? '').trim();
		if (!personalCode || !name) return fail(400, { error: 'Code and name are both required.' });

		try {
			await db.insert(person).values({ personalCode, name });
		} catch {
			return fail(400, { error: `Personal code "${personalCode}" already exists.` });
		}
	},

	update: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const personalCode = String(data.get('personalCode') ?? '').trim();
		const name = String(data.get('name') ?? '').trim();
		if (!id || !personalCode || !name)
			return fail(400, { error: 'Code and name are both required.' });

		await db
			.update(person)
			.set({ personalCode, name, updatedAt: new Date() })
			.where(eq(person.id, id));
	},

	toggleActive: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const active = data.get('active') === 'true';
		await db
			.update(person)
			.set({ active: !active, updatedAt: new Date() })
			.where(eq(person.id, id));
	}
};
