<script lang="ts">
	import ImportPage from '#lib/components/import/ImportPage.svelte';
	import Glyph from '#lib/components/import/Glyph.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const name = $derived(data.current?.dropzone.name ?? 'this dropzone');
</script>

<svelte:head><title>Import dropzone data</title></svelte:head>

<ImportPage
	mode="dropzone"
	title="Import dropzone data"
	subtitle={`Move ${name} over from Jump Master or another instance: aircraft, prices, staff, waivers, tandems, loads and jumper profiles. Jumpers are matched by email; unknown jumpers become placeholder profiles they can claim later.`}
	{data}
	{form}
	basePath="/app/settings/import"
	nextHref="/app"
	nextLabel="Go to dashboard"
	timezone={data.dz.timezone}
	currency={data.dz.currency}
>
	{#snippet aside()}
		<a href="/app/export" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
			<Glyph name="download" class="size-4" /> Export dropzone
		</a>
	{/snippet}
</ImportPage>
