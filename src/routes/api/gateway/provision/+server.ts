// Called by the Fix Church Printer macOS installer once per department
// the user selects during setup, for their own person code -- this is
// the replacement for the old approach of the installer setting the
// account code itself via a local CUPS default. Now the installer just
// asks the gateway (via this dashboard) to make sure a queue exists,
// then points its own local queue at the URI this returns.
//
// Intentionally unauthenticated, same reasoning as /api/departments --
// LAN-only tool, and the worst this endpoint can be abused for is
// creating a queue for a person+department combo that already has to
// both exist and be active in this dashboard's own tables.
//
// POST /api/gateway/provision
// Body: { "personCode": "598", "departmentCode": "61" }
// → { "queueName": "church_598_61", "uri": "ipp://gateway:631/printers/church_598_61", "status": "ready" }

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { department, person } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { ensureQueue } from '$lib/server/gateway/provisioning';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const personCode = typeof body?.personCode === 'string' ? body.personCode.trim() : '';
	const departmentCode = typeof body?.departmentCode === 'string' ? body.departmentCode.trim() : '';

	if (!personCode || !departmentCode) {
		error(400, 'personCode and departmentCode are both required.');
	}

	const [p] = await db
		.select()
		.from(person)
		.where(and(eq(person.personalCode, personCode), eq(person.active, true)));
	if (!p) error(404, `No active person with code "${personCode}".`);

	const [d] = await db
		.select()
		.from(department)
		.where(and(eq(department.code, departmentCode), eq(department.active, true)));
	if (!d) error(404, `No active department with code "${departmentCode}".`);

	const result = await ensureQueue(p.id, d.id);

	if (result.status === 'skipped') {
		error(503, 'The print gateway is not configured on this server yet.');
	}
	if (result.status === 'error') {
		error(502, result.error ?? 'Gateway provisioning failed for an unknown reason.');
	}

	return json({ queueName: result.queueName, uri: result.uri, status: result.status });
};
