// Keeps the gateway_queue table (see src/lib/server/db/schema.ts) in
// sync with the actual queues on the print gateway. Two entry points:
//
// - ensureQueue(): provisions/re-verifies one person+department queue.
//   This is what the (future, Mac-side) installer's provisioning
//   request ultimately calls via /api/gateway/provision.
// - reprovisionForDepartmentCodeChange() / reprovisionForPersonCodeChange():
//   called from the Departments/People admin pages whenever a code
//   changes, since the gateway's queue name is derived from that code --
//   without this, changing a code would leave an orphaned queue under
//   the old name and no queue under the new one until someone happened
//   to re-run the installer.

import { db } from '$lib/server/db';
import { gatewayQueue, person, department } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { isGatewayConfigured, provisionGatewayQueue, removeGatewayQueue } from './client';

export interface EnsureQueueResult {
	status: 'ready' | 'error' | 'skipped';
	queueName?: string;
	uri?: string;
	error?: string;
}

/** Provisions (or re-verifies) the gateway queue for one person+department combo. */
export async function ensureQueue(personId: number, departmentId: number): Promise<EnsureQueueResult> {
	if (!isGatewayConfigured()) return { status: 'skipped' };

	const [p] = await db.select().from(person).where(eq(person.id, personId));
	const [d] = await db.select().from(department).where(eq(department.id, departmentId));
	if (!p || !d) return { status: 'error', error: 'Unknown person or department id.' };

	const result = await provisionGatewayQueue(p.personalCode, d.code, d.label);

	const [existing] = await db
		.select({ id: gatewayQueue.id })
		.from(gatewayQueue)
		.where(and(eq(gatewayQueue.personId, personId), eq(gatewayQueue.departmentId, departmentId)));

	const values = {
		personId,
		departmentId,
		queueName: result.queueName,
		fullCode: result.fullCode,
		status: result.status,
		lastError: result.error ?? null,
		lastProvisionedAt: new Date(),
		updatedAt: new Date()
	};

	if (existing) {
		await db.update(gatewayQueue).set(values).where(eq(gatewayQueue.id, existing.id));
	} else {
		await db.insert(gatewayQueue).values(values);
	}

	return { status: result.status, queueName: result.queueName, uri: result.uri, error: result.error };
}

/**
 * Re-provisions every already-provisioned queue for a department after
 * its code changes: removes the stale gateway queue (named with the old
 * code) and creates the correct one under the new code. Silently skips
 * if the gateway isn't configured -- there's nothing on the gateway to
 * clean up in that case, same as ensureQueue().
 */
export async function reprovisionForDepartmentCodeChange(
	departmentId: number,
	oldCode: string
): Promise<void> {
	if (!isGatewayConfigured()) return;

	const rows = await db
		.select({ personId: gatewayQueue.personId, personalCode: person.personalCode })
		.from(gatewayQueue)
		.innerJoin(person, eq(person.id, gatewayQueue.personId))
		.where(eq(gatewayQueue.departmentId, departmentId));

	for (const row of rows) {
		await removeGatewayQueue(row.personalCode, oldCode).catch(() => {
			/* best-effort -- ensureQueue below still creates the correct queue either way */
		});
		await ensureQueue(row.personId, departmentId);
	}
}

/** Same idea as reprovisionForDepartmentCodeChange(), but for a person's own code changing. */
export async function reprovisionForPersonCodeChange(personId: number, oldCode: string): Promise<void> {
	if (!isGatewayConfigured()) return;

	const rows = await db
		.select({ departmentId: gatewayQueue.departmentId, departmentCode: department.code })
		.from(gatewayQueue)
		.innerJoin(department, eq(department.id, gatewayQueue.departmentId))
		.where(eq(gatewayQueue.personId, personId));

	for (const row of rows) {
		await removeGatewayQueue(oldCode, row.departmentCode).catch(() => {
			/* best-effort -- ensureQueue below still creates the correct queue either way */
		});
		await ensureQueue(personId, row.departmentId);
	}
}
