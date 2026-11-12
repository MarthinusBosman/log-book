<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/ui/index.ts';

	/** Compact stat for phone grids (the shared Stat is roomier). */
	type Props = { label: string; value: string | number; hint?: string; tone?: 'default' | 'warning' | 'danger' | 'success'; href?: string; icon?: Snippet; class?: string };
	let { label, value, hint, tone = 'default', href, icon, class: className }: Props = $props();
	const tones = { default: 'text-fg', warning: 'text-warning', danger: 'text-danger', success: 'text-success' };
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	class={cn(
		'flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors',
		href && 'hover:border-border-strong hover:bg-surface-2/40',
		className
	)}
>
	<span class="flex items-center justify-between gap-2 text-xs font-medium text-muted">
		{label}
		{#if icon}<span class="text-subtle">{@render icon()}</span>{/if}
	</span>
	<span class={cn('mt-1.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl', tones[tone])}>{value}</span>
	{#if hint}<span class="mt-0.5 truncate text-xs text-muted">{hint}</span>{/if}
</svelte:element>
