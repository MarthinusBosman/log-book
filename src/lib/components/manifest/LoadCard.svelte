<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/ui/index.ts';
	import { cn } from '#lib/ui/cn.ts';
	import { EDITABLE_LOAD_STATUSES } from '#lib/domain/constants.ts';
	import type { CompleteSummary, LoadVM, SlotVM } from './types.ts';
	import { clockTime, nextStep } from './manifest.ts';
	import { act } from './forms.ts';
	import StatusPill from './StatusPill.svelte';
	import Meter from './Meter.svelte';
	import SlotRow from './SlotRow.svelte';
	import Menu from './Menu.svelte';
	import MIcon from './MIcon.svelte';

	type Props = {
		load: LoadVM;
		timezone: string;
		currency: string;
		canManifest: boolean;
		/** Hide the "Manage" link (on the detail page). */
		detail?: boolean;
		/** Don't render the slot list (detail page renders its own table). */
		hideSlots?: boolean;
		/** A slot is being dragged from another load. */
		dropTarget?: boolean;
		onslotdragstart?: (e: DragEvent, slot: SlotVM, load: LoadVM) => void;
		onslotdragend?: () => void;
		ondropslot?: (e: DragEvent, load: LoadVM) => void;
		oncomplete?: (s: CompleteSummary) => void;
		class?: string;
	};
	let {
		load,
		timezone,
		currency,
		canManifest,
		detail = false,
		hideSlots = false,
		dropTarget = false,
		onslotdragstart,
		onslotdragend,
		ondropslot,
		oncomplete,
		class: className
	}: Props = $props();

	const editable = $derived(EDITABLE_LOAD_STATUSES.includes(load.status));
	const step = $derived(nextStep(load.status));
	const done = $derived(load.status === 'completed' || load.status === 'cancelled');
	let over = $state(false);
	let busy = $state(false);

	// `use:enhance` reads its options once at mount: messages that depend on the load's state must be
	// functions (evaluated when the result arrives, before the page refreshes).
	const STEP_MSG: Record<string, string> = {
		call: '20 min call started',
		board: 'Gear up & go called',
		depart: 'Load departed',
		land: 'Load landed',
		complete: 'Load completed'
	};

	const onDone = (d: Record<string, unknown>) => {
		if (d.summary) oncomplete?.(d.summary as CompleteSummary);
	};
	const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-50';
</script>

<article
	class={cn(
		'flex flex-col rounded-2xl border bg-surface transition-[border-color,box-shadow,opacity] duration-150',
		load.status === 'called' ? 'border-warning/40 shadow-[0_0_0_1px_rgb(251_191_36/0.12)]' : load.status === 'boarding' ? 'border-danger/40' : 'border-border',
		done && 'opacity-75',
		dropTarget && editable && 'border-dashed border-primary/60',
		over && 'border-primary bg-primary/5 ring-4 ring-primary/15',
		className
	)}
	data-testid="load-card"
	data-load-number={load.loadNumber}
	data-status={load.status}
	ondragover={(e) => {
		if (dropTarget && editable) {
			e.preventDefault();
			over = true;
		}
	}}
	ondragleave={() => (over = false)}
	ondrop={(e) => {
		over = false;
		if (dropTarget && editable) {
			e.preventDefault();
			ondropslot?.(e, load);
		}
	}}
	aria-label="Load {load.loadNumber}"
>
	<header class="flex items-start gap-3 px-4 pt-4">
		<div
			class={cn(
				'grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold tabular-nums',
				load.status === 'called' ? 'bg-warning/15 text-warning' : load.status === 'boarding' ? 'bg-danger/15 text-danger' : done ? 'bg-surface-2 text-subtle' : 'bg-primary/10 text-primary'
			)}
		>
			{load.loadNumber}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if detail}
					<h1 class="font-semibold tracking-tight">Load {load.loadNumber}</h1>
				{:else}
					<a href="/app/manifest/{load.id}" class="font-semibold tracking-tight hover:text-primary">Load {load.loadNumber}</a>
				{/if}
				<StatusPill status={load.status} callDueAt={load.callDueAt} />
				{#if load.isOpen && load.status !== 'open' && editable}<span class="text-[11px] font-medium text-success">Open to jumpers</span>{/if}
			</div>
			<p class="mt-0.5 truncate text-xs text-muted">
				{#if load.scheduledAt}<span class="font-medium text-fg tabular-nums">{clockTime(load.scheduledAt, timezone)}</span>{' · '}{/if}{load.aircraftName ?? 'No aircraft'}{' · '}{load.pilotName ? `Pilot ${load.pilotName}` : 'No pilot'}
			</p>
		</div>
		{#if canManifest && !done}
			<Menu label="Load {load.loadNumber} actions">
				<form method="POST" action="?/setOpen" use:enhance={act({ success: () => (load.isOpen ? 'Load closed' : 'Load opened to jumpers') })}>
					<input type="hidden" name="loadId" value={load.id} />
					<input type="hidden" name="open" value={load.isOpen ? '0' : '1'} />
					<button class={menuItem} disabled={!editable}>
						<MIcon name={load.isOpen ? 'lock' : 'unlock'} class="size-4 text-muted" />
						{load.isOpen ? 'Close for self-manifest' : 'Open for self-manifest'}
					</button>
				</form>
				{#if load.status === 'called'}
					<form method="POST" action="?/cancelCall" use:enhance={act({ success: '20 min call cancelled' })}>
						<input type="hidden" name="loadId" value={load.id} />
						<button class={menuItem}><MIcon name="x" class="size-4 text-muted" /> Cancel 20 min call</button>
					</form>
				{/if}
				{#if load.status === 'called'}
					<form method="POST" action="?/call" use:enhance={act({ success: '20 min call has reset' })}>
						<input type="hidden" name="loadId" value={load.id} />
						<input type="hidden" name="reset" value="1" />
						<button class={menuItem}><MIcon name="refresh" class="size-4 text-muted" /> Reset 20 min call</button>
					</form>
				{/if}
				<form method="POST" action="?/refuel" use:enhance={act({ success: () => (load.refuel ? 'Refuel cancelled' : 'Marked as a refuel load') })}>
					<input type="hidden" name="loadId" value={load.id} />
					<input type="hidden" name="refuel" value={load.refuel ? '0' : '1'} />
					<button class={menuItem}><MIcon name="fuel" class="size-4 text-muted" /> {load.refuel ? 'Cancel refuel' : 'Refuel load'}</button>
				</form>
				{#if load.shutdownMinutes}
					<form method="POST" action="?/shutdown" use:enhance={act({ success: 'Shutdown cancelled' })}>
						<input type="hidden" name="loadId" value={load.id} />
						<button class={menuItem}><MIcon name="power" class="size-4 text-muted" /> Cancel shutdown</button>
					</form>
				{:else}
					<form method="POST" action="?/shutdown" class="flex items-center gap-1.5 px-2.5 py-1.5" use:enhance={act({ success: 'Shutdown set' })}>
						<input type="hidden" name="loadId" value={load.id} />
						<MIcon name="power" class="size-4 shrink-0 text-muted" />
						<label class="sr-only" for="sd-{load.id}">Shutdown minutes</label>
						<input
							id="sd-{load.id}"
							name="minutes"
							type="number"
							min="1"
							max="600"
							value="15"
							class="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-sm tabular-nums"
						/>
						<button class="h-8 flex-1 rounded-lg bg-surface-2 px-2 text-sm font-medium hover:bg-border">Shutdown (min)</button>
					</form>
				{/if}
				<div class="my-1 h-px bg-border"></div>
				{#if load.status !== 'landed'}
					<form method="POST" action="?/complete" use:enhance={act({ confirm: () => `Mark load ${load.loadNumber} as completed? Wallets are charged and logbooks written.`, success: 'Load completed', onSuccess: onDone })}>
						<input type="hidden" name="loadId" value={load.id} />
						<button class={menuItem}><MIcon name="check" class="size-4 text-success" /> Mark completed</button>
					</form>
				{/if}
				{#if editable}
					<form method="POST" action="?/cancel" use:enhance={act({ confirm: () => `Cancel load ${load.loadNumber}? Wallet holds are released.`, success: 'Load cancelled' })}>
						<input type="hidden" name="loadId" value={load.id} />
						<button class={cn(menuItem, 'text-warning')}><MIcon name="x" class="size-4" /> Cancel load</button>
					</form>
				{/if}
				{#if load.slots.length === 0}
					<form method="POST" action="?/deleteLoad" use:enhance={act({ confirm: () => `Delete load ${load.loadNumber}?`, success: 'Load has been deleted' })}>
						<input type="hidden" name="loadId" value={load.id} />
						<button class={cn(menuItem, 'text-danger')}><MIcon name="trash" class="size-4" /> Delete load</button>
					</form>
				{/if}
			</Menu>
		{/if}
	</header>

	<div class="grid grid-cols-2 gap-4 px-4 pt-3">
		<Meter label="Seats" value={load.stats.used} max={load.capacity} />
		<Meter label="Weight" value={load.stats.weightKg} max={load.weightLimitKg} unit=" kg" />
	</div>

	{#if load.refuel || load.shutdownMinutes || load.requirements || load.stats.overweight}
		<div class="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-xs">
			{#if load.stats.overweight}<span class="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 font-medium text-danger"><MIcon name="alert" class="size-3.5" />Overweight</span>{/if}
			{#if load.refuel}<span class="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 font-medium text-warning"><MIcon name="fuel" class="size-3.5" />Refuel</span>{/if}
			{#if load.shutdownMinutes}<span class="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 font-medium text-warning"><MIcon name="power" class="size-3.5" />Shutdown {load.shutdownMinutes} min</span>{/if}
			{#if load.requirements}<span class="truncate rounded-md bg-surface-2 px-2 py-0.5 text-muted" title={load.requirements}>{load.requirements}</span>{/if}
		</div>
	{/if}

	<div class={cn('flex-1 px-2 pt-2 pb-1', hideSlots && 'hidden')}>
		{#if load.slots.length}
			<ul class="space-y-px">
				{#each load.slots as slot (slot.id)}
					<SlotRow
						{slot}
						{currency}
						draggable={canManifest && editable && !!onslotdragstart}
						ondragstart={(e, s) => onslotdragstart?.(e, s, load)}
						ondragend={onslotdragend}
					/>
				{/each}
			</ul>
		{:else}
			<p class="px-2 py-4 text-center text-sm text-subtle">{dropTarget ? 'Drop a jumper here' : 'This load is empty'}</p>
		{/if}
	</div>

	{#if canManifest && !done}
		<footer class="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
			{#if step}
				<form method="POST" action="?/{step.action}" use:enhance={act({ success: () => (step ? STEP_MSG[step.action] : undefined), onSuccess: onDone, pending: (b) => (busy = b) })}>
					<input type="hidden" name="loadId" value={load.id} />
					<Button
						type="submit"
						size="sm"
						loading={busy}
						class={cn(step.tone === 'warning' && '!bg-warning !text-bg hover:!opacity-90', step.tone === 'success' && '!bg-success !text-bg')}
						data-testid="next-step"
					>
						{#if step.action === 'call'}<MIcon name="clock" class="size-4" />{:else if step.action === 'complete'}<MIcon name="check" class="size-4" />{/if}
						{step.label}
					</Button>
				</form>
			{/if}
			{#if !detail}
				<Button href="/app/manifest/{load.id}" size="sm" variant="secondary" class="ml-auto">
					{editable ? 'Add slots' : 'Details'}
				</Button>
			{/if}
		</footer>
	{:else if !detail}
		<footer class="flex items-center justify-end border-t border-border px-3 py-2">
			<a href="/app/manifest/{load.id}" class="text-xs font-medium text-muted hover:text-fg">View details →</a>
		</footer>
	{/if}
</article>
