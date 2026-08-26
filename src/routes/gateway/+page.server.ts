import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { gatewayQueue, person, department } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	isGatewayConfigured,
	checkGatewayHealth,
	fetchGatewayQueues,
	fetchGatewayActiveJobs,
	fetchGatewayLogs,
	type GatewayQueueSummary,
	type GatewayActiveJob
} from '$lib/server/gateway/client';

// Everything the gateway itself reports is fetched best-effort: if the
// gateway is down or misconfigured we still render the page (showing the
// health error and whatever we know from our own gateway_queue table)
// rather than 500ing the whole dashboard.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ value: T; error?: string }> {
	try {
		return { value: await fn() };
	} catch (err) {
		return { value: fallback, error: err instanceof Error ? err.message : String(err) };
	}
}

export const load: PageServerLoad = async () => {
	const configured = isGatewayConfigured();

	// Our own record of what's been provisioned (persists even when the
	// gateway is unreachable), joined to human-readable person/department.
	const provisioned = await db
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
		.leftJoin(department, eq(department.id, gatewayQueue.departmentId));

	if (!configured) {
		return {
			configured,
			health: { reachable: false, error: 'GATEWAY_URL not configured' },
			provisioned,
			liveQueues: [] as GatewayQueueSummary[],
			liveQueuesError: undefined as string | undefined,
			activeJobs: [] as GatewayActiveJob[],
			activeJobsError: undefined as string | undefined,
			logs: [] as string[],
			logsError: undefined as string | undefined
		};
	}

	const [health, queues, jobs, logs] = await Promise.all([
		checkGatewayHealth(),
		safe(fetchGatewayQueues, [] as GatewayQueueSummary[]),
		safe(fetchGatewayActiveJobs, [] as GatewayActiveJob[]),
		safe(() => fetchGatewayLogs(200), [] as string[])
	]);

	return {
		configured,
		health,
		provisioned,
		liveQueues: queues.value,
		liveQueuesError: queues.error,
		activeJobs: jobs.value,
		activeJobsError: jobs.error,
		logs: logs.value,
		logsError: logs.error
	};
};
