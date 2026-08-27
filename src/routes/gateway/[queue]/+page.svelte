<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<div>
		<Button variant="ghost" size="sm" href="/gateway">← Back to Gateway</Button>
		<h1 class="mt-2 text-2xl font-semibold">
			<span class="font-mono">{data.queueName}</span>
		</h1>
		{#if data.queue}
			<p class="text-muted-foreground">
				{data.queue.personName ?? '—'}
				{#if data.queue.personalCode}<span class="font-mono">({data.queue.personalCode})</span>{/if}
				· {data.queue.departmentLabel ?? '—'}
				{#if data.queue.departmentCode}<span class="font-mono">({data.queue.departmentCode})</span
					>{/if}
				· code <span class="font-mono">{data.queue.fullCode}</span>
				<Badge
					class="ml-1"
					variant={data.queue.status === 'ready'
						? 'default'
						: data.queue.status === 'error'
							? 'destructive'
							: 'secondary'}>{data.queue.status}</Badge
				>
			</p>
		{:else}
			<p class="text-muted-foreground">This queue isn't in the dashboard's records.</p>
		{/if}
	</div>

	<!-- This queue's billed job history (from print_job). -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Job History</Card.Title>
			<Card.Description>Jobs captured from the gateway for this queue.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Date</Table.Head>
						<Table.Head>File</Table.Head>
						<Table.Head class="text-right">B&amp;W</Table.Head>
						<Table.Head class="text-right">Color</Table.Head>
						<Table.Head class="text-right">Total</Table.Head>
						<Table.Head>Color source</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.jobs as job (job.id)}
						<Table.Row>
							<Table.Cell class="text-sm">
								{job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}
							</Table.Cell>
							<Table.Cell>{job.fileName ?? '—'}</Table.Cell>
							<Table.Cell class="text-right">{job.bwCount.toLocaleString()}</Table.Cell>
							<Table.Cell class="text-right">{job.colorCount.toLocaleString()}</Table.Cell>
							<Table.Cell class="text-right">{job.totalCount.toLocaleString()}</Table.Cell>
							<Table.Cell>
								{#if job.colorFromPrinter}
									<Badge variant="secondary">printer counts</Badge>
								{:else}
									<Badge variant="outline">B&amp;W (pending match)</Badge>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="text-center text-muted-foreground">
								No jobs captured for this queue yet.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<!-- Per-queue activity from the gateway's own log (succeeded/failed + reasons). -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Activity</Card.Title>
			<Card.Description>This queue's own lines from the gateway's CUPS log.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.logError}
				<p class="text-sm text-destructive">Couldn't read the gateway log: {data.logError}</p>
			{:else if data.log.length === 0}
				<p class="text-sm text-muted-foreground">No activity logged for this queue.</p>
			{:else}
				<pre
					class="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{data.log.join(
						'\n'
					)}</pre>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
