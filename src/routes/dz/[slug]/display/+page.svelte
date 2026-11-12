<script lang="ts">
	import HangarBoard from '#lib/components/manifest/HangarBoard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.dz.name} · Loads</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<HangarBoard dzName={data.dz.name} logoUrl={data.brand.logoUrl} timezone={data.dz.timezone} day={data.day} today={data.today} serverNow={data.serverNow} loads={data.loads} depends="manifest:display" />
