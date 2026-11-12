<script lang="ts">
	/**
	 * Hero art: an altimeter tape for one skydive, exit to canopy.
	 * The marker drifts from exit to pull altitude; static when reduced motion is requested.
	 */
	const ticks = Array.from({ length: 15 }, (_, i) => 14 - i); // 14 … 0 (thousands of ft)
	const top = (kft: number) => `${((14 - kft) / 14) * 100}%`;
	const marks = [
		{ kft: 13.5, label: 'Exit', tone: 'text-primary', dot: 'bg-primary' },
		{ kft: 5.5, label: 'Break-off', tone: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-500 dark:bg-amber-300' },
		{ kft: 3, label: 'Pull', tone: 'text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-500 dark:bg-emerald-300' }
	];
</script>

<div class="relative h-full w-40 select-none" aria-hidden="true">
	<!-- spine -->
	<div class="absolute inset-y-0 left-14 w-px bg-gradient-to-b from-border-strong via-border-strong to-transparent"></div>
	{#each ticks as k (k)}
		<div class="absolute left-0 flex w-full -translate-y-1/2 items-center" style="top:{top(k)}">
			<span class="w-11 text-right font-mono text-[10px] tabular-nums text-subtle {k % 2 ? 'opacity-0' : ''}">
				{k === 0 ? '0' : `${k}k`}
			</span>
			<span class="ml-3 h-px {k % 2 ? 'w-1.5' : 'w-3'} bg-border-strong"></span>
		</div>
	{/each}
	{#each marks as m (m.label)}
		<div class="absolute left-14 flex -translate-y-1/2 items-center gap-2" style="top:{top(m.kft)}">
			<span class="h-px w-5 {m.dot} opacity-60"></span>
			<span class="font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase {m.tone}">{m.label}</span>
		</div>
	{/each}
	<!-- jumper -->
	<!-- The track spans the full tape so translateY(%) maps 1:1 to altitude (transform only: no layout shift). -->
	<div class="jumper pointer-events-none absolute inset-y-0 left-14 w-0">
		<span class="absolute top-0 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20"></span>
	</div>
</div>

<style>
	.jumper {
		transform: translateY(3.57%);
		animation: fall 14s cubic-bezier(0.45, 0, 0.3, 1) 1.2s infinite;
	}
	/* 13.5k → 3k over most of the cycle, then a slow canopy ride down. */
	@keyframes fall {
		0%,
		8% {
			transform: translateY(3.57%);
		}
		70% {
			transform: translateY(78.57%);
		}
		96% {
			transform: translateY(99%);
			opacity: 1;
		}
		100% {
			transform: translateY(99%);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.jumper {
			animation: none;
		}
	}
</style>
