<script lang="ts">
	import { Button, Card } from '#lib/ui/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Glyph from '#lib/components/import/Glyph.svelte';
	import { brand } from '#lib/brand.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.summary);
</script>

<svelte:head><title>Export data</title></svelte:head>

<div class="mx-auto max-w-5xl">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Export your data</h1>
			<p class="mt-1 max-w-2xl text-muted">
				Your data is yours. Exports use the same open format the importer reads, so you can move between {brand.name} instances — hosted or
				self-hosted — at any time.
			</p>
		</div>
		<a href="/app/import" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
			<Glyph name="upload" class="size-4" /> Import data
		</a>
	</header>

	<section class="mt-8">
		<h2 class="text-xs font-medium tracking-wider text-subtle uppercase">Personal</h2>
		<div class="mt-3 grid gap-4 md:grid-cols-2">
			<Card class="flex flex-col">
				<div class="flex items-start gap-3">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="book" class="size-5" /></span>
					<div class="min-w-0">
						<h3 class="font-semibold">Everything (JSON bundle)</h3>
						<p class="mt-0.5 text-sm text-muted">Profile, licences and ratings, {s.jumps.toLocaleString()} logbook jumps and {s.rigs} {s.rigs === 1 ? 'rig' : 'rigs'}. Import it on any instance.</p>
					</div>
				</div>
				<div class="mt-5 flex justify-end pt-1 md:mt-auto">
					<Button href="/app/export/me.json" data-sveltekit-reload download data-testid="export-json"><Glyph name="download" class="size-4" /> Download .json</Button>
				</div>
			</Card>
			<Card class="flex flex-col">
				<div class="flex items-start gap-3">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><Glyph name="sheet" /></span>
					<div class="min-w-0">
						<h3 class="font-semibold">Logbook spreadsheet (CSV)</h3>
						<p class="mt-0.5 text-sm text-muted">One row per jump with sign-offs — opens in Excel, Numbers or Google Sheets.</p>
					</div>
				</div>
				<div class="mt-5 flex justify-end pt-1 md:mt-auto">
					<Button href="/app/export/logbook.csv" variant="secondary" data-sveltekit-reload download data-testid="export-csv"><Glyph name="download" class="size-4" /> Download .csv</Button>
				</div>
			</Card>
		</div>
	</section>

	{#if s.dropzone}
		<section class="mt-10">
			<h2 class="text-xs font-medium tracking-wider text-subtle uppercase">Dropzone</h2>
			<Card class="mt-3">
				<div class="flex flex-col gap-5 sm:flex-row sm:items-center">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning"><Icon name="server" class="size-5" /></span>
					<div class="min-w-0 flex-1">
						<h3 class="font-semibold">{s.dropzone.name}</h3>
						<p class="mt-0.5 text-sm text-muted">
							Settings, prices, aircraft, staff, rigs, teams, waivers, tandems, {s.dropzone.loads.toLocaleString()} loads with slots, and
							{s.dropzone.members.toLocaleString()} member profiles with wallet balances. Contains personal data — store it securely.
						</p>
					</div>
					<Button href="/app/export/dropzone.json" data-sveltekit-reload download class="shrink-0" data-testid="export-dz"><Glyph name="download" class="size-4" /> Export dropzone</Button>
				</div>
			</Card>
		</section>
	{/if}
</div>
