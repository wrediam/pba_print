<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { formatCents } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<div class="flex items-end justify-between print:hidden">
		<div>
			<h1 class="text-2xl font-semibold">Billing Report</h1>
			<p class="text-muted-foreground">
				Pick a date range, then Print (or save as PDF from the print dialog).
			</p>
		</div>
		<div class="flex items-end gap-3">
			<form method="GET" class="flex items-end gap-3">
				<div class="space-y-2">
					<Label for="from">From</Label>
					<Input id="from" name="from" type="date" value={data.fromInput} />
				</div>
				<div class="space-y-2">
					<Label for="to">To</Label>
					<Input id="to" name="to" type="date" value={data.toInput} />
				</div>
				<Button type="submit" variant="outline">Update</Button>
			</form>
			<Button variant="outline" href="/reports/export.csv?from={data.fromInput}&to={data.toInput}">
				Export CSV
			</Button>
			<Button onclick={() => window.print()}>Print</Button>
		</div>
	</div>

	<div class="print:block">
		<h2 class="hidden text-xl font-semibold print:block">Church Printer Billing Report</h2>
		<p class="mb-4 hidden text-sm text-muted-foreground print:block">
			{data.report.from.toLocaleDateString()} – {data.report.to.toLocaleDateString()}
		</p>

		{#each data.report.departments as dept (dept.departmentId ?? dept.departmentLabel)}
			<Card.Root class="mb-4 break-inside-avoid">
				<Card.Header>
					<Card.Title>
						<span class="font-mono text-muted-foreground">{dept.departmentCode}</span>
						{dept.departmentLabel}
					</Card.Title>
					<Card.Description>
						{dept.bwCount.toLocaleString()} B&amp;W · {dept.colorCount.toLocaleString()} Color · {formatCents(
							dept.costCents
						)}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Person</Table.Head>
								<Table.Head class="text-right">B&amp;W</Table.Head>
								<Table.Head class="text-right">Color</Table.Head>
								<Table.Head class="text-right">Cost</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each dept.people as p (p.personId ?? p.name)}
								<Table.Row>
									<Table.Cell>{p.name}</Table.Cell>
									<Table.Cell class="text-right">{p.bwCount.toLocaleString()}</Table.Cell>
									<Table.Cell class="text-right">{p.colorCount.toLocaleString()}</Table.Cell>
									<Table.Cell class="text-right">{formatCents(p.costCents)}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		{:else}
			<p class="text-muted-foreground">No usage in this date range.</p>
		{/each}

		<Card.Root>
			<Card.Content class="flex items-center justify-between py-4 font-semibold">
				<span>Total</span>
				<span>
					{data.report.totalBwCount.toLocaleString()} B&amp;W · {data.report.totalColorCount.toLocaleString()}
					Color ·
					{formatCents(data.report.totalCostCents)}
				</span>
			</Card.Content>
		</Card.Root>
	</div>
</div>

<style>
	@media print {
		:global(body) {
			background: white;
		}
	}
</style>
