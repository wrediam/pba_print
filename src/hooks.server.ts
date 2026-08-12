import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE } from '$lib/server/auth';
import { startScheduler } from '$lib/server/scheduler';

// Routes reachable without being logged in.
const PUBLIC_PATHS = ['/login'];

// Runs once when the server process starts (top-level module code, not
// per-request) to begin the periodic printer sync.
startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = await getSessionUser(token);

	const isPublic = PUBLIC_PATHS.some((p) => event.url.pathname === p);

	if (!event.locals.user && !isPublic) {
		throw redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	}
	if (event.locals.user && event.url.pathname === '/login') {
		throw redirect(303, '/');
	}

	return resolve(event);
};
