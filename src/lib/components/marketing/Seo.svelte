<script lang="ts">
	import { page } from '$app/state';
	import { brand } from '#lib/brand.ts';

	let { title, description = brand.description }: { title?: string; description?: string } = $props();

	const fullTitle = $derived(title ? `${title} · ${brand.name}` : `${brand.name}: ${brand.tagline}`);
	const url = $derived(page.url.origin + page.url.pathname);
	const image = $derived(`${page.url.origin}/og.png`);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={brand.name} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="{brand.name}: {brand.tagline}" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
</svelte:head>
