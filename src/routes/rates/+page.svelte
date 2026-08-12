<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { formatCents } from '$lib/utils';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold">Cost Per Copy</h1>
		<p class="text-muted-foreground">
			Setting a new rate doesn't change past reports -- each report uses whatever rate was in effect
			on the date of each print job.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Set New Rate</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance class="flex items-end gap-3">
				<div class="space-y-2">
					<Label for="bwCost">Black &amp; White ($/copy)</Label>
					<Input
						id="bwCost"
						name="bwCost"
						type="number"
						step="0.001"
						min="0"
						placeholder="0.010"
						class="w-32"
						required
					/>
				</div>
				<div class="space-y-2">
					<Label for="colorCost">Color ($/copy)</Label>
					<Input
						id="colorCost"
						name="colorCost"
						type="number"
						step="0.001"
						min="0"
						placeholder="0.080"
						class="w-32"
						required
					/>
				</div>
				<Button type="submit">Save New Rate</Button>
			</form>
			{#if form?.error}
				<p class="mt-2 text-sm text-destructive">{form.error}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Rate History</Card.Title>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Effective From</Table.Head>
						<Table.Head>B&amp;W / copy</Table.Head>
						<Table.Head>Color / copy</Table.Head>
						<Table.Head class="w-24"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.rates as r, i (r.id)}
						<Table.Row>
							<Table.Cell>{new Date(r.effectiveFrom).toLocaleString()}</Table.Cell>
							<Table.Cell>{formatCents(r.bwCostCents)}</Table.Cell>
							<Table.Cell>{formatCents(r.colorCostCents)}</Table.Cell>
							<Table.Cell>
								{#if i === 0}
									<Badge>Current</Badge>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
