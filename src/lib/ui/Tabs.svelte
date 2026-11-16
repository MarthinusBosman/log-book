<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	type Tab = { id: string; label: string; count?: number };
	type Props = {
		tabs: Tab[];
		value?: string;
		class?: string;
		/**
		 * Link mode: each tab is an `<a href={href(id)}>` (e.g. `?tab=paid`), so tabs work before
		 * hydration and without JS (the page reads the param on load). Once hydrated a plain click
		 * switches in place; modified clicks (new tab/window) follow the link.
		 */
		href?: (id: string) => string;
		/** Rendered with the active tab id. */
		children?: Snippet<[string]>;
	};

	let { tabs, value = $bindable(tabs[0]?.id ?? ''), class: className, href, children }: Props = $props();
	const uid = $props.id();

	function onkeydown(e: KeyboardEvent) {
		const i = tabs.findIndex((t) => t.id === value);
		let next = i;
		if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
		else return;
		e.preventDefault();
		value = tabs[next].id;
		document.getElementById(`${uid}-tab-${value}`)?.focus();
	}

	function select(e: MouseEvent, id: string) {
		if (href) {
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
			e.preventDefault();
		}
		value = id;
	}

	const tabClass = (active: boolean) =>
		cn(
			'inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 whitespace-nowrap text-sm font-medium transition-all duration-150',
			active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
		);
</script>

{#snippet label(tab: Tab)}
	{tab.label}
	{#if tab.count !== undefined}
		<span class="rounded-md bg-surface-2 px-1.5 text-xs text-muted tabular-nums">{tab.count}</span>
	{/if}
{/snippet}

<div class={className}>
	<div
		role="tablist"
		tabindex="-1"
		class="scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2/60 p-1"
		{onkeydown}
	>
		{#each tabs as tab (tab.id)}
			{@const active = tab.id === value}
			{#if href}
				<a
					id="{uid}-tab-{tab.id}"
					href={href(tab.id)}
					role="tab"
					aria-selected={active}
					aria-controls="{uid}-panel"
					tabindex={active ? 0 : -1}
					data-sveltekit-reset="false"
					class={tabClass(active)}
					onclick={(e) => select(e, tab.id)}
				>
					{@render label(tab)}
				</a>
			{:else}
				<button
					id="{uid}-tab-{tab.id}"
					type="button"
					role="tab"
					aria-selected={active}
					aria-controls="{uid}-panel"
					tabindex={active ? 0 : -1}
					class={tabClass(active)}
					onclick={(e) => select(e, tab.id)}
				>
					{@render label(tab)}
				</button>
			{/if}
		{/each}
	</div>
	<div id="{uid}-panel" role="tabpanel" aria-labelledby="{uid}-tab-{value}" class="mt-4">
		{@render children?.(value)}
	</div>
</div>
