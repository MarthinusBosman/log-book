<script lang="ts">
	/**
	 * Ranked horizontal bars (label · bar · value). Bars are SVG, text is HTML.
	 * Rows share one grid (subgrid) so bars and values line up. In narrow containers
	 * (phones, one-column cards) the bar drops under its label so names aren't cut short.
	 */
	import { cn } from '#lib/ui/index.ts';

	type Row = { label: string; value: number; sub?: string };
	type Props = { rows: Row[]; format?: (n: number) => string; color?: string; class?: string; empty?: string; label: string };
	let { rows, format = (n) => String(n), color = 'var(--color-primary)', class: className, empty = 'No data in this range.', label }: Props = $props();
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));
</script>

<div class={cn('@container', className)}>
	<ul class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 @md:grid-cols-[minmax(0,1.1fr)_minmax(3rem,2fr)_auto] @md:gap-y-2.5" aria-label={label}>
		{#each rows as r (r.label)}
			<li class="col-span-full grid grid-cols-subgrid items-center gap-y-1.5 text-sm">
				<span class="col-start-1 row-start-1 min-w-0 truncate" title={r.label}>{r.label}{#if r.sub}<span class="block truncate text-xs text-muted">{r.sub}</span>{/if}</span>
				<svg viewBox="0 0 100 10" preserveAspectRatio="none" class="col-span-2 row-start-2 h-2.5 w-full @md:col-span-1 @md:col-start-2 @md:row-start-1" aria-hidden="true">
					<rect x="0" y="0" width="100" height="10" rx="5" class="fill-surface-2" />
					<rect x="0" y="0" width={Math.max((Math.abs(r.value) / max) * 100, r.value ? 1.5 : 0)} height="10" rx="5" fill={color} />
				</svg>
				<span class="col-start-2 row-start-1 text-right font-medium tabular-nums @md:col-start-3">{format(r.value)}</span>
			</li>
		{:else}
			<li class="col-span-full py-6 text-center text-sm text-muted">{empty}</li>
		{/each}
	</ul>
</div>
