<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	type Props = {
		label: string;
		value: string | number;
		hint?: string;
		delta?: string;
		trend?: 'up' | 'down' | 'flat';
		icon?: Snippet;
		class?: string;
	};
	let { label, value, hint, delta, trend = 'flat', icon, class: className }: Props = $props();
	const trendClass = { up: 'text-success', down: 'text-danger', flat: 'text-muted' };
</script>

<div class={cn('rounded-2xl border border-border bg-surface p-5', className)}>
	<div class="flex items-center justify-between gap-3">
		<p class="text-sm font-medium text-muted">{label}</p>
		{#if icon}<span class="text-subtle">{@render icon()}</span>{/if}
	</div>
	<p class="mt-2 text-3xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
	{#if delta || hint}
		<p class="mt-1 text-sm">
			{#if delta}<span class={cn('font-medium', trendClass[trend])}>{delta}</span>{/if}
			{#if hint}<span class="text-muted">{hint}</span>{/if}
		</p>
	{/if}
</div>
