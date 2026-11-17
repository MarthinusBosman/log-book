<script lang="ts">
	import HangarBoard from '#lib/components/manifest/HangarBoard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- +page@: a full-screen TV board, not inside the public booking header/footer. -->
<svelte:head>
	{@html data.brand.style}
	<title>{data.dz.name} · Loads</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<HangarBoard dzName={data.dz.name} logoUrl={data.brand.logoUrl} timezone={data.dz.timezone} day={data.day} today={data.today} serverNow={data.serverNow} loads={data.loads} depends="manifest:display" />
