import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { gatewayQueue, person, department, printJob } from '$lib/server/db/schema';
import { desc, eq, like } from 'drizzle-orm';
import { fetchGatewayLogs, isGatewayConfigured } from '$lib/server/gateway/client';

export const load: PageServerLoad = async ({ params }) => {
	const queueName = params.queue;

	// This queue's config (person/department it's for).
	const [queue] = await db
		.select({
			queueName: gatewayQueue.queueName,
			fullCode: gatewayQueue.fullCode,
			status: gatewayQueue.status,
			lastError: gatewayQueue.lastError,
			lastProvisionedAt: gatewayQueue.lastProvisionedAt,
			personName: person.name,
			personalCode: person.personalCode,
			departmentLabel: department.label,
			departmentCode: department.code
		})
		.from(gatewayQueue)
		.leftJoin(person, eq(person.id, gatewayQueue.personId))
		.leftJoin(department, eq(department.id, gatewayQueue.departmentId))
		.where(eq(gatewayQueue.queueName, queueName));

	// This queue's billed job history (gatewayJobKey is "<queue>-<cupsJobId>").
	const jobs = await db
		.select({
			id: printJob.id,
			completedAt: printJob.completedAt,
			fileName: printJob.fileName,
			bwCount: printJob.bwCount,
			colorCount: printJob.colorCount,
			totalCount: printJob.totalCount,
			colorFromPrinter: printJob.colorFromPrinter,
			result: printJob.result
		})
		.from(printJob)
		.where(like(printJob.gatewayJobKey, `${queueName}-%`))
		.orderBy(desc(printJob.completedAt))
		.limit(200);

	// This queue's recent activity/errors from the gateway's own log.
	let log: string[] = [];
	let logError: string | undefined;
	if (isGatewayConfigured()) {
		try {
			log = await fetchGatewayLogs(300, queueName);
		} catch (err) {
			logError = err instanceof Error ? err.message : String(err);
		}
	}

	return { queueName, queue: queue ?? null, jobs, log, logError };
};
