import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { adminUser } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSession, verifyPassword, SESSION_COOKIE } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		const [user] = await db.select().from(adminUser).where(eq(adminUser.username, username));
		if (!user || !verifyPassword(password, user.passwordHash)) {
			return fail(400, { error: 'Incorrect username or password.' });
		}

		const { token, expiresAt } = await createSession(user.id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: expiresAt
		});

		throw redirect(303, '/');
	}
};
