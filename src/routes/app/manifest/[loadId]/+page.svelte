<script lang="ts">
	import ConfirmStep from '#lib/components/manifest/ConfirmStep.svelte';
	import { enhance } from '$app/forms';
	import { Avatar, Badge, Button, Input, Select } from '#lib/ui/index.ts';
	import { cn } from '#lib/ui/cn.ts';
	import { JUMP_TYPE_LABELS, formatMoney, paymentMethodLabel } from '#lib/domain/constants.ts';
	import LoadCard from '#lib/components/manifest/LoadCard.svelte';
	import AddSlotPanel from '#lib/components/manifest/AddSlotPanel.svelte';
	import SlotEditor from '#lib/components/manifest/SlotEditor.svelte';
	import SlotTags from '#lib/components/manifest/SlotTags.svelte';
	import CompleteSummaryDialog from '#lib/components/manifest/CompleteSummaryDialog.svelte';
	import MIcon from '#lib/components/manifest/MIcon.svelte';
	import { act } from '#lib/components/manifest/forms.ts';
	import { clock, poll } from '#lib/components/manifest/live.svelte.ts';
	import { clockTime, groupHue, prettyDay, slotMoney } from '#lib/components/manifest/manifest.ts';
	import type { CompleteSummary, SlotVM } from '#lib/components/manifest/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let editing = $state<SlotVM | null>(null);
	let summary = $state<CompleteSummary | null>(null);
	let selected = $state<string[]>([]);
	let settingsOpen = $state(false);

	$effect(() => clock.sync(data.serverNow));
	$effect(() => poll('manifest:board', 10_000, () => !!editing || !!summary || settingsOpen));
	$effect(() => {
		if (form && 'summary' in form && form.summary) summary = form.summary as CompleteSummary;
	});

	const load = $derived(data.load);
	// keep the open editor in sync with fresh data after polling/actions
	$effect(() => {
		const id = editing?.id;
		if (id) {
			const fresh = load.slots.find((s) => s.id === id);
			if (!fresh) editing = null;
		}
	});
	const unpaid = $derived(load.slots.filter((s) => !s.paid && s.totalMinor > 0));
	const money = $derived(slotMoney(load.slots));
	/** Picking a listed pilot fills in their profile weight (still editable). */
	function fillPilotWeight(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		const pilot = data.pilots.find((p) => p.id === select.value);
		const input = select.form?.elements.namedItem('pilotWeightKg');
		if (pilot && input instanceof HTMLInputElement) input.value = pilot.weightKg == null ? '' : String(pilot.weightKg);
	}
	const selectedOwed = $derived(unpaid.filter((s) => selected.includes(s.id)).reduce((a, s) => a + s.totalMinor, 0));
</script>

<svelte:head><title>Load {load.loadNumber} · Manifest</title></svelte:head>

<a href="/app/manifest{load.day !== data.today ? `?day=${load.day}` : ''}" class="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
	<MIcon name="chevronLeft" /> Loads · {prettyDay(load.day, data.today)}
</a>

{#if form && 'confirm' in form && form.confirm}
	<ConfirmStep step={form.confirm} />
{:else if form && 'message' in form && form.message}
	<p role="alert" class="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{form.message}</p>
{/if}

<div class="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
	<div class="flex min-w-0 flex-col gap-6">
		<LoadCard {load} timezone={data.dz.timezone} currency={data.dz.currency} canManifest={data.canManifest} detail hideSlots oncomplete={(s) => (summary = s)} />

		<section class="rounded-2xl border border-border bg-surface" aria-labelledby="slots-title">
			<header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
				<div>
					<h2 id="slots-title" class="font-semibold tracking-tight">Slots <span class="text-subtle tabular-nums">{load.slots.length}/{load.capacity}</span></h2>
					<p class="text-xs text-muted">
						Total {formatMoney(money.totalMinor, data.dz.currency)}{#if money.heldMinor}{' · '}<span class="whitespace-nowrap" data-testid="held-total">{formatMoney(money.heldMinor, data.dz.currency)} in wallets</span>{/if}{#if money.outstandingMinor}{' · '}<span class="whitespace-nowrap text-warning" data-testid="outstanding-total">{formatMoney(money.outstandingMinor, data.dz.currency)} outstanding</span>{/if}
					</p>
				</div>
				{#if data.canPay && unpaid.length}
					<form method="POST" action="?/markPaid" id="bulk-pay" class="flex items-center gap-2" use:enhance={act({ success: (d) => `${d.paid} slot${d.paid === 1 ? '' : 's'} marked paid`, onSuccess: () => (selected = []) })}>
						<Select name="provider" value="cash" aria-label="Payment method" class="w-28 [&_select]:h-9 [&_select]:text-sm" options={[{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'eft', label: 'EFT' }, { value: 'manual', label: 'Other' }]} />
						<Button type="submit" size="sm" variant="secondary" disabled={selected.length === 0}>
							Mark paid{selected.length ? ` · ${formatMoney(selectedOwed, data.dz.currency)}` : ''}
						</Button>
					</form>
				{/if}
			</header>
			{#if load.slots.length}
				<ul class="divide-y divide-border">
					{#each load.slots as s, i (s.id)}
						{@const stripe = s.colour ?? (s.groupId ? `hsl(${groupHue(s.groupId)} 70% 55%)` : (s.tiColour ?? 'transparent'))}
						<li class="relative flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/40" data-testid="detail-slot" data-slot-name={s.displayName}>
							<span class="absolute inset-y-2 left-1 w-1 rounded-full" style="background:{stripe}" aria-hidden="true"></span>
							{#if data.canPay}
								<input
									type="checkbox"
									name="slotId"
									value={s.id}
									form="bulk-pay"
									aria-label="Select {s.displayName}"
									disabled={s.paid || s.totalMinor === 0}
									bind:group={selected}
									class="size-4 shrink-0 accent-[var(--dz-primary)] disabled:opacity-30"
								/>
							{/if}
							<span class="w-5 shrink-0 text-right text-xs text-subtle tabular-nums">{i + 1}</span>
							<Avatar name={s.displayName} src={s.avatar} size="sm" />
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 flex-wrap items-center gap-1.5">
									<span class="truncate font-medium">{s.displayName}</span>
									<SlotTags staffRole={s.staffRole} isLoadMaster={s.isLoadMaster} tandemPassenger={!!s.tandemPassengerId} extras={s.extras} colour={s.tiColour} warning={s.membershipWarning} />
								</div>
								<p class="truncate text-xs text-muted">
									{JUMP_TYPE_LABELS[s.jumpType]}{' · '}{Math.round(s.weightKg)} kg{#if s.licence}{' · '}{s.licence}{/if}{#if s.teamName}{' · '}{s.teamName}{/if}
								</p>
								{#if s.note}<p class="mt-0.5 truncate text-xs text-subtle italic">“{s.note}”</p>{/if}
							</div>
							<div class="shrink-0 text-right text-sm">
								{#if s.staffRole && s.totalMinor === 0}
									<span class="text-xs text-subtle">Staff</span>
								{:else}
									<span class="font-medium tabular-nums">{formatMoney(s.totalMinor, data.dz.currency)}</span>
									<span class={cn('block text-[11px]', s.paid ? 'text-success' : s.held ? 'text-muted' : 'text-warning')}>
										{s.paid ? `Paid${s.paidVia ? ` · ${paymentMethodLabel(s.paidVia)}` : ''}` : s.held ? 'In wallet' : 'Unpaid'}
									</span>
								{/if}
							</div>
							{#if data.canManifest || data.canPay}
								<button
									type="button"
									class="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
									aria-label="Edit {s.displayName}"
									data-testid="edit-slot"
									onclick={() => (editing = s)}
								>
									<MIcon name="edit" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="px-4 py-10 text-center text-sm text-muted">This load is empty. Add jumpers from the panel.</p>
			{/if}
		</section>

		{#if data.canManifest && data.editable}
			<details class="group rounded-2xl border border-border bg-surface" bind:open={settingsOpen}>
				<summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
					Plane, pilot & time
					<MIcon name="chevronRight" class="size-4 text-muted transition-transform group-open:rotate-90" />
				</summary>
				<form method="POST" action="?/updateLoad" class="grid gap-3 border-t border-border p-4 sm:grid-cols-2" use:enhance={act({ success: 'Load updated', onSuccess: () => (settingsOpen = false) })}>
					<input type="hidden" name="loadId" value={load.id} />
					<Select label="Aircraft" name="aircraftId" value={load.aircraftId ?? ''} options={[{ value: '', label: load.aircraftId ? 'Keep / custom' : (load.aircraftName ?? 'Custom') }, ...data.aircraft.map((a) => ({ value: a.id, label: a.name }))]} />
					<Input label="Slots (pax)" name="capacity" type="number" min="1" value={load.capacity} />
					<Select label="Pilot" name="pilotUserId" value={load.pilotUserId ?? ''} onchange={fillPilotWeight} options={[{ value: '', label: load.pilotUserId ? 'Other / none' : (load.pilotName ?? 'Other / none') }, ...data.pilots.map((p) => ({ value: p.id, label: p.name }))]} />
					<Input label="Pilot name (if not listed)" name="pilotName" value={load.pilotUserId ? '' : (load.pilotName ?? '')} />
					<Input label="Pilot weight (kg)" name="pilotWeightKg" type="number" min="0" value={load.pilotWeightKg ?? ''} />
					<Input label="Weight limit (kg)" name="weightLimitKg" type="number" min="0" value={load.weightLimitKg ?? ''} />
					<Input label="Time" name="time" type="time" value={clockTime(load.scheduledAt, data.dz.timezone)} />
					<Input label="Requirements" name="requirements" value={load.requirements ?? ''} />
					<div class="sm:col-span-2"><Button type="submit">Save load</Button></div>
				</form>
			</details>
		{/if}
	</div>

	<aside class="flex flex-col gap-4 lg:sticky lg:top-6">
		{#if data.canManifest && data.editable}
			<AddSlotPanel
				loadId={load.id}
				currency={data.dz.currency}
				free={load.stats.free}
				walletEnabled={data.dz.walletEnabled}
				checkedIn={data.checkedIn}
				members={data.members}
				staff={data.staff}
				passengers={data.passengers}
				teams={data.teams}
			/>
		{:else}
			<div class="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
				<Badge tone={load.status === 'completed' ? 'success' : 'neutral'}>{load.status === 'completed' ? 'Completed' : 'Locked'}</Badge>
				<p class="mt-3">
					{#if load.status === 'completed'}
						Completed{load.completedAt ? ` at ${clockTime(load.completedAt, data.dz.timezone)}` : ''}. Logbooks were written and wallets charged.
					{:else if !data.canManifest}
						You can view this load. Manifest staff can change it.
					{:else}
						This load has left — slots can't be changed any more.
					{/if}
				</p>
			</div>
		{/if}
	</aside>
</div>

<SlotEditor bind:slot={editing} currency={data.dz.currency} otherLoads={data.otherLoads} canPay={data.canPay} editable={data.editable && data.canManifest} />
<CompleteSummaryDialog bind:summary />
