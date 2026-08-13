<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold">Departments</h1>
		<p class="text-muted-foreground">
			Department codes from the copier-codes sheet. The account number embedded on each print job is
			a person's code plus a department code (e.g. 598 + 61 = 59861). Non-billable departments
			(e.g. USB Scans) are excluded from billing reports.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Add Department</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance class="flex items-end gap-3">
				<div class="space-y-2">
					<Label for="code">Code</Label>
					<Input id="code" name="code" placeholder="61" class="w-24" required />
				</div>
				<div class="flex-1 space-y-2">
					<Label for="label">Label</Label>
					<Input id="label" name="label" placeholder="Youth Dept." required />
				</div>
				<Button type="submit">Add</Button>
			</form>
			{#if form?.error}
				<p class="mt-2 text-sm text-destructive">{form.error}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="overflow-x-auto p-0">
			<div class="px-6 pb-6 pt-6">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-24">Code</Table.Head>
						<Table.Head>Label</Table.Head>
						<Table.Head class="w-24">Status</Table.Head>
						<Table.Head class="w-24">Billing</Table.Head>
						<Table.Head class="w-48"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.departments as dept (dept.id)}
						<Table.Row>
							<Table.Cell class="font-mono">{dept.code}</Table.Cell>
							<Table.Cell>{dept.label}</Table.Cell>
							<Table.Cell>
								<Badge variant={dept.active ? 'default' : 'secondary'}>
									{dept.active ? 'Active' : 'Inactive'}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={dept.billable ? 'default' : 'outline'}>
									{dept.billable ? 'Billable' : 'Not billed'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex justify-end gap-2">
									<form method="POST" action="?/toggleBillable" use:enhance>
										<input type="hidden" name="id" value={dept.id} />
										<input type="hidden" name="billable" value={dept.billable} />
										<Button variant="ghost" size="sm" type="submit">
											{dept.billable ? 'Mark not billed' : 'Mark billable'}
										</Button>
									</form>
									<form method="POST" action="?/toggleActive" use:enhance>
										<input type="hidden" name="id" value={dept.id} />
										<input type="hidden" name="active" value={dept.active} />
										<Button variant="outline" size="sm" type="submit">
											{dept.active ? 'Deactivate' : 'Reactivate'}
										</Button>
									</form>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			</div>
		</Card.Content>
	</Card.Root>
</div>
