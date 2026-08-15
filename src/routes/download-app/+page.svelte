<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// When visited without a login session the page renders standalone
	// (no admin nav/wrapper from the layout), so we center it ourselves.
	const standalone = $derived(!data.user);
</script>

<div class={standalone ? 'flex min-h-screen flex-col items-center justify-center bg-muted p-6' : ''}>
	<div class="w-full max-w-xl space-y-6">
		<div>
			<h1 class="text-2xl font-semibold">macOS Setup App</h1>
			<p class="text-muted-foreground">
				"Fix Church Printer.app" — sets up the copier correctly on a Mac and lets people pick which
				department profiles to install. This download always includes the current {data.departmentCount}
				active department code(s).
			</p>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Download</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<Button href="/download-app/file" download="Fix Church Printer.zip">Download Fix Church Printer.zip</Button>
				<Alert.Root>
					<Alert.Title>First launch on each Mac</Alert.Title>
					<Alert.Description>
						macOS will say the app is from an unidentified developer. Right-click (or Control-click)
						the app and choose "Open" the first time — that shows an "Open Anyway" option a normal
						double-click doesn't.
					</Alert.Description>
				</Alert.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>
