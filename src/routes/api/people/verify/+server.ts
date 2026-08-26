// Public (no auth) endpoint the Fix Church Printer installer calls to
// verify a personal code the user typed *before* it tries to provision a
// gateway queue -- so an unknown/mistyped code fails with a friendly
// "not recognized" message up front instead of a cryptic provision error.
//
// Deliberately a single-code *lookup*, not a list: personal codes are not
// published to staff (that's what stops someone printing on another
// person's code), so this never returns the roster. It only answers
// "is THIS code an active person, and if so who?" for the one code asked.
// LAN-only tool; the worst this leaks is whether a specific guessed code
// exists, which the provision endpoint would reveal anyway.
//
// GET /api/people/verify?code=598
// → { "valid": true, "name": "Will Reeves" }   (active person exists)
// → { "valid": false }                           (no such active person)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { person } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code')?.trim() ?? '';
	if (!code) return json({ valid: false });

	const [p] = await db
		.select({ name: person.name })
		.from(person)
		.where(and(eq(person.personalCode, code), eq(person.active, true)));

	return p ? json({ valid: true, name: p.name }) : json({ valid: false });
};
