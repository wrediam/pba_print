<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// When visited without a login session the page renders standalone
	// (no admin nav/wrapper from the layout), so we center it ourselves.
	const standalone = $derived(!data.user);

	// Auto-detect the visitor's OS so we lead with the right installer.
	// Detection only runs in the browser; server render defaults to
	// 'unknown' and both options show, so nothing is hidden if JS is off.
	let os = $state<'mac' | 'windows' | 'unknown'>('unknown');
	$effect(() => {
		const ua = navigator.userAgent;
		// navigator.platform is deprecated but still the most reliable quick
		// signal; userAgentData.platform is used when present (Chromium) as
		// the forward-looking replacement, with userAgent as the fallback.
		const platform =
			(navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
			navigator.platform ??
			'';
		const hay = `${platform} ${ua}`.toLowerCase();
		if (hay.includes('win')) os = 'windows';
		else if (hay.includes('mac') || hay.includes('iphone') || hay.includes('ipad')) os = 'mac';
		else os = 'unknown';
	});

	const showMac = $derived(os === 'mac' || os === 'unknown');
	const showWindows = $derived(os === 'windows' || os === 'unknown');
</script>

<div class={standalone ? 'flex min-h-screen flex-col items-center justify-center bg-muted p-6' : ''}>
	<div class="w-full max-w-xl space-y-6">
		<div>
			<h1 class="text-2xl font-semibold">Church Copier Setup</h1>
			<p class="text-muted-foreground">
				Sets up the copier on your computer and lets you pick which department profiles to install.
				Always uses the current {data.departmentCount} active department code(s).
			</p>
			{#if os === 'mac'}
				<p class="mt-1 text-sm text-muted-foreground">Detected macOS — the Mac installer is below.</p>
			{:else if os === 'windows'}
				<p class="mt-1 text-sm text-muted-foreground">
					Detected Windows — the Windows installer is below.
				</p>
			{/if}
		</div>

		{#if showMac}
			<Card.Root>
				<Card.Header>
					<Card.Title>macOS</Card.Title>
					<Card.Description>"Fix Church Printer.app"</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Button href="/download-app/file" download="Fix Church Printer.zip">
						Download for Mac
					</Button>
					<Alert.Root>
						<Alert.Title>First launch on each Mac</Alert.Title>
						<Alert.Description>
							macOS will say the app is from an unidentified developer. Right-click (or
							Control-click) the app and choose "Open" the first time — that shows an "Open Anyway"
							option a normal double-click doesn't.
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if showWindows}
			<Card.Root>
				<Card.Header>
					<Card.Title>Windows</Card.Title>
					<Card.Description>"Church Printer Setup" (Windows 10 1809+ / Windows 11)</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Button href="/download-app/windows" download="Church Printer Setup (Windows).zip">
						Download for Windows
					</Button>
					<Alert.Root>
						<Alert.Title>How to run it</Alert.Title>
						<Alert.Description>
							Unzip the file, keep both items in the folder together, then double-click "Install
							Church Printer.bat" and click "Yes" when Windows asks for administrator permission.
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if os !== 'unknown'}
			<p class="text-center text-sm text-muted-foreground">
				Need the other one?
				{#if os === 'mac'}
					<a
						class="underline"
						href="/download-app/windows"
						download="Church Printer Setup (Windows).zip">Download for Windows</a
					>
				{:else}
					<a class="underline" href="/download-app/file" download="Fix Church Printer.zip"
						>Download for Mac</a
					>
				{/if}
			</p>
		{/if}
	</div>
</div>
