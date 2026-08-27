<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let resyncing = $state(false);

	function fmtBytes(n: number | null): string {
		if (!n) return '—';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Print Gateway</h1>
			<p class="text-muted-foreground">
				The CUPS service that sits between staff Macs and the copier. Jobs sent here carry the
				department account code automatically.
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if data.configured && data.health.reachable}
				<form
					method="POST"
					action="?/resync"
					use:enhance={() => {
						resyncing = true;
						return async ({ update }) => {
							await update();
							resyncing = false;
						};
					}}
				>
					<Button type="submit" variant="outline" disabled={resyncing}>
						{resyncing ? 'Re-provisioning…' : 'Re-provision all to gateway'}
					</Button>
				</form>
			{/if}
			{#if !data.configured}
				<Badge variant="secondary">Not configured</Badge>
			{:else if data.health.reachable}
				<Badge>Online</Badge>
			{:else}
				<Badge variant="destructive">Unreachable</Badge>
			{/if}
		</div>
	</div>

	{#if form?.resynced}
		<Card.Root>
			<Card.Content class="py-4 text-sm">
				Re-provisioned {form.resynced.ready} of {form.resynced.total} queue(s) onto the gateway{form
					.resynced.failed
					? `, ${form.resynced.failed} failed`
					: ''}.
			</Card.Content>
		</Card.Root>
	{/if}

	{#if !data.configured}
		<Card.Root>
			<Card.Content class="py-4 text-sm text-muted-foreground">
				No gateway is configured for this dashboard (<span class="font-mono">GATEWAY_URL</span> is unset).
				Gateway provisioning and this page are inactive; billing continues on the printer Job Log only.
			</Card.Content>
		</Card.Root>
	{:else if !data.health.reachable}
		<Card.Root>
			<Card.Content class="py-4 text-sm text-destructive">
				Gateway is not reachable: {data.health.error}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Provisioned queues: our own record (from gateway_queue), enriched
	     with the gateway's live enabled/accepting state where available. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Provisioned Queues</Card.Title>
			<Card.Description>
				One queue per person + department. The code is baked into the queue on the gateway, never on
				a staff Mac.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.liveQueuesError}
				<p class="mb-3 text-sm text-destructive">
					Couldn't read live queue state from the gateway: {data.liveQueuesError}. Showing the
					dashboard's own record below.
				</p>
			{/if}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Queue</Table.Head>
						<Table.Head>Person</Table.Head>
						<Table.Head>Department</Table.Head>
						<Table.Head>Code</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Live state</Table.Head>
						<Table.Head>Last provisioned</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.provisioned as q (q.queueName)}
						{@const live = data.liveQueues.find((l) => l.queueName === q.queueName)}
						<Table.Row>
							<Table.Cell class="font-mono text-xs">{q.queueName}</Table.Cell>
							<Table.Cell>
								{q.personName ?? '—'}
								{#if q.personalCode}<span class="font-mono text-muted-foreground"
										>({q.personalCode})</span
									>{/if}
							</Table.Cell>
							<Table.Cell>
								{q.departmentLabel ?? '—'}
								{#if q.departmentCode}<span class="font-mono text-muted-foreground"
										>({q.departmentCode})</span
									>{/if}
							</Table.Cell>
							<Table.Cell class="font-mono">{q.fullCode}</Table.Cell>
							<Table.Cell>
								<Badge variant={q.status === 'ready' ? 'default' : q.status === 'error' ? 'destructive' : 'secondary'}>
									{q.status}
								</Badge>
								{#if q.lastError}
									<div class="mt-1 text-xs text-destructive">{q.lastError}</div>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-sm">
								{#if live}
									{live.enabled ? 'enabled' : 'disabled'}, {live.accepting
										? 'accepting'
										: 'not accepting'}
									{#if live.jclUserNumber && live.jclUserNumber !== q.fullCode}
										<div class="text-xs text-destructive">
											gateway code {live.jclUserNumber} ≠ expected {q.fullCode}
										</div>
									{/if}
								{:else if data.health.reachable && !data.liveQueuesError}
									<span class="text-destructive">missing on gateway</span>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{q.lastProvisionedAt ? new Date(q.lastProvisionedAt).toLocaleString() : '—'}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={7} class="text-center text-muted-foreground">
								No queues provisioned yet. They're created when a staff Mac runs the installer, or
								when you add a person + department.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<!-- Live queue: jobs accepted but not yet finished at the copier. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Live Queue</Card.Title>
			<Card.Description>Jobs sent to the gateway that haven't finished printing yet.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.activeJobsError}
				<p class="text-sm text-destructive">Couldn't read the live queue: {data.activeJobsError}</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Job</Table.Head>
							<Table.Head>Queue</Table.Head>
							<Table.Head>User</Table.Head>
							<Table.Head class="text-right">Size</Table.Head>
							<Table.Head>Submitted</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.activeJobs as job (job.jobId)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">{job.jobId}</Table.Cell>
								<Table.Cell class="font-mono text-xs">{job.queueName}</Table.Cell>
								<Table.Cell>{job.user}</Table.Cell>
								<Table.Cell class="text-right">{fmtBytes(job.sizeBytes)}</Table.Cell>
								<Table.Cell class="text-sm text-muted-foreground">{job.submittedAt}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={5} class="text-center text-muted-foreground">
									Queue is empty — nothing waiting to print.
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Recent cupsd error_log, for troubleshooting. -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Gateway Log</Card.Title>
			<Card.Description>Last 200 lines of the gateway's CUPS log.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.logsError}
				<p class="text-sm text-destructive">Couldn't read the gateway log: {data.logsError}</p>
			{:else if data.logs.length === 0}
				<p class="text-sm text-muted-foreground">No log output.</p>
			{:else}
				<pre class="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{data.logs.join(
						'\n'
					)}</pre>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
