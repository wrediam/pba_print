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
		<h1 class="text-2xl font-semibold">People</h1>
		<p class="text-muted-foreground">
			Each person's own code (e.g. Will Reeves = 598), combined with a department code to form the
			full printer account number.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Add Person</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance class="flex items-end gap-3">
				<div class="space-y-2">
					<Label for="personalCode">Personal Code</Label>
					<Input id="personalCode" name="personalCode" placeholder="598" class="w-24" required />
				</div>
				<div class="flex-1 space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" placeholder="Will Reeves" required />
				</div>
				<Button type="submit">Add</Button>
			</form>
			{#if form?.error}
				<p class="mt-2 text-sm text-destructive">{form.error}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28">Code</Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head class="w-24">Status</Table.Head>
						<Table.Head class="w-32"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.people as p (p.id)}
						<Table.Row>
							<Table.Cell class="font-mono">{p.personalCode}</Table.Cell>
							<Table.Cell>{p.name}</Table.Cell>
							<Table.Cell>
								<Badge variant={p.active ? 'default' : 'secondary'}>
									{p.active ? 'Active' : 'Inactive'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-right">
								<form method="POST" action="?/toggleActive" use:enhance>
									<input type="hidden" name="id" value={p.id} />
									<input type="hidden" name="active" value={p.active} />
									<Button variant="outline" size="sm" type="submit">
										{p.active ? 'Deactivate' : 'Reactivate'}
									</Button>
								</form>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
