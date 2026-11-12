<script lang="ts">
	import '@fontsource-variable/inter';
	import { page } from '$app/state';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { brand } from '#lib/brand.ts';
	import { Toaster } from '#lib/ui/index.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<!-- Marketing pages set their own title/description/OG tags (Seo.svelte). -->
	{#if !page.route.id?.startsWith('/(marketing)')}
		<title>{brand.name} — {brand.tagline}</title>
		<meta name="description" content={brand.description} />
	{/if}
</svelte:head>

{@render children()}
<Toaster />
