<script lang="ts">
	import {
		JUMP_TYPES,
		JUMP_TYPE_LABELS,
		SLOT_EXTRA_LABELS,
		SPORT_EXTRAS,
		TANDEM_EXTRAS,
		formatMoney,
		type JumpType,
		type SlotExtra
	} from '#lib/domain/constants.ts';
	import { Select } from '#lib/ui/index.ts';
	import { cn } from '#lib/ui/cn.ts';
	import MIcon from './MIcon.svelte';
	import { quoteQuery, rentalLine, totalLabel } from './manifest.ts';
	import { EXTRA_ICONS } from './SlotTags.svelte';

	type Props = {
		jumpType?: JumpType;
		extras?: SlotExtra[];
		staffRole?: string | null;
		currency: string;
		/** Multiply the preview (several jumpers selected). */
		count?: number;
		/** Of those, how many slots also get gear rental (checked in with rental gear). */
		rentals?: number;
		/** Hide tandem from the jump-type list. */
		noTandem?: boolean;
		preview?: boolean;
		/** Slot editor: the custom base price as typed (major units), so the preview follows it. */
		baseOverride?: string | number | null;
		/** Slot editor: deposit already paid (tandem), shown as a line and taken off the total. */
		depositMinor?: number;
		idPrefix: string;
	};
	let {
		jumpType = $bindable('belly'),
		extras = $bindable([]),
		staffRole = null,
		currency,
		count = 1,
		rentals = 0,
		noTandem = true,
		preview = true,
		baseOverride = null,
		depositMinor = 0,
		idPrefix
	}: Props = $props();

	const types = $derived(JUMP_TYPES.filter((t) => !(noTandem && t === 'tandem')));
	const extraList = $derived(jumpType === 'tandem' ? TANDEM_EXTRAS : SPORT_EXTRAS);

	type Quote = { lines: { code: string; label: string; amountMinor: number }[]; totalMinor: number; depositMinor?: number; rentalMinor?: number; currency: string };
	let quote = $state<Quote | null>(null);
	let loading = $state(false);
	// Per-jumper gear rental (checked-in renters) on top of the shared slot price.
	const rental = $derived(rentals > 0 && quote?.rentalMinor ? quote.rentalMinor * rentals : 0);

	$effect(() => {
		if (!preview) return;
		const qs = quoteQuery({ jumpType, extras, staffRole, baseOverride, depositMinor });
		const ctrl = new AbortController();
		loading = true;
		const t = setTimeout(async () => {
			try {
				const r = await fetch(`/app/manifest/quote?${qs}`, { signal: ctrl.signal });
				if (r.ok) quote = await r.json();
			} catch {
				/* aborted */
			} finally {
				loading = false;
			}
		}, 120);
		return () => {
			clearTimeout(t);
			ctrl.abort();
		};
	});

	$effect(() => {
		const allowed = extraList;
		if (extras.some((e) => !allowed.includes(e))) extras = extras.filter((e) => allowed.includes(e));
	});

	function toggle(e: SlotExtra, on: boolean) {
		extras = on ? [...new Set([...extras, e])] : extras.filter((x) => x !== e);
	}
</script>

<div class="flex flex-col gap-3">
	<Select
		label="Jump type"
		name="jumpType"
		id="{idPrefix}-jt"
		bind:value={jumpType}
		options={types.map((t) => ({ value: t, label: JUMP_TYPE_LABELS[t] }))}
	/>
	<fieldset>
		<legend class="mb-1.5 text-sm font-medium">Extras</legend>
		<div class="flex flex-wrap gap-1.5">
			{#each extraList as e (e)}
				{@const on = extras.includes(e)}
				<label
					class={cn(
						'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors select-none',
						on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted hover:border-border-strong hover:text-fg'
					)}
				>
					<input type="checkbox" name="extras" value={e} checked={on} class="sr-only" onchange={(ev) => toggle(e, (ev.currentTarget as HTMLInputElement).checked)} />
					<MIcon name={EXTRA_ICONS[e]} class="size-3.5" />
					{SLOT_EXTRA_LABELS[e]}
				</label>
			{/each}
		</div>
		<input type="hidden" name="extrasSent" value="1" />
	</fieldset>
	{#if preview}
		<div class="rounded-xl border border-border bg-surface-2/50 p-3 text-sm" aria-live="polite" data-testid="price-preview">
			{#if quote}
				<ul class="space-y-1">
					{#each quote.lines as l (l.code + l.label)}
						<li class="flex justify-between gap-2 text-muted">
							<span>{l.label}</span><span class="tabular-nums">{formatMoney(l.amountMinor, quote.currency)}</span>
						</li>
					{:else}
						<li class="text-muted">No charge</li>
					{/each}
				</ul>
				{#if rental}
					<p class="mt-1 flex justify-between gap-2 text-muted" data-testid="price-rental">
						<span>{rentalLine(rentals)}</span><span class="tabular-nums">{formatMoney(rental, quote.currency)}</span>
					</p>
				{/if}
				<div class={cn('mt-2 flex items-baseline justify-between border-t border-border pt-2 font-semibold', loading && 'opacity-60')}>
					<span>{totalLabel(count, rental > 0, (quote.depositMinor ?? 0) > 0)}</span>
					<span class="tabular-nums" data-testid="price-total">{formatMoney(quote.totalMinor * count + rental, quote.currency)}</span>
				</div>
			{:else}
				<p class="text-muted">Price preview…</p>
			{/if}
		</div>
	{/if}
</div>
