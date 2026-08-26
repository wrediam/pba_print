<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
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
		{ key: 'source', label: 'Source' },
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
		{ key: 'paperType', label: 'Paper Type' },
		{ key: 'duplexSetup', label: 'Duplex' },
		{ key: 'resolution', label: 'Resolution' },
		{ key: 'directAddress', label: 'Direct Address' },
		{ key: 'computerName', label: 'Computer Name' },
		{ key: 'fileName', label: 'File Name' },
		{ key: 'outputMode', label: 'Output Mode' },
		{ key: 'staple', label: 'Staple' },
		{ key: 'stapleCount', label: 'Staple Count' },
		{ key: 'punch', label: 'Punch' },
		{ key: 'punchCount', label: 'Punch Count' },
		{ key: 'completedSets', label: 'Completed Sets' },
		{ key: 'completedPages', label: 'Completed Pages' },
		{ key: 'originalCount', label: 'Original Count' },
		{ key: 'originalSize', label: 'Original Size' },
		{ key: 'printerJobId', label: 'Job ID' }
	] as const;
	type ColumnKey = (typeof ALL_COLUMNS)[number]['key'];

	const DEFAULT_COLUMNS: ColumnKey[] = [
		'startedAt',
		'source',
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

	// Search
	let searchInput = $state(data.q);
	function submitSearch(e: SubmitEvent) {
		e.preventDefault();
		const params = new URLSearchParams();
		if (searchInput.trim()) params.set('q', searchInput.trim());
		if (data.unmatchedOnly) params.set('unmatched', '1');
		goto(`/jobs?${params}`);
	}

	// Row selection for bulk assign
	let selected = new SvelteSet<number>();
	const allSelected = $derived(
		data.rows.length > 0 && data.rows.every((r) => selected.has(r.id))
	);
	const someSelected = $derived(selected.size > 0 && !allSelected);

	function toggleAll(checked: boolean) {
		if (checked) data.rows.forEach((r) => selected.add(r.id));
		else selected.clear();
	}

	function toggleRow(id: number, checked: boolean) {
		if (checked) selected.add(id);
		else selected.delete(id);
	}

	// Header checkbox ref for indeterminate state
	let headerCheckbox = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (headerCheckbox) headerCheckbox.indeterminate = someSelected;
	});
</script>

<div class="space-y-6 pb-24">
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
			<div class="flex items-center gap-3 px-6 pt-4">
				<form onsubmit={submitSearch} class="flex gap-2">
					<Input
						placeholder="Filter by code, name, department…"
						bind:value={searchInput}
						class="w-72"
					/>
					<Button type="submit" variant="outline" size="sm">Filter</Button>
					{#if data.q}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => {
								searchInput = '';
								const params = new URLSearchParams();
								if (data.unmatchedOnly) params.set('unmatched', '1');
								goto(`/jobs?${params}`);
							}}
						>
							Clear
						</Button>
					{/if}
				</form>
				{#if data.q}
					<span class="text-sm text-muted-foreground">Filtered by "{data.q}"</span>
				{/if}
			</div>
			<div class="overflow-x-auto px-6 pb-6 pt-3">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-8">
								<input
									type="checkbox"
									bind:this={headerCheckbox}
									checked={allSelected}
									onchange={(e) => toggleAll((e.target as HTMLInputElement).checked)}
									class="cursor-pointer"
								/>
							</Table.Head>
							{#if isVisible('startedAt')}<Table.Head>Date</Table.Head>{/if}
							{#if isVisible('completedAt')}<Table.Head>Completed</Table.Head>{/if}
							{#if isVisible('jobMode')}<Table.Head>Job Mode</Table.Head>{/if}
							{#if isVisible('source')}<Table.Head>Source</Table.Head>{/if}
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
							{#if isVisible('paperType')}<Table.Head>Paper Type</Table.Head>{/if}
							{#if isVisible('duplexSetup')}<Table.Head>Duplex</Table.Head>{/if}
							{#if isVisible('resolution')}<Table.Head>Resolution</Table.Head>{/if}
							{#if isVisible('directAddress')}<Table.Head>Direct Address</Table.Head>{/if}
							{#if isVisible('computerName')}<Table.Head>Computer Name</Table.Head>{/if}
							{#if isVisible('fileName')}<Table.Head>File Name</Table.Head>{/if}
							{#if isVisible('outputMode')}<Table.Head>Output Mode</Table.Head>{/if}
							{#if isVisible('staple')}<Table.Head>Staple</Table.Head>{/if}
							{#if isVisible('stapleCount')}<Table.Head class="text-right">Staple Count</Table.Head>{/if}
							{#if isVisible('punch')}<Table.Head>Punch</Table.Head>{/if}
							{#if isVisible('punchCount')}<Table.Head class="text-right">Punch Count</Table.Head>{/if}
							{#if isVisible('completedSets')}<Table.Head class="text-right">Completed Sets</Table.Head>{/if}
							{#if isVisible('completedPages')}<Table.Head class="text-right">Completed Pages</Table.Head>{/if}
							{#if isVisible('originalCount')}<Table.Head class="text-right">Original Count</Table.Head>{/if}
							{#if isVisible('originalSize')}<Table.Head>Original Size</Table.Head>{/if}
							{#if isVisible('printerJobId')}<Table.Head>Job ID</Table.Head>{/if}
							<Table.Head class="w-72"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.rows as row (row.id)}
							<Table.Row class={selected.has(row.id) ? 'bg-muted/50' : ''}>
								<Table.Cell>
									<input
										type="checkbox"
										checked={selected.has(row.id)}
										onchange={(e) => toggleRow(row.id, (e.target as HTMLInputElement).checked)}
										class="cursor-pointer"
									/>
								</Table.Cell>
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
								{#if isVisible('source')}
									<Table.Cell>
										{#if row.source === 'network'}
											<Badge variant="secondary">Gateway</Badge>
										{:else if row.source === 'walkup'}
											<Badge variant="outline">Walk-up</Badge>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</Table.Cell>
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
								{#if isVisible('paperType')}
									<Table.Cell>{row.paperType ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('duplexSetup')}
									<Table.Cell>{row.duplexSetup ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('resolution')}
									<Table.Cell>{row.resolution ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('directAddress')}
									<Table.Cell>{row.directAddress ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('computerName')}
									<Table.Cell>{row.computerName ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('fileName')}
									<Table.Cell class="max-w-48 truncate">{row.fileName ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('outputMode')}
									<Table.Cell>{row.outputMode ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('staple')}
									<Table.Cell>{row.staple ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('stapleCount')}
									<Table.Cell class="text-right">{row.stapleCount ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('punch')}
									<Table.Cell>{row.punch ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('punchCount')}
									<Table.Cell class="text-right">{row.punchCount ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('completedSets')}
									<Table.Cell class="text-right">{row.completedSets ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('completedPages')}
									<Table.Cell class="text-right">{row.completedPages ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('originalCount')}
									<Table.Cell class="text-right">{row.originalCount ?? '—'}</Table.Cell>
								{/if}
								{#if isVisible('originalSize')}
									<Table.Cell>{row.originalSize ?? '—'}</Table.Cell>
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
												<Select.Content class="max-h-64 overflow-y-auto">
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
									colspan={visibleColumns.size + 2}
									class="text-center text-muted-foreground"
								>
									No jobs {data.unmatchedOnly ? 'need attention' : 'synced yet'}{data.q
										? ` matching "${data.q}"`
										: ''}.
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
				href="/jobs?page={data.page + 1}{data.unmatchedOnly ? '&unmatched=1' : ''}{data.q
					? `&q=${encodeURIComponent(data.q)}`
					: ''}"
			>
				Next Page
			</Button>
		</div>
	{/if}
</div>

<!-- Bulk assign bar — fixed at bottom when rows are selected -->
{#if selected.size > 0}
	<div class="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg">
		<form
			method="POST"
			action="?/bulkAssign"
			use:enhance={() => {
				return ({ update }) => {
					selected.clear();
					update();
				};
			}}
			class="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3"
		>
			{#each [...selected] as id (id)}
				<input type="hidden" name="jobId" value={id} />
			{/each}
			<span class="shrink-0 text-sm font-medium">
				{selected.size} job{selected.size !== 1 ? 's' : ''} selected
			</span>
			<Select.Root type="single" name="personId">
				<Select.Trigger class="h-8 w-36 text-xs">Person</Select.Trigger>
				<Select.Content class="max-h-64 overflow-y-auto">
					<Select.Item value="">— keep current —</Select.Item>
					{#each data.people as p (p.id)}
						<Select.Item value={String(p.id)}>{p.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" name="departmentId">
				<Select.Trigger class="h-8 w-40 text-xs">Department</Select.Trigger>
				<Select.Content class="max-h-64 overflow-y-auto">
					<Select.Item value="">— keep current —</Select.Item>
					{#each data.departments as d (d.id)}
						<Select.Item value={String(d.id)}>{d.code} — {d.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Button size="sm" type="submit">
				Assign {selected.size} job{selected.size !== 1 ? 's' : ''}
			</Button>
			<Button variant="ghost" size="sm" type="button" onclick={() => selected.clear()}>
				Cancel
			</Button>
		</form>
	</div>
{/if}
