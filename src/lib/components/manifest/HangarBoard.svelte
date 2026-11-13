<script lang="ts">
	import type { Snippet } from 'svelte';
	import { JUMP_TYPE_LABELS, type JumpType } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/cn.ts';
	import { brand } from '#lib/brand.ts';
	import type { DisplayLoadVM } from './types.ts';
	import { clock, poll } from './live.svelte.ts';
	import { callPhase, clockTime, formatCountdown, groupHue, prettyDay, type CallPhase } from './manifest.ts';
	import SlotTags from './SlotTags.svelte';
	import MIcon from './MIcon.svelte';

	type Props = {
		dzName: string;
		/** Dropzone logo (branding), shown left of the name. */
		logoUrl?: string | null;
		timezone: string;
		day: string;
		today: string;
		serverNow: number;
		loads: DisplayLoadVM[];
		/** invalidate() key the page's load function depends on. */
		depends: string;
		/** How many loads get a full column; the rest are listed in the footer. */
		columns?: number;
		toolbar?: Snippet;
	};
	let { dzName, logoUrl = null, timezone, day, today, serverNow, loads, depends, columns = 4, toolbar }: Props = $props();

	$effect(() => clock.sync(serverNow));
	$effect(() => clock.use());
	$effect(() => poll(depends, 10_000));

	const shown = $derived(loads.slice(0, columns));
	const later = $derived(loads.slice(columns));
	const now = $derived(clock.now);

	const PHASE: Record<CallPhase, { label: string; tone: string }> = {
		none: { label: '', tone: '' },
		call20: { label: '20 min call', tone: 'bg-warning/15 text-warning border-warning/40' },
		call10: { label: '10 min call', tone: 'bg-warning/25 text-warning border-warning/60' },
		call5: { label: '5 min call', tone: 'bg-orange-500/25 text-orange-600 dark:text-orange-300 border-orange-500/60' },
		gearup: { label: 'Gear up', tone: 'gear-up bg-red-600 text-white border-red-600' },
		boarding: { label: 'Gear up · boarding', tone: 'gear-up bg-red-600 text-white border-red-600' },
		airborne: { label: 'In the air', tone: 'bg-primary/15 text-primary border-primary/40' }
	};

	function stripe(s: DisplayLoadVM['slots'][number]): string {
		return s.colour ?? (s.groupId ? `hsl(${groupHue(s.groupId)} 70% 55%)` : (s.tiColour ?? 'transparent'));
	}
	function sub(s: DisplayLoadVM['slots'][number]): string {
		if (s.teamName) return s.teamName;
		return JUMP_TYPE_LABELS[s.jumpType as JumpType] ?? s.jumpType;
	}
</script>

<div class="flex min-h-dvh flex-col bg-bg text-fg" data-testid="hangar-board">
	<header class="relative z-30 flex items-center gap-[1.5vw] border-b border-border px-[max(1rem,2vw)] py-[1.2vh]">
		{#if logoUrl}<img src={logoUrl} alt="" class="h-[clamp(2.25rem,4.5vw,5.5rem)] max-w-[18vw] shrink-0 object-contain" data-testid="display-logo" />{/if}
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-[clamp(1.25rem,2.2vw,3rem)] leading-tight font-bold tracking-tight">{dzName}</h1>
			<p class="text-[clamp(0.85rem,1vw,1.4rem)] text-muted">
				Loads · {prettyDay(day, today)}{#if day === today}<span class="ml-3 inline-flex items-center gap-1.5 text-success"><span class="size-2 animate-pulse rounded-full bg-success"></span>Live</span>{/if}
			</p>
		</div>
		{#if toolbar}{@render toolbar()}{/if}
		<time class="text-[clamp(1.75rem,3.6vw,5rem)] leading-none font-bold tabular-nums" data-testid="board-clock">{clockTime(now, timezone)}</time>
	</header>

	{#if shown.length === 0}
		<div class="grid flex-1 place-items-center p-10 text-center">
			<div>
				<MIcon name="clock" class="mx-auto size-[6vw] min-h-12 min-w-12 text-subtle" />
				<p class="mt-6 text-[clamp(1.5rem,3vw,4rem)] font-semibold">No loads manifested yet</p>
				<p class="mt-2 text-[clamp(1rem,1.4vw,2rem)] text-muted">Check in at manifest — the next load shows here as soon as it's created.</p>
			</div>
		</div>
	{:else}
		<main
			class="grid flex-1 gap-[max(0.5rem,1vw)] p-[max(0.5rem,1vw)] [grid-template-columns:repeat(var(--cols),minmax(0,1fr))] max-lg:[--cols:1]! max-xl:[--cols:2]!"
			style="--cols:{Math.min(columns, Math.max(shown.length, 1))}"
		>
			{#each shown as load (load.id)}
				{@const phase = callPhase(load.status, load.callDueAt, now)}
				{@const p = PHASE[phase]}
				{@const left = load.callDueAt != null ? load.callDueAt - now : null}
				<section
					class={cn(
						'flex min-h-0 flex-col overflow-hidden rounded-[max(0.9rem,1.2vw)] border-2 bg-surface',
						phase === 'gearup' || phase === 'boarding' ? 'border-danger' : phase === 'none' ? 'border-border' : phase === 'airborne' ? 'border-primary/50' : 'border-warning/60'
					)}
					data-testid="board-load"
					data-load-number={load.loadNumber}
					data-phase={phase}
				>
					<div class="flex items-start gap-[max(0.5rem,0.8vw)] px-[max(0.75rem,1.1vw)] pt-[max(0.6rem,1vw)]">
						<div class="text-[clamp(2.5rem,5vw,7rem)] leading-[0.9] font-black tracking-tighter tabular-nums">{load.loadNumber}</div>
						<div class="min-w-0 flex-1 pt-[0.3vw]">
							<p class="truncate text-[clamp(1rem,1.35vw,2rem)] font-semibold">{load.aircraftName ?? 'Load ' + load.loadNumber}</p>
							<p class="truncate text-[clamp(0.85rem,1vw,1.5rem)] text-muted">
								{#if load.scheduledAt}{clockTime(load.scheduledAt, timezone)}{' · '}{/if}{load.stats.free > 0 ? `${load.stats.free} seat${load.stats.free === 1 ? '' : 's'} free` : 'Full'}
							</p>
						</div>
						{#if load.isOpen && phase === 'none'}
							<span class="rounded-full border border-success/40 bg-success/10 px-[0.7vw] py-[0.2vw] text-[clamp(0.75rem,0.9vw,1.3rem)] font-semibold text-success">Open</span>
						{/if}
					</div>

					{#if phase !== 'none'}
						<div class={cn('mx-[max(0.75rem,1.1vw)] mt-[max(0.5rem,0.8vw)] flex items-center justify-between rounded-[0.8vw] border px-[max(0.75rem,1vw)] py-[max(0.4rem,0.6vw)]', p.tone)} data-testid="board-phase">
							<span class="text-[clamp(1.1rem,1.5vw,2.4rem)] font-extrabold tracking-wide whitespace-nowrap uppercase">{p.label}</span>
							{#if load.status === 'called' && left != null}
								<span class="ml-3 text-[clamp(1.6rem,2.6vw,4rem)] leading-none font-black tabular-nums">{formatCountdown(left)}</span>
							{/if}
						</div>
					{:else if load.refuel || load.shutdownMinutes}
						<div class="mx-[max(0.75rem,1.1vw)] mt-[max(0.5rem,0.8vw)] flex items-center gap-2 rounded-[0.8vw] border border-warning/40 bg-warning/10 px-[1vw] py-[0.5vw] text-[clamp(0.9rem,1.2vw,1.8rem)] font-semibold text-warning">
							<MIcon name={load.refuel ? 'fuel' : 'power'} class="size-[1.4em]" />
							{load.refuel ? 'Refuel' : ''}{load.refuel && load.shutdownMinutes ? ' · ' : ''}{load.shutdownMinutes ? `Shutdown ${load.shutdownMinutes} min` : ''}
						</div>
					{/if}

					<ol class="mt-[0.6vw] min-h-0 flex-1 overflow-hidden px-[max(0.4rem,0.6vw)] pb-[0.8vw]">
						{#each load.slots as s, i (s.id)}
							<li class="relative flex items-center gap-[0.6vw] rounded-[0.5vw] py-[0.32vh] pr-[0.5vw] pl-[max(0.75rem,1vw)] odd:bg-surface-2/50">
								<span class="absolute inset-y-[0.4vh] left-[0.25vw] w-[0.25vw] min-w-1 rounded-full" style="background:{stripe(s)}" aria-hidden="true"></span>
								<span class="w-[1.6em] shrink-0 text-right text-[clamp(0.8rem,0.95vw,1.4rem)] text-subtle tabular-nums">{i + 1}</span>
								<span class="min-w-0 flex-1 truncate text-[clamp(1rem,1.3vw,2rem)] font-semibold">{s.displayName}</span>
								<SlotTags staffRole={s.staffRole} isLoadMaster={s.isLoadMaster} tandemPassenger={!!s.tandemPassengerId} extras={[]} colour={s.tiColour} size="lg" class="shrink-0" />
								<span class="hidden shrink-0 truncate text-[clamp(0.75rem,0.9vw,1.3rem)] text-muted 2xl:inline">{sub(s)}</span>
							</li>
						{:else}
							<li class="px-[max(0.4rem,0.6vw)] py-[2vh] text-center text-[clamp(1rem,1.3vw,2rem)] text-muted">Seats available — see manifest</li>
						{/each}
					</ol>
				</section>
			{/each}
		</main>
	{/if}

	<footer class="flex items-center gap-[1.2vw] border-t border-border px-[max(1rem,2vw)] py-[1vh] text-[clamp(0.85rem,1.05vw,1.6rem)]">
		{#if later.length}
			<span class="font-semibold text-muted">Later:</span>
			<div class="flex min-w-0 flex-1 flex-wrap gap-x-[1.6vw] gap-y-1">
				{#each later as l (l.id)}
					<span class="tabular-nums"><b>Load {l.loadNumber}</b><span class="text-muted">{#if l.scheduledAt}{` · ${clockTime(l.scheduledAt, timezone)}`}{/if}{` · ${l.stats.free} free`}</span></span>
				{/each}
			</div>
		{:else}
			<span class="flex-1 text-muted">Listen for calls · be at the loading area at 5 min</span>
		{/if}
		<span class="text-subtle">{brand.name}</span>
	</footer>
</div>

<style>
	:global(.gear-up) {
		animation: gear-up 1.1s ease-in-out infinite;
	}
	@keyframes gear-up {
		50% {
			filter: brightness(1.25);
			box-shadow: 0 0 2.5vw rgb(248 113 113 / 0.55);
		}
	}
</style>
