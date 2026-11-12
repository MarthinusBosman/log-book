<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '#lib/ui/index.ts';

	type Props = { from: string; to: string; today: string; class?: string };
	let { from, to, today, class: className }: Props = $props();

	const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
	const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
	const presets = $derived.by(() => {
		const lastMonthEnd = shift(monthStart(today), -1);
		return [
			{ label: 'Today', from: today, to: today },
			{ label: '7 days', from: shift(today, -6), to: today },
			{ label: '30 days', from: shift(today, -29), to: today },
			{ label: 'This month', from: monthStart(today), to: today },
			{ label: 'Last month', from: monthStart(lastMonthEnd), to: lastMonthEnd },
			{ label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: today }
		];
	});
	const href = (f: string, t: string) => {
		const u = new URL(page.url.href);
		u.searchParams.set('from', f);
		u.searchParams.set('to', t);
		return `${u.pathname}${u.search}`;
	};
	const extra = $derived([...page.url.searchParams.entries()].filter(([k]) => k !== 'from' && k !== 'to'));
</script>

<div class={cn('flex flex-col gap-3 lg:flex-row lg:items-center print:hidden', className)}>
	<form method="GET" class="flex flex-wrap items-center gap-2">
		{#each extra as [k, v] (k)}<input type="hidden" name={k} value={v} />{/each}
		<label class="sr-only" for="dr-from">From</label>
		<input id="dr-from" type="date" name="from" value={from} max={today} class="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary" />
		<span class="text-sm text-subtle">to</span>
		<label class="sr-only" for="dr-to">To</label>
		<input id="dr-to" type="date" name="to" value={to} class="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary" />
		<button type="submit" class="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium hover:bg-elevated">Apply</button>
	</form>
	<div class="flex flex-wrap gap-1">
		{#each presets as p (p.label)}
			{@const active = p.from === from && p.to === to}
			<a
				href={href(p.from, p.to)}
				data-sveltekit-reset="false"
				class={cn(
					'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
					active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg'
				)}>{p.label}</a
			>
		{/each}
	</div>
</div>
