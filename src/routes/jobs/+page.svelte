<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ColumnsIcon from '@lucide/svelte/icons/columns-3';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = (typeof data.rows)[number];

	function isUnmatched(row: Row) {
		return !row.personId || !row.departmentId;
	}

	// Every column the Jobs table can show. `key` doubles as the
	// localStorage-persisted identity, so don't rename existing keys
	// without a migration -- it'll just silently reset to defaults.
	const ALL_COLUMNS = [
		{ key: 'startedAt', label: 'Date' },
		{ key: 'completedAt', label: 'Completed' },
		{ key: 'jobMode', label: 'Job Mode' },
		{ key: 'userName', label: 'User' },
		{ key: 'loginName', label: 'Code Sent' },
		{ key: 'person', label: 'Person' },
		{ key: 'department', label: 'Department' },
		{ key: 'bwCount', label: 'B&W' },
		{ key: 'colorCount', label: 'Color' },
		{ key: 'fullColorCount', label: 'Full Color' },
		{ key: 'twoColorCount', label: '2 Color' },
		{ key: 'singleColorCount', label: 'Single Color' },
		{ key: 'totalCount', label: 'Total' },
		{ key: 'result', label: 'Result' },
		{ key: 'errorCause', label: 'Error Cause' },
		{ key: 'colorSetting', label: 'Color Setting' },
		{ key: 'paperSize', label: 'Paper Size' },
		{ key: 'duplexSetup', label: 'Duplex' },
		{ key: 'directAddress', label: 'Direct Address' },
		{ key: 'printerJobId', label: 'Job ID' }
	] as const;
	type ColumnKey = (typeof ALL_COLUMNS)[number]['key'];

	const DEFAULT_COLUMNS: ColumnKey[] = [
		'startedAt',
		'userName',
		'loginName',
		'person',
		'department',
		'bwCount',
		'colorCount',
		'result'
	];

	const STORAGE_KEY = 'pba-print:jobs-columns';

	let visibleColumns = new SvelteSet<ColumnKey>(DEFAULT_COLUMNS);

	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return;
		try {
			const keys: string[] = JSON.parse(saved);
			const valid = keys.filter((k): k is ColumnKey => ALL_COLUMNS.some((c) => c.key === k));
			if (valid.length) {
				visibleColumns.clear();
				for (const key of valid) visibleColumns.add(key);
			}
		} catch {
			// ignore malformed/old storage, fall back to defaults
		}
	});

	function toggleColumn(key: ColumnKey, checked: boolean) {
		if (checked) visibleColumns.add(key);
		else visibleColumns.delete(key);
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleColumns]));
	}

	function isVisible(key: ColumnKey) {
		return visibleColumns.has(key);
	}

	function formatDate(value: string | Date | null) {
		return value ? new Date(value).toLocaleString() : '—';
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
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="icon" {...props} aria-label="Choose columns">
							<ColumnsIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-56">
					<DropdownMenu.Label>Columns</DropdownMenu.Label>
					<DropdownMenu.Separator />
					{#each ALL_COLUMNS as column (column.key)}
						<DropdownMenu.CheckboxItem
							checked={isVisible(column.key)}
							onCheckedChange={(checked) => toggleColumn(column.key, checked)}
							closeOnSelect={false}
						>
							{column.label}
						</DropdownMenu.CheckboxItem>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			<div class="overflow-x-auto px-6 pb-6 pt-6">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						{#if isVisible('startedAt')}<Table.Head>Date</Table.Head>{/if}
						{#if isVisible('completedAt')}<Table.Head>Completed</Table.Head>{/if}
						{#if isVisible('jobMode')}<Table.Head>Job Mode</Table.Head>{/if}
						{#if isVisible('userName')}<Table.Head>User</Table.Head>{/if}
						{#if isVisible('loginName')}<Table.Head>Code Sent</Table.Head>{/if}
						{#if isVisible('person')}<Table.Head>Person</Table.Head>{/if}
						{#if isVisible('department')}<Table.Head>Department</Table.Head>{/if}
						{#if isVisible('bwCount')}<Table.Head class="text-right">B&amp;W</Table.Head>{/if}
						{#if isVisible('colorCount')}<Table.Head class="text-right">Color</Table.Head>{/if}
						{#if isVisible('fullColorCount')}<Table.Head class="text-right">Full Color</Table.Head
							>{/if}
						{#if isVisible('twoColorCount')}<Table.Head class="text-right">2 Color</Table.Head>{/if}
						{#if isVisible('singleColorCount')}<Table.Head class="text-right"
								>Single Color</Table.Head
							>{/if}
						{#if isVisible('totalCount')}<Table.Head class="text-right">Total</Table.Head>{/if}
						{#if isVisible('result')}<Table.Head>Result</Table.Head>{/if}
						{#if isVisible('errorCause')}<Table.Head>Error Cause</Table.Head>{/if}
						{#if isVisible('colorSetting')}<Table.Head>Color Setting</Table.Head>{/if}
						{#if isVisible('paperSize')}<Table.Head>Paper Size</Table.Head>{/if}
						{#if isVisible('duplexSetup')}<Table.Head>Duplex</Table.Head>{/if}
						{#if isVisible('directAddress')}<Table.Head>Direct Address</Table.Head>{/if}
						{#if isVisible('printerJobId')}<Table.Head>Job ID</Table.Head>{/if}
						<Table.Head class="w-72"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.rows as row (row.id)}
						<Table.Row>
							{#if isVisible('startedAt')}
								<Table.Cell class="text-sm whitespace-nowrap"
									>{formatDate(row.startedAt)}</Table.Cell
								>
							{/if}
							{#if isVisible('completedAt')}
								<Table.Cell class="text-sm whitespace-nowrap"
									>{formatDate(row.completedAt)}</Table.Cell
								>
							{/if}
							{#if isVisible('jobMode')}
								<Table.Cell>{row.jobMode}</Table.Cell>
							{/if}
							{#if isVisible('userName')}
								<Table.Cell>{row.userName}</Table.Cell>
							{/if}
							{#if isVisible('loginName')}
								<Table.Cell class="font-mono">{row.loginName ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('person')}
								<Table.Cell>
									{#if row.personName}
										{row.personName}
									{:else}
										<Badge variant="secondary">unassigned</Badge>
									{/if}
								</Table.Cell>
							{/if}
							{#if isVisible('department')}
								<Table.Cell>
									{#if row.departmentLabel}
										<span class="font-mono text-muted-foreground">{row.departmentCode}</span>
										{row.departmentLabel}
									{:else}
										<Badge variant="secondary">unassigned</Badge>
									{/if}
								</Table.Cell>
							{/if}
							{#if isVisible('bwCount')}
								<Table.Cell class="text-right">{row.bwCount}</Table.Cell>
							{/if}
							{#if isVisible('colorCount')}
								<Table.Cell class="text-right">{row.colorCount}</Table.Cell>
							{/if}
							{#if isVisible('fullColorCount')}
								<Table.Cell class="text-right">{row.fullColorCount}</Table.Cell>
							{/if}
							{#if isVisible('twoColorCount')}
								<Table.Cell class="text-right">{row.twoColorCount ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('singleColorCount')}
								<Table.Cell class="text-right">{row.singleColorCount ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('totalCount')}
								<Table.Cell class="text-right">{row.totalCount}</Table.Cell>
							{/if}
							{#if isVisible('result')}
								<Table.Cell>{row.result}</Table.Cell>
							{/if}
							{#if isVisible('errorCause')}
								<Table.Cell>{row.errorCause ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('colorSetting')}
								<Table.Cell>{row.colorSetting ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('paperSize')}
								<Table.Cell>{row.paperSize ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('duplexSetup')}
								<Table.Cell>{row.duplexSetup ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('directAddress')}
								<Table.Cell>{row.directAddress ?? '—'}</Table.Cell>
							{/if}
							{#if isVisible('printerJobId')}
								<Table.Cell class="font-mono text-muted-foreground">{row.printerJobId}</Table.Cell>
							{/if}
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
											<Select.Content class="max-h-64 overflow-y-auto">
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
							<Table.Cell
								colspan={visibleColumns.size + 1}
								class="text-center text-muted-foreground"
							>
								No jobs {data.unmatchedOnly ? 'need attention' : 'synced yet'}.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			</div>
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
