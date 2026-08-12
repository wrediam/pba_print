// Runs after migrations on every container start (see
// docker-entrypoint.sh). Only ever INSERTS -- never touches existing
// rows -- so re-running on every deploy is always safe and never
// overwrites data or resets anyone's password.

import { db } from './db.ts';
import { adminUser } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/crypto.ts';

async function main() {
	const existing = await db.select({ id: adminUser.id }).from(adminUser).limit(1);
	if (existing.length > 0) {
		console.log('[seed] admin_user already has an account, skipping.');
		return;
	}

	const username = process.env.ADMIN_USERNAME;
	const password = process.env.ADMIN_PASSWORD;
	if (!username || !password) {
		console.warn(
			'[seed] No admin account exists yet, and ADMIN_USERNAME/ADMIN_PASSWORD are not set -- ' +
				'skipping seed. Set both env vars and restart to create the first login.'
		);
		return;
	}

	await db.insert(adminUser).values({ username, passwordHash: hashPassword(password) });
	console.log(`[seed] Created admin account "${username}".`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[seed] Failed:', err);
		process.exit(1);
	});
