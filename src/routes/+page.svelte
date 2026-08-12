<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { formatCents } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let syncing = $state(false);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Dashboard</h1>
			<p class="text-muted-foreground">
				Usage for {data.report.from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
			</p>
		</div>
		<form
			method="POST"
			action="?/sync"
			use:enhance={() => {
				syncing = true;
				return async ({ update }) => {
					await update();
					syncing = false;
				};
			}}
		>
			<Button type="submit" disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Now'}</Button>
		</form>
	</div>

	{#if data.lastSync}
		<Card.Root>
			<Card.Content class="flex items-center justify-between py-4">
				<span class="text-sm text-muted-foreground">
					Last sync: {new Date(data.lastSync.startedAt).toLocaleString()}
					{#if data.lastSync.status === 'ok'}
						— {data.lastSync.jobsNew} new job(s)
					{/if}
				</span>
				<Badge
					variant={data.lastSync.status === 'ok'
						? 'default'
						: data.lastSync.status === 'error'
							? 'destructive'
							: 'secondary'}
				>
					{data.lastSync.status}
				</Badge>
			</Card.Content>
			{#if data.lastSync.status === 'error' && data.lastSync.errorMessage}
				<Card.Content class="pt-0">
					<p class="text-sm text-destructive">{data.lastSync.errorMessage}</p>
				</Card.Content>
			{/if}
		</Card.Root>
	{/if}

	<div class="grid grid-cols-3 gap-4">
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Description>Black &amp; White Copies</Card.Description>
				<Card.Title class="text-3xl">{data.report.totalBwCount.toLocaleString()}</Card.Title>
			</Card.Header>
		</Card.Root>
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Description>Color Copies</Card.Description>
				<Card.Title class="text-3xl">{data.report.totalColorCount.toLocaleString()}</Card.Title>
			</Card.Header>
		</Card.Root>
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Description>Total Cost</Card.Description>
				<Card.Title class="text-3xl">{formatCents(data.report.totalCostCents)}</Card.Title>
			</Card.Header>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>By Department</Card.Title>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Department</Table.Head>
						<Table.Head class="text-right">B&amp;W</Table.Head>
						<Table.Head class="text-right">Color</Table.Head>
						<Table.Head class="text-right">Cost</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.report.departments as dept (dept.departmentId ?? dept.departmentLabel)}
						<Table.Row>
							<Table.Cell>
								<span class="font-mono text-muted-foreground">{dept.departmentCode}</span>
								{dept.departmentLabel}
							</Table.Cell>
							<Table.Cell class="text-right">{dept.bwCount.toLocaleString()}</Table.Cell>
							<Table.Cell class="text-right">{dept.colorCount.toLocaleString()}</Table.Cell>
							<Table.Cell class="text-right">{formatCents(dept.costCents)}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={4} class="text-center text-muted-foreground">
								No usage recorded yet this month. Try "Sync Now" above.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
