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

	let search = $state('');
	let editingId = $state<number | null>(null);
	let editCode = $state('');
	let editName = $state('');

	const filtered = $derived(
		search.trim()
			? data.people.filter(
					(p) =>
						p.name.toLowerCase().includes(search.toLowerCase()) ||
						p.personalCode.includes(search)
				)
			: data.people
	);

	function startEdit(p: (typeof data.people)[number]) {
		editingId = p.id;
		editCode = p.personalCode;
		editName = p.name;
	}

	function cancelEdit() {
		editingId = null;
	}
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
		<Card.Content class="p-0">
			<div class="px-6 pt-4">
				<Input
					placeholder="Search by name or code…"
					bind:value={search}
					class="max-w-xs"
				/>
			</div>
			<div class="overflow-x-auto px-6 pb-6 pt-3">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-28">Code</Table.Head>
							<Table.Head>Name</Table.Head>
							<Table.Head class="w-24">Status</Table.Head>
							<Table.Head class="w-56"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filtered as p (p.id)}
							<Table.Row>
								{#if editingId === p.id}
									<Table.Cell>
										<Input bind:value={editCode} class="h-8 w-24 font-mono text-sm" />
									</Table.Cell>
									<Table.Cell>
										<Input bind:value={editName} class="h-8 text-sm" />
									</Table.Cell>
									<Table.Cell></Table.Cell>
									<Table.Cell class="text-right">
										<div class="flex justify-end gap-2">
											<form
												method="POST"
												action="?/update"
												use:enhance={() => {
													return ({ update }) => {
														editingId = null;
														update();
													};
												}}
											>
												<input type="hidden" name="id" value={p.id} />
												<input type="hidden" name="personalCode" value={editCode} />
												<input type="hidden" name="name" value={editName} />
												<Button size="sm" type="submit">Save</Button>
											</form>
											<Button variant="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
										</div>
									</Table.Cell>
								{:else}
									<Table.Cell class="font-mono">{p.personalCode}</Table.Cell>
									<Table.Cell>{p.name}</Table.Cell>
									<Table.Cell>
										<Badge variant={p.active ? 'default' : 'secondary'}>
											{p.active ? 'Active' : 'Inactive'}
										</Badge>
									</Table.Cell>
									<Table.Cell class="text-right">
										<div class="flex justify-end gap-2">
											<Button variant="ghost" size="sm" onclick={() => startEdit(p)}>
												Edit
											</Button>
											<form method="POST" action="?/toggleActive" use:enhance>
												<input type="hidden" name="id" value={p.id} />
												<input type="hidden" name="active" value={p.active} />
												<Button variant="outline" size="sm" type="submit">
													{p.active ? 'Deactivate' : 'Reactivate'}
												</Button>
											</form>
										</div>
									</Table.Cell>
								{/if}
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="text-center text-muted-foreground">
									{search ? 'No results.' : 'No people yet.'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Card.Content>
	</Card.Root>
</div>
