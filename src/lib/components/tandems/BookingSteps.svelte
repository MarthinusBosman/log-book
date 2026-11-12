<script lang="ts">
	/** Booking progress: Date · Details · Extras · Waiver · Done (waiver step only when the DZ uses one). */
	import { cn } from '#lib/ui/cn.ts';

	let { current, waiver = true }: { current: 'date' | 'details' | 'extras' | 'waiver' | 'done'; waiver?: boolean } = $props();
	const steps = $derived(
		(
			[
				['date', 'Date'],
				['details', 'Details'],
				['extras', 'Extras'],
				['waiver', 'Waiver'],
				['done', 'Done']
			] as const
		).filter(([k]) => waiver || k !== 'waiver')
	);
	const idx = $derived(steps.findIndex(([k]) => k === current));
</script>

<ol class="flex items-center gap-1.5" aria-label="Booking steps">
	{#each steps as [key, label], i (key)}
		<li class="flex flex-1 flex-col gap-1.5" aria-current={i === idx ? 'step' : undefined}>
			<span class={cn('h-1 rounded-full transition-colors duration-300', i <= idx ? 'bg-primary' : 'bg-border')}></span>
			<span class={cn('text-[11px] font-medium', i === idx ? 'text-fg' : i < idx ? 'text-muted' : 'text-subtle')}>
				<span class="tabular-nums">{i + 1}</span><span class="hidden min-[380px]:inline">&nbsp;·&nbsp;{label}</span>
			</span>
		</li>
	{/each}
</ol>
