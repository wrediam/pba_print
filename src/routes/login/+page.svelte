<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-muted p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title class="text-xl">Church Printer Dashboard</Card.Title>
			<Card.Description>Sign in to continue.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="username">Username</Label>
					<Input id="username" name="username" autocomplete="username" required />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
					/>
				</div>
				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}
				<Button type="submit" class="w-full">Sign In</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
