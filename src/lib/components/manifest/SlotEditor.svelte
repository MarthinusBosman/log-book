<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { Button, Dialog, Input, Select } from '#lib/ui/index.ts';
	import { SLOT_STAFF_ROLE_LABELS, formatMoney, type JumpType, type SlotExtra } from '#lib/domain/constants.ts';
	import { act } from './forms.ts';
	import { removeSlotConfirm } from './manifest.ts';
	import JumpFields from './JumpFields.svelte';
	import type { SlotVM } from './types.ts';

	type Props = {
		slot: SlotVM | null;
		currency: string;
		otherLoads: { id: string; loadNumber: number; free: number }[];
		canPay: boolean;
		editable: boolean;
	};
	let { slot = $bindable(null), currency, otherLoads, canPay, editable }: Props = $props();

	let open = $state(false);
	let jumpType = $state<JumpType>('belly');
	let extras = $state<SlotExtra[]>([]);
	let colour = $state('');
	let busy = $state(false);

	$effect(() => {
		const s = slot;
		untrack(() => {
			open = !!s;
			if (s) {
				jumpType = s.jumpType;
				extras = [...s.extras];
				colour = s.colour ?? '';
			}
		});
	});
	const close = () => (open = false);
	const COLOURS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
</script>

<Dialog bind:open title={slot ? slot.displayName : ''} description="Update slot details" variant="right" onclose={() => (slot = null)}>
	{#if slot}
		{@const s = slot}
		<div class="flex flex-col gap-6" data-testid="slot-editor">
			<section>
				<h3 class="text-sm font-semibold">Price</h3>
				<ul class="mt-2 space-y-1 rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
					{#each s.priceBreakdown as l (l.code + l.label)}
						<li class="flex justify-between text-muted"><span>{l.label}</span><span class="tabular-nums">{formatMoney(l.amountMinor, currency)}</span></li>
					{:else}
						<li class="text-muted">No charge</li>
					{/each}
					<li class="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
						<span>Total</span><span class="tabular-nums">{formatMoney(s.totalMinor, currency)}</span>
					</li>
					<li class="text-xs text-subtle">
						{s.paid ? `Paid${s.paidVia ? ` via ${s.paidVia}` : ''}` : s.held ? 'Reserved in wallet — charged when the load completes' : 'Unpaid'}
					</li>
				</ul>
				{#if canPay && !s.paid && s.totalMinor > 0}
					<form method="POST" action="?/markPaid" class="mt-2 flex gap-2" use:enhance={act({ success: 'Slot marked as paid', onSuccess: close })}>
						<input type="hidden" name="slotId" value={s.id} />
						<Select name="provider" value="cash" class="flex-1" options={[{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'eft', label: 'EFT' }, { value: 'manual', label: 'Other' }]} />
						<Button type="submit" variant="secondary" class="h-11">Mark paid</Button>
					</form>
				{/if}
			</section>

			{#if editable}
				<form
					method="POST"
					action="?/updateSlot"
					class="flex flex-col gap-4"
					use:enhance={act({ success: 'Slot updated', onSuccess: close, pending: (b) => (busy = b) })}
				>
					<input type="hidden" name="slotId" value={s.id} />
					{#if s.paid}
						<p class="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">This slot is paid — jump type, extras and price are locked.</p>
					{:else}
						<JumpFields idPrefix="ed" bind:jumpType bind:extras staffRole={s.staffRole} noTandem={s.jumpType !== 'tandem'} {currency} />
						<Input label="Custom base price ({currency})" name="baseOverride" type="number" min="0" step="0.01" value={s.baseOverrideMinor != null ? s.baseOverrideMinor / 100 : ''} hint="Leave empty for the price list. Replaces the base only." />
					{/if}
					<div class="grid grid-cols-2 gap-3">
						<Input label="Weight (kg)" name="weightKg" type="number" min="0" step="1" value={s.weightKg} />
						<Select
							label="Working as"
							name="staffRole"
							value={s.staffRole ?? ''}
							options={[{ value: '', label: 'Jumper' }, ...Object.entries(SLOT_STAFF_ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
						/>
					</div>
					{#if !s.userId}<Input label="Name" name="displayName" value={s.displayName} />{/if}
					<label class="flex items-center gap-2.5 text-sm">
						<input type="hidden" name="lmSent" value="1" />
						<input type="checkbox" name="isLoadMaster" checked={s.isLoadMaster} class="size-4 accent-[var(--dz-primary)]" /> Load master (LM) for this load
					</label>
					<fieldset>
						<legend class="mb-1.5 text-sm font-medium">Colour</legend>
						<input type="hidden" name="colour" value={colour} />
						<div class="flex flex-wrap items-center gap-1.5">
							<button type="button" class="h-7 rounded-full border border-border px-2.5 text-xs text-muted hover:text-fg {colour === '' ? 'ring-2 ring-primary' : ''}" onclick={() => (colour = '')}>None</button>
							{#each COLOURS as c (c)}
								<button type="button" aria-label="Colour {c}" class="size-7 rounded-full {colour === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-elevated' : ''}" style="background:{c}" onclick={() => (colour = c)}></button>
							{/each}
						</div>
					</fieldset>
					<div class="flex flex-col gap-1.5">
						<label for="slot-note" class="text-sm font-medium">Note</label>
						<textarea id="slot-note" name="note" rows="2" class="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">{s.note ?? ''}</textarea>
					</div>
					<Button type="submit" loading={busy}>Save slot</Button>
				</form>

				<section class="flex flex-col gap-3 border-t border-border pt-5">
					<h3 class="text-sm font-semibold">Move or remove</h3>
					{#if otherLoads.length}
						<form method="POST" action="?/moveSlot" class="flex flex-wrap items-end gap-2" use:enhance={act({ success: (d) => `Moved to load ${d.toLoadNumber}`, onSuccess: close })}>
							<input type="hidden" name="slotId" value={s.id} />
							<Select label="Move to load" name="toLoadId" class="min-w-40 flex-1" options={otherLoads.map((l) => ({ value: l.id, label: `Load ${l.loadNumber} · ${l.free} free`, disabled: l.free === 0 }))} />
							{#if s.groupId}<label class="flex h-11 items-center gap-2 text-sm"><input type="checkbox" name="withGroup" checked class="size-4 accent-[var(--dz-primary)]" /> whole group</label>{/if}
							<Button type="submit" variant="secondary" class="h-11">Move</Button>
						</form>
					{/if}
					<form
						method="POST"
						action="?/removeSlot"
						class="flex flex-wrap items-center gap-3"
						use:enhance={act({ confirm: () => removeSlotConfirm(s.displayName), success: 'Removed from load', onSuccess: close })}
					>
						<input type="hidden" name="slotId" value={s.id} />
						{#if s.groupId}<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="withGroup" checked={!!s.tandemPassengerId} class="size-4 accent-[var(--dz-primary)]" /> Remove whole group</label>{/if}
						<Button type="submit" variant="danger" class="ml-auto" data-testid="remove-slot">Remove from load</Button>
					</form>
				</section>
			{/if}
		</div>
	{/if}
</Dialog>
