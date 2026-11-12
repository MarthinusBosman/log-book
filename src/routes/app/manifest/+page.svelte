<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { Badge, Button, EmptyState, Icon, toast } from '#lib/ui/index.ts';
	import LoadCard from '#lib/components/manifest/LoadCard.svelte';
	import CreateLoadDialog from '#lib/components/manifest/CreateLoadDialog.svelte';
	import CompleteSummaryDialog from '#lib/components/manifest/CompleteSummaryDialog.svelte';
	import MIcon from '#lib/components/manifest/MIcon.svelte';
	import { clock, poll } from '#lib/components/manifest/live.svelte.ts';
	import { ACTIVE_STATUSES, prettyDay, shiftDay } from '#lib/components/manifest/manifest.ts';
	import type { CompleteSummary, LoadVM, SlotVM } from '#lib/components/manifest/types.ts';
	import type { PageProps } from './$types';

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	let { data, form }: PageProps = $props();

	let createOpen = $state(false);
	let summary = $state<CompleteSummary | null>(null);
	let drag = $state<{ slot: SlotVM; from: string } | null>(null);

	$effect(() => clock.sync(data.serverNow));
	$effect(() => poll('manifest:board', 10_000, () => createOpen || !!drag || !!summary));
	$effect(() => {
		// no-JS fallback result of a completion → show the summary
		if (form && 'summary' in form && form.summary) summary = form.summary as CompleteSummary;
	});

	const active = $derived(data.loads.filter((l) => ACTIVE_STATUSES.includes(l.status) || l.status === 'departed' || l.status === 'landed'));
	const finished = $derived(data.loads.filter((l) => l.status === 'completed' || l.status === 'cancelled'));
	const totals = $derived({
		slots: data.loads.filter((l) => l.status !== 'cancelled').reduce((a, l) => a + l.slots.length, 0),
		flown: data.loads.filter((l) => l.status === 'completed').length,
		free: active.filter((l) => ACTIVE_STATUSES.includes(l.status)).reduce((a, l) => a + l.stats.free, 0)
	});

	function onDragStart(e: DragEvent, slot: SlotVM, load: LoadVM) {
		drag = { slot, from: load.id };
		e.dataTransfer?.setData('text/plain', slot.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	async function onDrop(_e: DragEvent, load: LoadVM) {
		const d = drag;
		drag = null;
		if (!d || d.from === load.id) return;
		const body = new FormData();
		body.set('slotId', d.slot.id);
		body.set('toLoadId', load.id);
		if (d.slot.groupId) body.set('withGroup', '1');
		const res = await fetch('?/moveSlot', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true', accept: 'application/json' } });
		const result = deserialize(await res.text());
		if (result.type === 'success') {
			toast.success(`Moved ${d.slot.displayName}${d.slot.groupId ? ' (with group)' : ''} to load ${load.loadNumber}`);
		} else if (result.type === 'failure') {
			toast.error(String(result.data?.message ?? 'Could not move slot'));
		} else toast.error('Could not move slot');
		await invalidate('manifest:board');
	}
</script>

<svelte:head><title>Manifest · {prettyDay(data.day, data.today)}</title></svelte:head>

<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
	<div>
		<p class="text-sm text-muted">{data.dz.name}</p>
		<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="manifest-heading">
			Loads <span class="text-subtle">· {prettyDay(data.day, data.today)}</span>
		</h1>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<form method="GET" class="flex items-center rounded-xl border border-border bg-surface p-1">
			<a href="?day={shiftDay(data.day, -1)}" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Previous day">
				<MIcon name="chevronLeft" />
			</a>
			<label class="sr-only" for="day">Date</label>
			<input
				id="day"
				type="date"
				name="day"
				value={data.day}
				class="h-8 rounded-lg bg-transparent px-2 text-sm tabular-nums outline-none [color-scheme:inherit]"
				onchange={(e) => goto(`?day=${(e.currentTarget as HTMLInputElement).value}`)}
			/>
			<noscript><button class="h-8 rounded-lg px-2 text-sm">Go</button></noscript>
			<a href="?day={shiftDay(data.day, 1)}" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Next day">
				<MIcon name="chevronRight" />
			</a>
		</form>
		{#if data.day !== data.today}<Button href="/app/manifest" variant="ghost" size="sm">Today</Button>{/if}
		<Button href="/app/display{data.day !== data.today ? `?day=${data.day}` : ''}" variant="secondary" size="md">
			<Icon name="display" class="size-4" /> <span class="sr-only sm:not-sr-only">Display</span>
		</Button>
		{#if data.canManifest}
			<Button onclick={() => (createOpen = true)} data-testid="new-load"><Icon name="plus" class="size-4" /> New load</Button>
		{/if}
	</div>
</div>

<div class="mt-5 flex flex-wrap items-center gap-2 text-sm">
	<Badge tone="brand">{plural(data.loads.filter((l) => l.status !== 'cancelled').length, 'load')}</Badge>
	<Badge>{plural(totals.slots, 'slot')} manifested</Badge>
	<Badge tone="success">{plural(totals.free, 'seat')} free</Badge>
	<Badge>{totals.flown} flown</Badge>
	<span class="ml-auto hidden items-center gap-1.5 text-xs text-subtle sm:inline-flex">
		<span class="size-1.5 animate-pulse rounded-full bg-success"></span> Live · updates every 10 s
		{#if data.canManifest}· drag jumpers between loads{/if}
	</span>
</div>

{#if form && 'message' in form && form.message}
	<p role="alert" class="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{form.message}</p>
{/if}

{#if data.loads.length === 0}
	<EmptyState class="mt-8" title="There are no loads on this day" description="Create the first load to start manifesting. Jumpers on their phones see open loads straight away.">
		{#snippet icon()}<Icon name="plane" class="size-6" />{/snippet}
		{#snippet action()}
			{#if data.canManifest}<Button onclick={() => (createOpen = true)}><Icon name="plus" class="size-4" /> Create load</Button>{/if}
		{/snippet}
	</EmptyState>
{:else}
	{#if active.length}
		<section class="mt-5 grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Upcoming loads">
			{#each active as load (load.id)}
				<LoadCard
					{load}
					timezone={data.dz.timezone}
					currency={data.dz.currency}
					canManifest={data.canManifest}
					dropTarget={!!drag && drag.from !== load.id}
					onslotdragstart={data.canManifest ? onDragStart : undefined}
					onslotdragend={() => setTimeout(() => (drag = null), 50)}
					ondropslot={onDrop}
					oncomplete={(s) => (summary = s)}
				/>
			{/each}
		</section>
	{:else}
		<p class="mt-6 rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">All loads for this day are finished.</p>
	{/if}

	{#if finished.length}
		<details class="group mt-8" open={active.length === 0}>
			<summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
				<MIcon name="chevronRight" class="size-4 transition-transform group-open:rotate-90" />
				Completed & cancelled <span class="rounded-md bg-surface-2 px-1.5 text-xs tabular-nums">{finished.length}</span>
			</summary>
			<div class="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
				{#each finished as load (load.id)}
					<LoadCard {load} timezone={data.dz.timezone} currency={data.dz.currency} canManifest={data.canManifest} />
				{/each}
			</div>
		</details>
	{/if}
{/if}

{#if data.canManifest}
	<CreateLoadDialog
		bind:open={createOpen}
		day={data.day}
		aircraft={data.aircraft}
		pilots={data.pilots}
		defaultCapacity={data.dz.defaultCapacity}
	/>
{/if}
<CompleteSummaryDialog bind:summary />
