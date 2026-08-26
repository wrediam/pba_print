<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const navLinks = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/jobs', label: 'Print Jobs' },
		{ href: '/reports', label: 'Billing Report' },
		{ href: '/departments', label: 'Departments' },
		{ href: '/people', label: 'People' },
		{ href: '/rates', label: 'Rates' },
		{ href: '/gateway', label: 'Gateway' },
		{ href: '/download-app', label: 'Setup App' }
	];
</script>

{#if data.user}
	<div class="min-h-screen">
		<header class="border-b bg-card print:hidden">
			<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
				<div class="flex items-center gap-6">
					<span class="font-semibold">Church Printer Dashboard</span>
					<nav class="flex gap-1">
						{#each navLinks as link (link.href)}
							<a
								href={link.href}
								class="rounded-md px-3 py-1.5 text-sm transition-colors {page.url.pathname ===
								link.href
									? 'bg-secondary font-medium text-secondary-foreground'
									: 'text-muted-foreground hover:bg-secondary/50'}"
							>
								{link.label}
							</a>
						{/each}
					</nav>
				</div>
				<form method="POST" action="/logout">
					<Button variant="ghost" size="sm" type="submit">Sign Out</Button>
				</form>
			</div>
		</header>
		<main class="mx-auto max-w-6xl px-4 py-6">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}
