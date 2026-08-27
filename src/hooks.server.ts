import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE } from '$lib/server/auth';
import { startScheduler } from '$lib/server/scheduler';

// Routes reachable without being logged in.
// /download-app is intentionally public so anyone on the network can
// grab the setup app without needing a login (IT, staff, etc.) -- the
// startsWith check below also covers /download-app/file and
// /download-app/windows.
//
// The /api/* entries are the endpoints the installer app calls during
// setup, with no human logged in: the department list, the personal-code
// check, and gateway-queue provisioning. They must be public or the
// installer just gets bounced to /login (a 303 that curl surfaces as an
// empty body, which the installer then misreports as "couldn't reach the
// server"). These endpoints do their own validation (unknown/inactive
// codes are rejected) and this is a LAN-only tool.
const PUBLIC_PATHS = [
	'/login',
	'/download-app',
	'/download-app/file',
	'/api/departments',
	'/api/people/verify',
	'/api/gateway/provision'
];

// Runs once when the server process starts (top-level module code, not
// per-request) to begin the periodic printer sync.
startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = await getSessionUser(token);

	const isPublic = PUBLIC_PATHS.some((p) => event.url.pathname === p || event.url.pathname.startsWith(p + '/'));

	if (!event.locals.user && !isPublic) {
		throw redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	}
	if (event.locals.user && event.url.pathname === '/login') {
		throw redirect(303, '/');
	}

	return resolve(event);
};
