import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { adminUser, session } from '$lib/server/db/schema';

export { hashPassword, verifyPassword } from '$lib/server/crypto';

const SESSION_COOKIE = 'pba_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export async function createSession(
	adminUserId: number
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	await db.insert(session).values({ id: token, adminUserId, expiresAt });
	return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
	if (!token) return null;
	const [row] = await db
		.select({ userId: adminUser.id, username: adminUser.username, expiresAt: session.expiresAt })
		.from(session)
		.innerJoin(adminUser, eq(session.adminUserId, adminUser.id))
		.where(eq(session.id, token));
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(session).where(eq(session.id, token));
		return null;
	}
	return { id: row.userId, username: row.username };
}

export async function destroySession(token: string): Promise<void> {
	await db.delete(session).where(eq(session.id, token));
}

export { SESSION_COOKIE };
