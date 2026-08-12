import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rate } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const rates = await db.select().from(rate).orderBy(desc(rate.effectiveFrom));
	return { rates };
};

export const actions: Actions = {
	// Rates are versioned: this always INSERTS a new row rather than
	// editing an existing one, so past billing reports keep using
	// whatever rate was actually in effect at the time.
	create: async ({ request }) => {
		const data = await request.formData();
		const bwDollars = Number(data.get('bwCost'));
		const colorDollars = Number(data.get('colorCost'));
		if (
			!Number.isFinite(bwDollars) ||
			!Number.isFinite(colorDollars) ||
			bwDollars < 0 ||
			colorDollars < 0
		) {
			return fail(400, { error: 'Enter valid, non-negative costs per copy.' });
		}

		await db.insert(rate).values({
			bwCostCents: Math.round(bwDollars * 100),
			colorCostCents: Math.round(colorDollars * 100)
		});
	}
};
