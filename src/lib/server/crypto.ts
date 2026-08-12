// Password hashing, kept dependency-free (no SvelteKit imports) so both
// the running app (via auth.ts) and the standalone seed scripts (which
// run as plain Node, outside Vite/SvelteKit's module resolution -- see
// scripts/) can use the exact same logic without pulling in $env/$lib
// aliases that only resolve inside the SvelteKit runtime.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(password, salt, 64).toString('hex');
	return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(':');
	if (!salt || !hash) return false;
	const candidate = scryptSync(password, salt, 64);
	const expected = Buffer.from(hash, 'hex');
	return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
