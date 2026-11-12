<script lang="ts">
	/**
	 * Hand-rolled responsive column chart (grouped series). Bars live in a stretched SVG
	 * (`preserveAspectRatio="none"`), labels are HTML so text never scales.
	 */
	import { cn } from '#lib/ui/index.ts';

	type Series = { name: string; color: string };
	type Point = { label: string; title?: string; values: number[] };
	type Props = {
		points: Point[];
		series: Series[];
		format?: (n: number) => string;
		height?: number;
		class?: string;
		/** Accessible summary. */
		label: string;
	};
	let { points, series, format = (n) => String(n), height = 180, class: className, label }: Props = $props();

	const max = $derived(Math.max(1, ...points.flatMap((p) => p.values)));
	const nice = $derived.by(() => {
		const exp = Math.pow(10, Math.floor(Math.log10(max)));
		const f = max / exp;
		return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
	});
	const W = 1000;
	const groupW = $derived(W / Math.max(1, points.length));
	const gap = $derived(Math.min(groupW * 0.25, 24));
	const barW = $derived((groupW - gap) / series.length);
	let plotW = $state(600);
	/** Leave ~56px per axis label so they never collide. */
	const labelEvery = $derived(Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 56)))));
	let hover = $state<number | null>(null);
</script>

<figure class={cn('relative', className)} aria-label={label}>
	{#if series.length > 1}
		<figcaption class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
			{#each series as s (s.name)}
				<span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-sm" style="background:{s.color}"></span>{s.name}</span>
			{/each}
		</figcaption>
	{/if}
	<div class="flex gap-2">
		<div class="flex w-9 shrink-0 flex-col sm:w-12 justify-between text-right text-[11px] text-subtle tabular-nums" style="height:{height}px">
			<span>{format(nice)}</span><span>{format(nice / 2)}</span><span>0</span>
		</div>
		<div class="relative min-w-0 flex-1" bind:clientWidth={plotW}>
			<svg viewBox="0 0 {W} 100" preserveAspectRatio="none" class="block w-full overflow-visible" style="height:{height}px" role="img" aria-label={label}>
				{#each [0, 50, 100] as y (y)}
					<line x1="0" x2={W} y1={y} y2={y} stroke="currentColor" class="text-border" vector-effect="non-scaling-stroke" stroke-dasharray={y === 100 ? '' : '3 3'} />
				{/each}
				{#each points as p, i (i)}
					<g onmouseenter={() => (hover = i)} onmouseleave={() => (hover = null)} role="presentation">
						<rect x={i * groupW} y="0" width={groupW} height="100" fill="transparent" />
						{#each p.values as v, j (j)}
							{@const h = (v / nice) * 100}
							<rect
								x={i * groupW + gap / 2 + j * barW}
								y={100 - h}
								width={Math.max(barW - (series.length > 1 ? 1 : 0), 0.5)}
								height={h}
								fill={series[j]?.color}
								opacity={hover === null || hover === i ? 1 : 0.45}
								rx="1.5"
							><title>{p.title ?? p.label} · {series[j]?.name}: {format(v)}</title></rect>
						{/each}
					</g>
				{/each}
			</svg>
			{#if hover !== null && points[hover]}
				{@const p = points[hover]}
				<div
					class="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
					style="left:{((hover + 0.5) / points.length) * 100}%"
				>
					<p class="font-medium">{p.title ?? p.label}</p>
					{#each p.values as v, j (j)}<p class="text-muted tabular-nums">{series[j]?.name}: <span class="text-fg">{format(v)}</span></p>{/each}
				</div>
			{/if}
			<div class="relative mt-1.5 h-4 text-[11px] text-subtle">
				{#each points as p, i (i)}
					{#if i % labelEvery === 0}
						<span class="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style="left:{((i + 0.5) / points.length) * 100}%">{p.label}</span>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</figure>
