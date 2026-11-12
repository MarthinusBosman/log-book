<script lang="ts">
	import { cn } from '#lib/ui/cn.ts';

	type Props = { label: string; value: number; max: number | null; unit?: string; class?: string };
	let { label, value, max, unit = '', class: className }: Props = $props();

	const pct = $derived(max ? Math.min(100, (value / max) * 100) : 0);
	const over = $derived(max != null && value > max);
	const tone = $derived(over ? 'bg-danger' : pct >= 100 ? 'bg-warning' : pct >= 85 ? 'bg-warning/80' : 'bg-primary');
</script>

<div class={cn('min-w-0', className)}>
	<div class="flex items-baseline justify-between gap-2 text-xs">
		<span class="text-subtle">{label}</span>
		<span class={cn('font-medium tabular-nums', over ? 'text-danger' : 'text-fg')}>
			{Math.round(value)}{#if max != null}<span class="text-subtle">/{max}</span>{/if}{unit}
		</span>
	</div>
	<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max ?? undefined}>
		{#if max}<div class={cn('h-full rounded-full transition-[width] duration-500', tone)} style="width: {pct}%"></div>{/if}
	</div>
</div>
