<script lang="ts">
	import ImportPage from '#lib/components/import/ImportPage.svelte';
	import Glyph from '#lib/components/import/Glyph.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Import logbook</title></svelte:head>

<ImportPage
	mode="jumper"
	title="Import your logbook"
	subtitle="Bring your jumps, gear and licence details from Jump Master, a spreadsheet, or another instance. You'll see a preview before anything is saved."
	{data}
	{form}
	basePath="/app/import"
	nextHref="/app/logbook"
	nextLabel="Open logbook"
	templateHref="/app/import/template.csv"
>
	{#snippet aside()}
		<a href="/app/export" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
			<Glyph name="download" class="size-4" /> Export my data
		</a>
	{/snippet}
</ImportPage>
