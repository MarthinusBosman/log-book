<script lang="ts">
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { brand } from '#lib/brand.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const initials = $derived(
		data.dz.name
			.split(/\s+/)
			.filter((w) => /^[A-Za-z0-9]/.test(w))
			.slice(0, 2)
			.map((w) => w[0].toUpperCase())
			.join('')
	);
</script>

<svelte:head>{@html data.branding.style}</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="sticky top-0 z-30 border-b border-border/60 bg-bg/75 backdrop-blur-xl">
		<div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
			<a href="/dz/{data.dz.slug}" class="flex min-w-0 items-center gap-2.5">
				{#if data.branding.logoUrl}
					<img src={data.branding.logoUrl} alt="{data.dz.name} logo" class="h-8 max-w-28 shrink-0 object-contain" data-testid="dz-logo" />
				{:else}
					<span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-fg shadow-glow">{initials}</span>
				{/if}
				<span class="truncate font-semibold tracking-tight">{data.dz.name}</span>
			</a>
			<div class="ml-auto flex items-center gap-1">
				<ThemeToggle />
			</div>
		</div>
	</header>
	<main class="flex-1">
		{@render children()}
	</main>
	<footer class="border-t border-border/60 py-6 text-center text-xs text-subtle">
		{data.dz.name} · Bookings by <a href="/" class="font-medium text-muted hover:text-fg">{brand.name}</a>
	</footer>
</div>
