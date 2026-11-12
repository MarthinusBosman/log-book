<script lang="ts">
	/** Month calendar for picking a booking date. `available` maps YYYY-MM-DD → places left. */
	import { cn } from '#lib/ui/cn.ts';

	type Props = { available: Record<string, number>; min: string; max: string; value?: string | null; onselect?: (date: string) => void };
	let { available, min, max, value = $bindable(null), onselect }: Props = $props();

	const ym = (d: string) => d.slice(0, 7);
	const initialMonth = () => ym(value ?? Object.keys(available).sort()[0] ?? min);
	let month = $state(initialMonth());

	function shift(m: string, by: number): string {
		const [y, mo] = m.split('-').map(Number);
		const d = new Date(Date.UTC(y, mo - 1 + by, 1));
		return d.toISOString().slice(0, 7);
	}
	const cells = $derived.by(() => {
		const [y, mo] = month.split('-').map(Number);
		const first = new Date(Date.UTC(y, mo - 1, 1));
		const lead = (first.getUTCDay() + 6) % 7; // Monday first
		const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
		const out: (string | null)[] = Array.from({ length: lead }, () => null);
		for (let d = 1; d <= days; d++) out.push(`${month}-${String(d).padStart(2, '0')}`);
		return out;
	});
	const title = $derived(new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)));
	const canPrev = $derived(month > ym(min));
	const canNext = $derived(month < ym(max));
	const monthHas = $derived(Object.keys(available).some((d) => d.startsWith(month)));
</script>

<div class="select-none" data-testid="calendar">
	<div class="flex items-center justify-between">
		<button
			type="button"
			class="grid size-9 place-items-center rounded-lg text-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
			disabled={!canPrev}
			onclick={() => (month = shift(month, -1))}
			aria-label="Previous month">‹</button
		>
		<p class="font-semibold" aria-live="polite">{title}</p>
		<button
			type="button"
			class="grid size-9 place-items-center rounded-lg text-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
			disabled={!canNext}
			onclick={() => (month = shift(month, 1))}
			aria-label="Next month">›</button
		>
	</div>
	<div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-subtle uppercase">
		{#each ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as d (d)}<span>{d}</span>{/each}
	</div>
	<div class="mt-1 grid grid-cols-7 gap-1">
		{#each cells as d, i (d ?? `x${i}`)}
			{#if d}
				{@const left = available[d] ?? 0}
				{@const sel = d === value}
				<button
					type="button"
					disabled={!left}
					aria-pressed={sel}
					aria-label="{d}{left ? `, ${left} places` : ', unavailable'}"
					data-date={d}
					onclick={() => {
						value = d;
						onselect?.(d);
					}}
					class={cn(
						'relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm tabular-nums transition-all',
						sel
							? 'bg-primary font-semibold text-primary-fg shadow-glow'
							: left
								? 'bg-primary/10 font-medium text-fg hover:bg-primary/20 hover:ring-1 hover:ring-primary/40'
								: 'text-subtle/60'
					)}
				>
					{Number(d.slice(8))}
					{#if left && !sel}<span class="absolute bottom-1.5 size-1 rounded-full bg-primary"></span>{/if}
				</button>
			{:else}
				<span></span>
			{/if}
		{/each}
	</div>
	{#if !monthHas}
		<p class="mt-3 text-center text-sm text-muted">No open times this month{canNext ? ' — try the next one' : ''}.</p>
	{/if}
</div>
