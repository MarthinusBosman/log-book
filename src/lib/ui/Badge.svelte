<script lang="ts" module>
	export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	let {
		tone = 'neutral',
		dot = false,
		class: className,
		children
	}: { tone?: BadgeTone; dot?: boolean; class?: string; children?: Snippet } = $props();

	const tones: Record<BadgeTone, string> = {
		neutral: 'bg-surface-2 text-muted border-border',
		brand: 'bg-primary/10 text-primary border-primary/25',
		success: 'bg-success/10 text-success border-success/25',
		warning: 'bg-warning/10 text-warning border-warning/25',
		danger: 'bg-danger/10 text-danger border-danger/25'
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
		tones[tone],
		className
	)}
>
	{#if dot}<span class="size-1.5 rounded-full bg-current"></span>{/if}
	{@render children?.()}
</span>
