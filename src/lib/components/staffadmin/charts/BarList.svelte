<script lang="ts">
	/** Ranked horizontal bars (label · bar · value). Bars are SVG, text is HTML. */
	import { cn } from '#lib/ui/index.ts';

	type Row = { label: string; value: number; sub?: string };
	type Props = { rows: Row[]; format?: (n: number) => string; color?: string; class?: string; empty?: string; label: string };
	let { rows, format = (n) => String(n), color = 'var(--color-primary)', class: className, empty = 'No data in this range.', label }: Props = $props();
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));
</script>

<ul class={cn('space-y-2.5', className)} aria-label={label}>
	{#each rows as r (r.label)}
		<li class="grid grid-cols-[minmax(0,1.1fr)_minmax(3rem,2fr)_auto] items-center gap-3 text-sm">
			<span class="min-w-0 truncate" title={r.label}>{r.label}{#if r.sub}<span class="block truncate text-xs text-muted">{r.sub}</span>{/if}</span>
			<svg viewBox="0 0 100 10" preserveAspectRatio="none" class="h-2.5 w-full" aria-hidden="true">
				<rect x="0" y="0" width="100" height="10" rx="5" class="fill-surface-2" />
				<rect x="0" y="0" width={Math.max((Math.abs(r.value) / max) * 100, r.value ? 1.5 : 0)} height="10" rx="5" fill={color} />
			</svg>
			<span class="text-right font-medium tabular-nums">{format(r.value)}</span>
		</li>
	{:else}
		<li class="py-6 text-center text-sm text-muted">{empty}</li>
	{/each}
</ul>
