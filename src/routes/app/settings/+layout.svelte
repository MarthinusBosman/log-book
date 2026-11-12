<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import { Icon, cn } from '#lib/ui/index.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const href = (slug: string) => (slug ? `/app/settings/${slug}` : '/app/settings');
	const active = (slug: string) =>
		slug ? page.url.pathname.startsWith(`/app/settings/${slug}`) : page.url.pathname === '/app/settings';
	let nav: HTMLElement | undefined = $state();
	// Keep the active tab visible on narrow screens (the tab strip scrolls horizontally).
	$effect(() => {
		void page.url.pathname;
		nav?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
	});
</script>

<PageHeader icon="settings" title="Settings" description={data.dzName ? `${data.dzName} · profile, features, payments and people.` : 'Your linked accounts.'} />

{#if data.settingsTabs.length}
	<nav bind:this={nav} aria-label="Settings" class="scrollbar-none -mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
		<div class="inline-flex gap-1 rounded-xl border border-border bg-surface-2/60 p-1 sm:flex-wrap">
			{#each data.settingsTabs as tab (tab.slug)}
				<a
					href={href(tab.slug)}
					aria-current={active(tab.slug) ? 'page' : undefined}
					class={cn(
						'inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-all',
						active(tab.slug) ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
					)}
				>
					<Icon name={tab.icon} class="size-4" />
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>
{/if}

<div class="mt-6">
	{@render children()}
</div>
