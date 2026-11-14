<script lang="ts">
	import { page as pageState } from '$app/state';
	import { Badge, Button, EmptyState, Icon, cn } from '#lib/ui/index.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import StatTile from '#lib/components/jumper/StatTile.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import BarList from '#lib/components/jumper/BarList.svelte';
	import JumpCard from '#lib/components/jumper/JumpCard.svelte';
	import { fmtDate, fmtFreefall, fmtNumber, loggedScope } from '#lib/components/jumper/format.ts';
	import { JUMP_TYPES, JUMP_TYPE_LABELS } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const scope = $derived(loggedScope(data.totals));
	let tab = $state<'type' | 'dz' | 'year'>('type');
	const rows = $derived(tab === 'type' ? data.breakdown.byType : tab === 'dz' ? data.breakdown.byDropzone : data.breakdown.byYear);
	const qs = $derived(pageState.url.searchParams.toString());
	const linkFor = (key: string) => {
		const p = new URLSearchParams();
		if (tab === 'type') p.set('type', key);
		else if (tab === 'dz') p.set('place', key);
		else p.set('year', key);
		return `?${p}`;
	};
	const pageHref = (n: number) => {
		const p = new URLSearchParams(pageState.url.search);
		p.set('page', String(n));
		return `?${p}`;
	};
</script>

<svelte:head><title>Logbook</title></svelte:head>

<PageHeader title="Logbook" icon="book" description="Every jump, signed and verified.">
	{#snippet actions()}
		<Button href="/app/logbook/export.csv{qs ? `?${qs}` : ''}" variant="ghost" size="sm" data-sveltekit-reload data-testid="export-csv"><JIcon name="download" class="size-4" /> CSV</Button>
		<Button href="/app/logbook/print{qs ? `?${qs}` : ''}" variant="ghost" size="sm" data-sveltekit-reload><JIcon name="printer" class="size-4" /> Print</Button>
		<Button href="/app/logbook/new" data-testid="log-jump"><Icon name="plus" class="size-4" /> Log jump #{data.next}</Button>
	{/snippet}
</PageHeader>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
	<StatTile label="Total jumps" value={fmtNumber(data.totals.totalJumps)} hint={data.totals.logged !== data.totals.totalJumps ? `${data.totals.logged} logged here` : undefined} />
	<StatTile label="Freefall" value={fmtFreefall(data.totals.totalFreefallSeconds)} hint={scope?.short ?? 'total time'} />
	<StatTile label="Last 30 days" value={data.totals.last30Days} hint="{data.totals.last12Months} in 12 months" />
	<StatTile label="Signed / verified" value="{data.totals.signed} / {data.totals.verified}" hint={data.totals.lastJumpDate ? `Last jump ${fmtDate(data.totals.lastJumpDate)}` : 'No jumps yet'} />
</div>

{#if data.totals.logged > 0}
	<div class="mt-6 grid gap-6 lg:grid-cols-3">
		<section class="rounded-2xl border border-border bg-surface p-4 sm:p-5 lg:order-2 lg:self-start" data-testid="logbook-breakdown">
			<div class="flex items-center justify-between gap-2">
				<h2 class="font-semibold tracking-tight">Breakdown</h2>
				<div class="inline-flex rounded-lg border border-border bg-surface-2/60 p-0.5 text-xs">
					{#each [['type', 'Type'], ['dz', 'Dropzone'], ['year', 'Year']] as [id, label] (id)}
						<button type="button" aria-pressed={tab === id} class={cn('rounded-md px-2.5 py-1 font-medium', tab === id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')} onclick={() => (tab = id as typeof tab)}>{label}</button>
					{/each}
				</div>
			</div>
			{#if scope}<p class="mt-1 text-xs text-muted" data-testid="breakdown-scope">{scope.long}</p>{/if}
			<BarList class="mt-4" rows={rows.slice(0, 8)} href={linkFor} />
		</section>

		<section class="lg:order-1 lg:col-span-2">
			<form method="GET" class="flex flex-col gap-2 sm:flex-row" data-testid="logbook-filters">
				<label class="relative flex-1">
					<span class="sr-only">Search</span>
					<JIcon name="search" class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
					<input type="search" name="q" value={data.filters.q} placeholder="Search jumps…" class="h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-10 text-sm outline-none hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15" />
				</label>
				<div class="flex gap-2">
					<select name="type" value={data.filters.type} class="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:w-36 sm:flex-none" aria-label="Jump type">
						<option value="">All types</option>
						{#each JUMP_TYPES as t (t)}<option value={t}>{JUMP_TYPE_LABELS[t]}</option>{/each}
					</select>
					<select name="year" value={data.filters.year} class="h-10 w-28 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" aria-label="Year">
						<option value="">All years</option>
						{#each data.breakdown.byYear as y (y.key)}<option value={y.key}>{y.key}</option>{/each}
					</select>
					{#if data.filters.place}<input type="hidden" name="place" value={data.filters.place} />{/if}
					<Button type="submit" variant="secondary" size="md"><JIcon name="filter" class="size-4" /><span class="sr-only sm:not-sr-only">Filter</span></Button>
				</div>
			</form>
			{#if data.filtered}
				<div class="mt-3 flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
					<span class="text-muted"><span class="font-medium text-fg">{data.matched.count}</span> jumps · {fmtFreefall(data.matched.freefallSeconds)} freefall</span>
					<a href="/app/logbook" class="font-medium text-primary hover:underline">Clear filters</a>
				</div>
			{/if}

			<ul class="mt-4 space-y-2.5" data-testid="jump-list">
				{#each data.jumps as j (j.id)}
					<li><JumpCard jump={j} /></li>
				{:else}
					<li class="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">No jumps match these filters.</li>
				{/each}
			</ul>
			{#if data.pages > 1}
				<nav class="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
					{#if data.page > 1}<Button href={pageHref(data.page - 1)} variant="ghost" size="sm"><JIcon name="chevronLeft" class="size-4" /> Newer</Button>{:else}<span></span>{/if}
					<span class="text-muted">Page {data.page} of {data.pages}</span>
					{#if data.page < data.pages}<Button href={pageHref(data.page + 1)} variant="ghost" size="sm">Older <JIcon name="chevronRight" class="size-4" /></Button>{:else}<span></span>{/if}
				</nav>
			{/if}
		</section>
	</div>
{:else}
	<EmptyState class="mt-6" title="Your logbook is empty" description="You have no jumps logged yet. Start by adding your last jump — jumps on completed loads at your dropzone are added automatically.">
		{#snippet icon()}<Icon name="book" class="size-6" />{/snippet}
		{#snippet action()}<Button href="/app/logbook/new"><Icon name="plus" class="size-4" /> Log jump #{data.next}</Button>{/snippet}
	</EmptyState>
{/if}
