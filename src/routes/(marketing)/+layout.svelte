<script lang="ts">
	import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
	import SiteFooter from '#lib/components/marketing/SiteFooter.svelte';
	import SiteHeader from '#lib/components/marketing/SiteHeader.svelte';
	import { THEME_COLORS, THEME_COOKIE } from '#lib/theme.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// ~500 bytes, the only JS on marketing pages: flip the theme in place instead of a round trip.
	const themeScript = `<script>document.addEventListener('submit',function(e){var f=e.target;if(!f.hasAttribute('data-theme-switch'))return;e.preventDefault();var r=document.documentElement,d=!r.classList.contains('dark');r.classList.toggle('dark',d);document.cookie='${THEME_COOKIE}='+(d?'dark':'light')+';path=/;max-age=31536000;samesite=lax';var m=document.querySelector('meta[name=theme-color]');m&&m.setAttribute('content',d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}')})<\/script>`;
</script>

<svelte:head>
	<link rel="preload" href={interLatin} as="font" type="font/woff2" crossorigin="anonymous" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html themeScript}
</svelte:head>

<a
	href="#main"
	class="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
	>Skip to content</a
>
<div class="relative flex min-h-dvh flex-col overflow-x-clip">
	<SiteHeader />
	<main id="main" class="flex-1">
		{@render children()}
	</main>
	<SiteFooter />
</div>
