<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function isUnmatched(row: (typeof data.rows)[number]) {
		return !row.personId || !row.departmentId;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Print Jobs</h1>
			<p class="text-muted-foreground">
				Raw jobs pulled from the printer's log, with the code it sent. Assign a person and/or
				department for anything that didn't match automatically.
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant={data.unmatchedOnly ? 'outline' : 'default'} href="/jobs">All Jobs</Button>
			<Button variant={data.unmatchedOnly ? 'default' : 'outline'} href="/jobs?unmatched=1">
				Unmatched Only
			</Button>
		</div>
	</div>

	<Card.Root>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Date</Table.Head>
						<Table.Head>Computer</Table.Head>
						<Table.Head>Code Sent</Table.Head>
						<Table.Head>Person</Table.Head>
						<Table.Head>Department</Table.Head>
						<Table.Head class="text-right">B&amp;W</Table.Head>
						<Table.Head class="text-right">Color</Table.Head>
						<Table.Head>Result</Table.Head>
						<Table.Head class="w-72"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.rows as row (row.id)}
						<Table.Row>
							<Table.Cell class="text-sm whitespace-nowrap"
								>{new Date(row.startedAt).toLocaleString()}</Table.Cell
							>
							<Table.Cell>{row.computerName}</Table.Cell>
							<Table.Cell class="font-mono">{row.fullCode ?? '—'}</Table.Cell>
							<Table.Cell>
								{#if row.personName}
									{row.personName}
								{:else}
									<Badge variant="secondary">unassigned</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if row.departmentLabel}
									<span class="font-mono text-muted-foreground">{row.departmentCode}</span>
									{row.departmentLabel}
								{:else}
									<Badge variant="secondary">unassigned</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-right">{row.bwCount}</Table.Cell>
							<Table.Cell class="text-right">{row.colorCount}</Table.Cell>
							<Table.Cell>{row.result}</Table.Cell>
							<Table.Cell>
								{#if isUnmatched(row)}
									<form
										method="POST"
										action="?/assign"
										use:enhance
										class="flex items-center gap-1.5"
									>
										<input type="hidden" name="jobId" value={row.id} />
										<Select.Root
											type="single"
											name="personId"
											value={row.personId ? String(row.personId) : ''}
										>
											<Select.Trigger class="h-8 w-28 text-xs">
												{row.personId
													? data.people.find((p) => p.id === row.personId)?.name
													: 'Person'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="">—</Select.Item>
												{#each data.people as p (p.id)}
													<Select.Item value={String(p.id)}>{p.name}</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
										<Select.Root
											type="single"
											name="departmentId"
											value={row.departmentId ? String(row.departmentId) : ''}
										>
											<Select.Trigger class="h-8 w-32 text-xs">
												{row.departmentId
													? data.departments.find((d) => d.id === row.departmentId)?.label
													: 'Department'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="">—</Select.Item>
												{#each data.departments as d (d.id)}
													<Select.Item value={String(d.id)}>{d.code} — {d.label}</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
										<Button type="submit" size="sm" class="h-8">Save</Button>
									</form>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={9} class="text-center text-muted-foreground">
								No jobs {data.unmatchedOnly ? 'need attention' : 'synced yet'}.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if data.rows.length === data.pageSize}
		<div class="flex justify-end">
			<Button
				variant="outline"
				href="/jobs?page={data.page + 1}{data.unmatchedOnly ? '&unmatched=1' : ''}"
			>
				Next Page
			</Button>
		</div>
	{/if}
</div>
