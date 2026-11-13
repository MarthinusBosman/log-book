<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { brand } from '#lib/brand.ts';
	import { LEGAL } from '#lib/legal.ts';

	let {
		eyebrow,
		title,
		intro,
		toc,
		children
	}: { eyebrow: string; title: string; intro: string; toc: { id: string; label: string }[]; children: Snippet } = $props();

	/** On a self-hosted server this page still describes the hosted service; say so up front. */
	const host = $derived(page.url.hostname);
	const hosted = $derived(host === brand.domain || host.endsWith(`.${brand.domain}`));
</script>

<section class="relative isolate border-b border-border">
	<div class="bg-chart absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true"></div>
	<div class="mx-auto max-w-3xl px-5 pt-16 pb-12 sm:px-8 sm:pt-20">
		<p class="font-mono text-xs font-medium tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
		<h1 class="mt-4 text-4xl font-[580] tracking-[-0.03em] text-balance sm:text-5xl">{title}</h1>
		<p class="mt-6 text-lg leading-relaxed text-muted">{intro}</p>
		<p class="mt-4 text-sm text-subtle">
			Effective <time datetime={LEGAL.effective}>{LEGAL.effectiveLabel}</time> · Covers the hosted service at {brand.domain}
		</p>
		{#if !hosted}
			<p class="mt-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-fg" data-testid="selfhost-note">
				You're on <strong class="font-medium">{host}</strong>, not {brand.domain}. This text describes the hosted
				service. Whoever runs this server is responsible for the data on it; ask them for their own policy.
			</p>
		{/if}
	</div>
</section>

<div class="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
	<nav aria-label="On this page" class="lg:sticky lg:top-24 lg:self-start">
		<details class="group rounded-xl border border-border lg:border-0" open>
			<summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium lg:hidden">On this page</summary>
			<ol class="space-y-2 px-4 pb-4 text-sm lg:p-0">
				{#each toc as t (t.id)}
					<li><a href="#{t.id}" class="text-muted transition-colors hover:text-fg">{t.label}</a></li>
				{/each}
			</ol>
		</details>
	</nav>
	<article class="legal min-w-0 max-w-3xl space-y-12 leading-relaxed">
		{@render children()}
	</article>
</div>

<style>
	.legal :global(h2) {
		font-size: 1.5rem;
		font-weight: 580;
		letter-spacing: -0.02em;
		scroll-margin-top: 6rem;
	}
	.legal :global(h3) {
		margin-top: 1.5rem;
		font-weight: 600;
	}
	.legal :global(p),
	.legal :global(ul),
	.legal :global(table) {
		margin-top: 1rem;
		color: var(--color-muted);
	}
	.legal :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.legal :global(li + li) {
		margin-top: 0.5rem;
	}
	.legal :global(strong) {
		color: var(--color-fg);
		font-weight: 600;
	}
	.legal :global(a) {
		color: var(--color-primary);
		/* always underlined: colour alone doesn't set links apart from the muted body text */
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}
	.legal :global(a:hover) {
		text-decoration-thickness: 2px;
	}
	.legal :global(table) {
		width: 100%;
		font-size: 0.875rem;
		border-collapse: collapse;
	}
	.legal :global(th),
	.legal :global(td) {
		border-top: 1px solid var(--color-border);
		padding: 0.6rem 0.75rem 0.6rem 0;
		text-align: left;
		vertical-align: top;
	}
	.legal :global(th) {
		color: var(--color-fg);
		font-weight: 500;
	}
</style>
