<script lang="ts">
	import { Avatar, Button, Icon, Stat } from '#lib/ui/index.ts';
	import { cn } from '#lib/ui/cn.ts';
	import type { StaffTodayVM } from './types.ts';
	import { clock, poll } from './live.svelte.ts';
	import { clockTime } from './manifest.ts';
	import StatusPill from './StatusPill.svelte';
	import Meter from './Meter.svelte';
	import SlotTags from './SlotTags.svelte';
	import MIcon from './MIcon.svelte';

	type Props = {
		today: StaffTodayVM;
		timezone: string;
		serverNow: number;
		/** invalidate() key the dashboard load depends on. */
		depends?: string;
		class?: string;
	};
	let { today, timezone, serverNow, depends = 'manifest:today', class: className }: Props = $props();

	$effect(() => clock.sync(serverNow));
	$effect(() => poll(depends, 15_000));

	const next = $derived(today.nextLoad);
	const MAX_NAMES = 10;
</script>

<section class={cn('flex flex-col gap-4', className)} data-testid="staff-today" aria-label="Today at the dropzone">
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
		<Stat label="Loads flown" value={today.loadsFlown} hint={today.loadsPlanned ? `of ${today.loadsPlanned} manifested` : 'No loads yet'}>
			{#snippet icon()}<Icon name="plane" class="size-4" />{/snippet}
		</Stat>
		<Stat label="Jumpers checked in" value={today.checkedIn} hint="On site now">
			{#snippet icon()}<Icon name="users" class="size-4" />{/snippet}
		</Stat>
		<Stat label="Slots sold" value={today.slotsSold} hint="Excludes working staff">
			{#snippet icon()}<Icon name="manifest" class="size-4" />{/snippet}
		</Stat>
		<Stat label="Tandems" value={today.tandems} hint={today.tandems ? `${today.tandemsDone} jumped` : 'None booked today'}>
			{#snippet icon()}<Icon name="tandem" class="size-4" />{/snippet}
		</Stat>
	</div>

	<div class="rounded-2xl border border-border bg-surface" data-testid="next-load">
		<header class="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
			<h2 class="font-semibold tracking-tight">Next load</h2>
			<div class="flex items-center gap-2">
				<Button href="/app/display" size="sm" variant="ghost"><Icon name="display" class="size-4" /> <span class="hidden sm:inline">Display</span></Button>
				<Button href="/app/manifest" size="sm" variant="secondary">Open manifest</Button>
			</div>
		</header>
		{#if next}
			<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
				<a href="/app/manifest/{next.id}" class="flex items-center gap-3 sm:w-64 sm:shrink-0 sm:flex-col sm:items-start">
					<span class={cn('grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-bold tabular-nums', next.status === 'called' ? 'bg-warning/15 text-warning' : next.status === 'boarding' ? 'bg-danger/15 text-danger' : 'bg-primary/10 text-primary')}>
						{next.loadNumber}
					</span>
					<span class="min-w-0">
						<span class="flex flex-wrap items-center gap-2">
							<span class="font-semibold">Load {next.loadNumber}</span>
							<StatusPill status={next.status} callDueAt={next.callDueAt} />
						</span>
						<span class="mt-0.5 block truncate text-xs text-muted">
							{#if next.scheduledAt}{clockTime(next.scheduledAt, timezone)}{' · '}{/if}{next.aircraftName ?? 'No aircraft'}{next.pilotName ? ` · ${next.pilotName}` : ''}
						</span>
					</span>
				</a>
				<div class="min-w-0 flex-1">
					<div class="grid grid-cols-2 gap-4">
						<Meter label="Seats" value={next.stats.used} max={next.capacity} />
						<Meter label="Weight" value={next.stats.weightKg} max={next.weightLimitKg} unit=" kg" />
					</div>
					{#if next.slots.length}
						<ul class="mt-3 flex flex-wrap gap-1.5">
							{#each next.slots.slice(0, MAX_NAMES) as s (s.id)}
								<li class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2 py-1 text-xs">
									{#if s.avatar}<Avatar name={s.displayName} src={s.avatar} size="xs" class="size-5" />{/if}
									<span class="font-medium">{s.displayName}</span>
									<SlotTags staffRole={s.staffRole} isLoadMaster={s.isLoadMaster} tandemPassenger={!!s.tandemPassengerId} colour={s.tiColour} />
								</li>
							{/each}
							{#if next.slots.length > MAX_NAMES}<li class="px-2 py-1 text-xs text-muted">+{next.slots.length - MAX_NAMES} more</li>{/if}
						</ul>
					{:else}
						<p class="mt-3 text-sm text-muted">Nobody manifested yet.</p>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-3 px-5 py-10 text-center">
				<span class="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted"><MIcon name="plane" class="size-6" /></span>
				<p class="text-sm text-muted">{today.loadsPlanned ? 'All of today’s loads have flown.' : 'No loads manifested today.'}</p>
				<Button href="/app/manifest" size="sm"><Icon name="plus" class="size-4" /> Create a load</Button>
			</div>
		{/if}
	</div>
</section>
