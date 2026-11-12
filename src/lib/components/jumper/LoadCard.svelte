<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { JUMP_TYPE_LABELS, LOAD_STATUS_LABELS, EDITABLE_LOAD_STATUSES, formatMoney, type JumpType, type LoadStatus } from '#lib/domain/constants.ts';
	import { Badge, Button, cn, toast } from '#lib/ui/index.ts';
	import type { LoadCard, PriceTable } from '#lib/server/jumper/manifest.ts';
	import JIcon from './JIcon.svelte';
	import JoinForm from './JoinForm.svelte';
	import { countdown, fmtTime } from './format.ts';

	type Team = { id: string; name: string; members: { id: string; name: string }[]; coach: boolean; video: boolean };
	type Props = {
		load: LoadCard;
		prices: PriceTable;
		currency: string;
		soloTypes: readonly string[];
		teamTypes: readonly string[];
		changeTypes: readonly string[];
		extras: readonly string[];
		teams: Team[];
		wallet: { availableMinor: number; currency: string } | null;
		defaultExtras: string[];
		error?: { action?: string; message?: string } | null;
		blocked?: boolean;
	};
	let { load, prices, currency, soloTypes, teamTypes, changeTypes, extras, teams, wallet, defaultExtras, error, blocked = false }: Props = $props();

	let now = $state(Date.now());
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	// svelte-ignore state_referenced_locally
	let panel = $state<'none' | 'solo' | 'team' | 'change'>(
		page.url.searchParams.get('join') === load.id ? 'solo' : page.url.searchParams.get('team') === load.id ? 'team' : 'none'
	);
	function open(e: MouseEvent, p: 'solo' | 'team') {
		e.preventDefault();
		panel = p;
	}
	$effect(() => {
		// reopen the right panel when the server returned an error for this load
		if (error?.action === 'join') panel = 'solo';
		else if (error?.action === 'team') panel = 'team';
		else if (error?.action === 'change') panel = 'change';
	});
	let leaving = $state(false);

	const editable = $derived(EDITABLE_LOAD_STATUSES.includes(load.status as LoadStatus));
	const call = $derived(load.status === 'called' && load.callDueAt ? countdown(load.callDueAt, now) : null);
	const tone = $derived(
		load.status === 'called' ? 'warning' : load.status === 'boarding' ? 'danger' : load.full ? 'neutral' : 'success'
	);
</script>

<article
	class={cn(
		'overflow-hidden rounded-2xl border bg-surface transition-colors',
		load.mine ? 'border-primary/40 shadow-[0_0_0_1px_rgb(30_107_255/0.15)]' : 'border-border'
	)}
	data-testid="load-card"
	data-load={load.loadNumber}
>
	<header class="flex items-start justify-between gap-3 p-4 sm:p-5">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<h3 class="text-lg font-semibold tracking-tight">Load {load.loadNumber}</h3>
				<Badge {tone} dot>{LOAD_STATUS_LABELS[load.status as LoadStatus]}</Badge>
				{#if load.refuel}<Badge tone="warning">Plane refuel</Badge>{/if}
				{#if load.shutdownMinutes}<Badge tone="warning">Shutdown {load.shutdownMinutes} min</Badge>{/if}
			</div>
			<p class="mt-0.5 text-sm text-muted">
				{load.aircraftName ?? 'Aircraft TBC'}{load.scheduledAt ? ` · ${fmtTime(load.scheduledAt)}` : ''}
			</p>
		</div>
		<div class="shrink-0 text-right">
			{#if call}
				<p class="font-mono text-2xl font-semibold text-warning tabular-nums">{call}</p>
				<p class="text-xs text-muted">to call</p>
			{:else}
				<p class={cn('text-2xl font-semibold tabular-nums', load.full ? 'text-subtle' : 'text-fg')}>{load.free}</p>
				<p class="text-xs text-muted">slot{load.free === 1 ? '' : 's'} left</p>
			{/if}
		</div>
	</header>

	<div class="px-4 pb-4 sm:px-5">
		<div class="h-1.5 overflow-hidden rounded-full bg-surface-2">
			<div class={cn('h-full rounded-full', load.full ? 'bg-subtle' : 'bg-primary')} style="width: {Math.min(100, (load.used / Math.max(1, load.capacity)) * 100)}%"></div>
		</div>
		{#if load.people.length}
			<div class="mt-3 flex items-center gap-3">
				<div class="flex -space-x-2">
					{#each load.people.slice(0, 8) as p (p.id)}
						<span
							class={cn(
								'relative grid size-8 place-items-center rounded-full border-2 border-surface text-[10px] font-semibold text-white',
								p.me ? 'bg-primary' : 'bg-slate-600 dark:bg-slate-700'
							)}
							title={p.name}
						>
							{p.initials}
							{#if p.lm}<span class="absolute -right-1 -bottom-1 rounded bg-warning px-0.5 text-[8px] leading-tight text-bg">LM</span>{/if}
						</span>
					{/each}
					{#if load.people.length > 8}
						<span class="grid size-8 place-items-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-muted">+{load.people.length - 8}</span>
					{/if}
				</div>
				<p class="min-w-0 truncate text-xs text-muted">{load.groups.map((g) => (g.count > 1 ? `${g.label} ×${g.count}` : g.label)).join(' · ')}</p>
			</div>
		{/if}
	</div>

	{#if load.mine}
		<div class="border-t border-primary/20 bg-primary/5 p-4 sm:p-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="text-sm font-medium text-primary">You’re on this load</p>
					<p class="text-sm text-fg">
						{JUMP_TYPE_LABELS[load.mine.jumpType as JumpType] ?? load.mine.jumpType}{load.mine.teamName ? ` · ${load.mine.teamName}` : ''}
						· <span class="tabular-nums">{formatMoney(load.mine.totalMinor, load.mine.currency)}</span>
						{#if load.mine.paid}<Badge tone="success" class="ml-1">Paid</Badge>{/if}
					</p>
					{#if load.mine.lines.length > 1}
						<p class="mt-0.5 text-xs text-muted">{load.mine.lines.map((l) => `${l.label} ${formatMoney(l.amountMinor, load.mine!.currency)}`).join(' + ')}</p>
					{/if}
				</div>
				{#if editable && !load.mine.staffRole}
					<div class="flex gap-2">
						<Button size="sm" variant="secondary" onclick={() => (panel = panel === 'change' ? 'none' : 'change')}>
							<JIcon name="edit" class="size-4" /> Change
						</Button>
						<form
							method="POST"
							action="?/leave"
							use:enhance={({ cancel }) => {
								if (!confirm('Are you sure you want to leave this load?')) return cancel();
								leaving = true;
								return async ({ result, update }) => {
									await update();
									leaving = false;
									if (result.type === 'success') toast.success('You left the load');
								};
							}}
						>
							<input type="hidden" name="loadId" value={load.id} />
							<Button type="submit" size="sm" variant="ghost" class="text-danger hover:text-danger" loading={leaving}>Leave</Button>
						</form>
					</div>
				{/if}
			</div>
			{#if panel === 'change'}
				<div class="mt-4 border-t border-border pt-4">
					<JoinForm
						mode="change"
						loadId={load.id}
						slotId={load.mine.slotId}
						types={changeTypes}
						{extras}
						{prices}
						{currency}
						initialType={load.mine.jumpType}
						initialExtras={load.mine.extras}
						{wallet}
						currentTotal={load.mine.totalMinor}
						error={error?.action === 'change' ? error.message : null}
						ondone={() => (panel = 'none')}
					/>
				</div>
			{/if}
		</div>
	{:else}
		<div class="border-t border-border p-4 sm:p-5">
			{#if !editable || !load.isOpen}
				<Button disabled class="w-full" variant="secondary">Closed</Button>
			{:else if load.full}
				<Button disabled class="w-full" variant="secondary">Load is full</Button>
			{:else if blocked}
				<Button disabled class="w-full" variant="secondary">Sign the indemnity above first</Button>
			{:else if panel === 'none'}
				<!-- links keep it working without JS (?join= opens the panel server-side) -->
				<div class="grid grid-cols-2 gap-2">
					<Button size="lg" class="w-full" href="?join={load.id}" onclick={(e) => open(e, 'solo')} data-testid="join-solo">Join this load</Button>
					<Button size="lg" variant="secondary" class="w-full" href="?team={load.id}" onclick={(e) => open(e, 'team')}>Team jump</Button>
				</div>
			{:else}
				<div class="mb-4 flex items-center justify-between">
					<div class="inline-flex gap-1 rounded-xl border border-border bg-surface-2/60 p-1" role="tablist">
						<button type="button" role="tab" aria-selected={panel === 'solo'} class={cn('h-8 rounded-lg px-3 text-sm font-medium', panel === 'solo' ? 'bg-surface text-fg shadow-sm' : 'text-muted')} onclick={() => (panel = 'solo')}>Solo jump</button>
						<button type="button" role="tab" aria-selected={panel === 'team'} class={cn('h-8 rounded-lg px-3 text-sm font-medium', panel === 'team' ? 'bg-surface text-fg shadow-sm' : 'text-muted')} onclick={() => (panel = 'team')}>Team jump</button>
					</div>
					<button type="button" class="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close" onclick={() => (panel = 'none')}>
						<JIcon name="x" class="size-4" />
					</button>
				</div>
				{#if panel === 'solo'}
					<JoinForm mode="solo" loadId={load.id} types={soloTypes} {extras} {prices} {currency} initialExtras={defaultExtras} {wallet} error={error?.action === 'join' ? error.message : null} ondone={() => (panel = 'none')} />
				{:else}
					<JoinForm mode="team" loadId={load.id} types={teamTypes} {extras} {prices} {currency} {teams} {wallet} error={error?.action === 'team' ? error.message : null} ondone={() => (panel = 'none')} />
				{/if}
			{/if}
			{#if panel === 'none' && error?.message && (error.action === 'join' || error.action === 'leave')}
				<p class="mt-3 text-sm text-danger" role="alert">{error.message}</p>
			{/if}
		</div>
	{/if}
</article>
