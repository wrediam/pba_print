import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { person } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { reprovisionForPersonCodeChange } from '$lib/server/gateway/provisioning';

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

		const [before] = await db
			.select({ personalCode: person.personalCode })
			.from(person)
			.where(eq(person.id, id));

		await db
			.update(person)
			.set({ personalCode, name, updatedAt: new Date() })
			.where(eq(person.id, id));

		// Same reasoning as the department-code case: the gateway's queue
		// names are derived from this code, so re-provision anything
		// already provisioned for this person under their old code.
		if (before && before.personalCode !== personalCode) {
			await reprovisionForPersonCodeChange(id, before.personalCode);
		}
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
