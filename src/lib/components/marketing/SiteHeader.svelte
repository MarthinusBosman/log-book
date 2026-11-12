<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import { brand } from '#lib/brand.ts';
	import ThemeSwitch from './ThemeSwitch.svelte';

	const links = [
		{ href: '/#dropzones', label: 'Dropzones' },
		{ href: '/#jumpers', label: 'Jumpers' },
		{ href: '/features', label: 'Features' },
		{ href: '/self-host', label: 'Self-host' },
		{ href: '/#pricing', label: 'Pricing' }
	];
	const signedIn = $derived(Boolean(page.data.user));
	const current = (href: string) => !href.includes('#') && page.url.pathname === href;
</script>

<header
	class="sticky top-0 z-50 border-b border-transparent bg-bg/75 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-bg/60 [&:has(details[open])]:border-border"
>
	<div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
		<a href="/" class="mr-2 rounded-lg" aria-label="{brand.name} home"><Logo /></a>
		<nav class="hidden items-center gap-1 text-sm md:flex" aria-label="Main">
			{#each links as l (l.href)}
				<a
					href={l.href}
					aria-current={current(l.href) ? 'page' : undefined}
					class="rounded-lg px-3 py-2 text-muted transition-colors hover:text-fg aria-[current=page]:text-fg"
					>{l.label}</a
				>
			{/each}
		</nav>
		<div class="ml-auto flex items-center gap-1.5">
			<ThemeSwitch />
			{#if signedIn}
				<a
					href="/app"
					class="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-fg transition-colors hover:bg-brand-600"
					>Open app</a
				>
			{:else}
				<a
					href="/login"
					class="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-fg sm:inline-flex"
					>Log in</a
				>
				<a
					href="/signup"
					class="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-fg transition-colors hover:bg-brand-600"
					>Start free</a
				>
			{/if}
			<details class="group relative md:hidden">
				<summary
					class="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
					aria-label="Menu"
				>
					<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
						<path class="group-open:hidden" d="M4 7h16M4 12h16M4 17h16" />
						<path class="hidden group-open:block" d="M6 6l12 12M18 6 6 18" />
					</svg>
				</summary>
				<nav
					class="fixed inset-x-0 top-16 border-b border-border bg-bg px-5 pt-2 pb-6 shadow-2xl shadow-black/20"
					aria-label="Mobile"
				>
					<ul class="divide-y divide-border">
						{#each links as l (l.href)}
							<li><a href={l.href} class="block py-3.5 text-base">{l.label}</a></li>
						{/each}
						{#if !signedIn}
							<li><a href="/login" class="block py-3.5 text-base text-muted">Log in</a></li>
						{/if}
					</ul>
				</nav>
			</details>
		</div>
	</div>
</header>
