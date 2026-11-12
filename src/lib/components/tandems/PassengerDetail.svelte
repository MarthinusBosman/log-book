<script lang="ts">
	/** Staff tandem detail (drawer on /app/tandems and full page /app/tandems/[id]). */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Badge, Button, Icon, Input, Select, cn, toast } from '#lib/ui/index.ts';
	import { SLOT_EXTRA_LABELS, formatMoney, type SlotExtra } from '#lib/domain/constants.ts';
	import type { PassengerDetail } from '#lib/server/tandems/detail.ts';
	import PassengerFields from './PassengerFields.svelte';
	import { toastEnhance } from './enhance.ts';
	import {
		MANUAL_METHODS,
		PAYMENT_LABELS,
		PAYMENT_TONES,
		STAGE_LABELS,
		STAGE_ORDER,
		STAGE_TONES,
		ageOn,
		fmtDay,
		limitWarnings,
		tandemStage,
		type TandemLimits
	} from './model.ts';

	type Props = {
		detail: PassengerDetail;
		dz: { slug: string; currency: string };
		offer: { extras: { code: SlotExtra; priceMinor: number }[] };
		limits: TandemLimits;
	};
	let { detail, dz, offer, limits }: Props = $props();

	const p = $derived(detail.passenger);
	const action = (name: string) => `/app/tandems/${p.id}?/${name}`;
	const stage = $derived(tandemStage(p));
	const minor = $derived(!!p.dob && !!p.jumpDate && ageOn(p.dob, p.jumpDate) < 18);
	const warnings = $derived(limitWarnings(p, limits));
	const money = (m: number) => formatMoney(m, p.currency);
	const pax = $derived(detail.group.find((g) => !g.staffRole));
	const ti = $derived(detail.group.find((g) => g.staffRole === 'tandem_instructor'));
	const video = $derived(detail.group.find((g) => g.staffRole === 'videographer'));
	const regLink = $derived(`${page.url.origin}/dz/${dz.slug}/book/${p.confirmationNumber}`);
	let editing = $state(false);
	let busy = $state<string | null>(null);

	const tracked = (name: string, opts: Parameters<typeof toastEnhance>[0] = {}) =>
		toastEnhance({ ...opts, pending: (on) => (busy = on ? name : null) });

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(regLink);
			toast.success('Registration link copied');
		} catch {
			toast.error('Could not copy — select the link manually');
		}
	}
	const stageIndex = $derived(STAGE_ORDER.indexOf(stage));
	const staffOptions = (list: { id: string; name: string }[], none?: string) => [
		...(none ? [{ value: '', label: none }] : []),
		...list.map((u) => ({ value: u.id, label: u.name }))
	];
</script>

<div class="flex flex-col gap-5" data-testid="tandem-detail">
	<!-- header -->
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<Badge tone={STAGE_TONES[stage]} dot>{STAGE_LABELS[stage]}</Badge>
				<Badge tone={PAYMENT_TONES[p.paymentStatus]}>{PAYMENT_LABELS[p.paymentStatus]}</Badge>
				{#if p.onlineBooking}<Badge tone="neutral">Online</Badge>{/if}
				{#if minor}<Badge tone="warning">Under 18</Badge>{/if}
			</div>
			<h2 class="mt-2 truncate text-xl font-semibold tracking-tight">{p.name}</h2>
			<p class="mt-0.5 text-sm text-muted">
				{p.jumpDate ? fmtDay(p.jumpDate, { weekday: 'long', day: 'numeric', month: 'long' }) : 'No date'}{p.bookingTime ? ` · ${p.bookingTime}` : ''}
			</p>
		</div>
		<div class="text-right">
			<p class="text-[11px] font-medium tracking-wider text-subtle uppercase">Confirmation</p>
			<p class="font-mono text-sm font-semibold tracking-wider text-primary" data-testid="confirmation-number">{p.confirmationNumber}</p>
		</div>
	</div>

	<!-- journey -->
	{#if stage !== 'cancelled'}
		<ol class="grid grid-cols-5 gap-1" aria-label="Booking progress">
			{#each STAGE_ORDER as s, i (s)}
				<li class="flex flex-col gap-1.5">
					<span class={cn('h-1.5 rounded-full', i <= stageIndex ? 'bg-primary' : 'bg-surface-2')}></span>
					<span class={cn('text-[10px] leading-tight sm:text-[11px]', i <= stageIndex ? 'text-fg' : 'text-subtle')}>{STAGE_LABELS[s]}</span>
				</li>
			{/each}
		</ol>
	{/if}

	{#if warnings.length}
		<div class="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning" role="status">
			<Icon name="shield" class="mt-0.5 size-4" />
			<div>{#each warnings as w (w)}<p>{w}</p>{/each}</div>
		</div>
	{/if}

	<!-- quick actions -->
	<div class="flex flex-wrap gap-2">
		<Button size="sm" variant="secondary" href="/app/tandems/{p.id}/pdf" target="_blank" rel="noopener">
			<Icon name="waiver" class="size-4" /> PDF
		</Button>
		<form method="POST" action={action('resend')} use:enhance={tracked('resend')}>
			<Button size="sm" variant="secondary" type="submit" loading={busy === 'resend'} disabled={!p.email}>
				<Icon name="arrowRight" class="size-4" /> Resend confirmation
			</Button>
		</form>
		<Button size="sm" variant="ghost" onclick={copyLink}><Icon name="globe" class="size-4" /> Copy link</Button>
	</div>

	<!-- manifest -->
	<section class="rounded-2xl border border-border bg-surface-2/40 p-4">
		<h3 class="flex items-center gap-2 text-sm font-semibold"><Icon name="plane" class="size-4 text-primary" /> Manifest</h3>
		{#if pax}
			<p class="mt-2 text-sm">
				On <span class="font-semibold">Load {pax.loadNumber}</span>
				<span class="text-muted">· {fmtDay(pax.day)} · {pax.loadStatus}</span>
			</p>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<form method="POST" action={action('staff')} use:enhance={tracked('ti')} class="flex items-end gap-2">
					<input type="hidden" name="role" value="tandem_instructor" />
					<Select label="Tandem instructor" name="userId" value={ti?.userId ?? ''} options={staffOptions(detail.instructors)} class="flex-1" />
					<Button size="icon" variant="secondary" type="submit" loading={busy === 'ti'} aria-label="Change TI"><Icon name="check" class="size-4" /></Button>
				</form>
				<form method="POST" action={action('staff')} use:enhance={tracked('video')} class="flex items-end gap-2">
					<input type="hidden" name="role" value="videographer" />
					<Select label="Videographer" name="userId" value={video?.userId ?? ''} options={staffOptions(detail.videographers, 'No outside video')} class="flex-1" />
					<Button size="icon" variant="secondary" type="submit" loading={busy === 'video'} aria-label="Change videographer"
						><Icon name="check" class="size-4" /></Button
					>
				</form>
			</div>
			<form method="POST" action={action('unmanifest')} use:enhance={tracked('unmanifest')} class="mt-3">
				<Button size="sm" variant="ghost" type="submit" loading={busy === 'unmanifest'} class="text-danger">Remove from load</Button>
			</form>
		{:else if p.status === 'cancelled' || p.status === 'completed'}
			<p class="mt-2 text-sm text-muted">Not on a load.</p>
		{:else if detail.loads.length === 0}
			<p class="mt-2 text-sm text-muted">No open loads on {fmtDay(detail.loadsDay)}. Create loads in Manifest first.</p>
			<Button size="sm" variant="secondary" href="/app/manifest" class="mt-3">Open manifest</Button>
		{:else}
			<form method="POST" action={action('manifest')} use:enhance={tracked('manifest')} class="mt-3 grid gap-3 sm:grid-cols-2">
				<Select
					label="Load ({fmtDay(detail.loadsDay)})"
					name="loadId"
					class="sm:col-span-2"
					options={detail.loads.map((l) => ({
						value: l.id,
						label: `Load ${l.loadNumber} · ${l.aircraftName ?? 'Aircraft'} · ${l.free}/${l.capacity} free`,
						disabled: l.free < 2
					}))}
				/>
				<Select label="Tandem instructor" name="instructorUserId" placeholder="Choose TI" value="" options={staffOptions(detail.instructors)} required />
				<Select label="Videographer" name="videographerUserId" value="" options={staffOptions(detail.videographers, 'No outside video')} />
				<Button type="submit" loading={busy === 'manifest'} class="sm:col-span-2"><Icon name="plus" class="size-4" /> Add tandem group to load</Button>
			</form>
		{/if}
	</section>

	<!-- payment -->
	<section class="rounded-2xl border border-border p-4">
		<h3 class="flex items-center gap-2 text-sm font-semibold"><Icon name="wallet" class="size-4 text-primary" /> Payment</h3>
		<dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
			<dt class="text-muted">Tandem skydive</dt>
			<dd class="text-right tabular-nums">{money(p.totalMinor)}</dd>
			{#each p.extras as e (e)}
				<dt class="pl-3 text-xs text-subtle">incl. {SLOT_EXTRA_LABELS[e]}</dt>
				<dd></dd>
			{/each}
			<dt class="text-muted">Deposit paid</dt>
			<dd class="text-right tabular-nums">{money(p.depositMinor)}</dd>
			<dt class="text-muted">Amount paid</dt>
			<dd class="text-right tabular-nums">{money(p.amountPaidMinor)}{p.paymentMethod ? ` · ${p.paymentMethod}` : ''}</dd>
			<dt class="font-semibold">Outstanding</dt>
			<dd class={cn('text-right font-semibold tabular-nums', detail.outstandingMinor > 0 ? 'text-warning' : 'text-success')}>
				{money(detail.outstandingMinor)}
			</dd>
		</dl>
		{#if p.status !== 'cancelled'}
			<form method="POST" action={action('pay')} use:enhance={tracked('pay', { reset: true })} class="mt-4 grid grid-cols-2 gap-3">
				<Input
					label="Amount received"
					name="amount"
					inputmode="decimal"
					required
					value={detail.outstandingMinor > 0 ? (detail.outstandingMinor / 100).toFixed(2) : ''}
				/>
				<Select label="Method" name="method" value="card" options={MANUAL_METHODS} />
				<label class="col-span-2 flex items-center gap-2 text-sm text-muted">
					<input type="checkbox" name="isDeposit" class="size-4 accent-[var(--dz-primary)]" /> This is a deposit
				</label>
				<Button type="submit" variant="secondary" loading={busy === 'pay'} class="col-span-2">Mark payment</Button>
			</form>
		{/if}
	</section>

	<!-- indemnity -->
	<section class="rounded-2xl border border-border p-4">
		<h3 class="flex items-center gap-2 text-sm font-semibold"><Icon name="waiver" class="size-4 text-primary" /> Indemnity</h3>
		{#if detail.signature}
			<p class="mt-2 text-sm">
				Signed by <span class="font-medium">{detail.signature.signerName}</span>
				{#if detail.signature.guardianName}and guardian <span class="font-medium">{detail.signature.guardianName}</span>{/if}
				<span class="text-muted">· {new Date(detail.signature.signedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
			</p>
		{:else}
			<p class="mt-2 text-sm text-muted">Not signed yet. Share the registration link so the passenger can sign on their phone, or hand them a tablet.</p>
			<div class="mt-2 flex gap-2">
				<Button size="sm" variant="secondary" href="{regLink}#indemnity" target="_blank" rel="noopener">Open signing page</Button>
			</div>
		{/if}
		<form method="POST" action={action('regenerate')} use:enhance={tracked('regen')} class="mt-3">
			<Button size="sm" variant="ghost" type="submit" loading={busy === 'regen'}>Regenerate PDF</Button>
		</form>
	</section>

	<!-- people -->
	<section class="grid gap-3 text-sm sm:grid-cols-2">
		{#snippet item(label: string, value: string | number | null | undefined)}
			{#if value !== null && value !== undefined && value !== ''}
				<div>
					<dt class="text-[11px] font-medium tracking-wider text-subtle uppercase">{label}</dt>
					<dd class="mt-0.5 break-words">{value}</dd>
				</div>
			{/if}
		{/snippet}
		<dl class="grid gap-2 rounded-2xl border border-border p-4">
			<p class="text-xs font-semibold tracking-wider text-muted uppercase">Passenger</p>
			{@render item('Email', p.email)}
			{@render item('Phone', p.phone)}
			{@render item('ID / Passport', p.idNumber)}
			{@render item('Date of birth', p.dob ? `${p.dob}${minor ? ' (under 18)' : ''}` : null)}
			{@render item('Weight / height', [p.weightKg && `${p.weightKg} kg`, p.heightCm && `${p.heightCm} cm`].filter(Boolean).join(' · '))}
			{@render item('Nationality', p.nationality)}
			{@render item('Address', [p.addressLine1, p.city, p.country].filter(Boolean).join(', '))}
			{@render item('Heard about us', p.heardFrom)}
			{@render item('Note', p.note)}
		</dl>
		<dl class="grid content-start gap-2 rounded-2xl border border-border p-4">
			<p class="text-xs font-semibold tracking-wider text-muted uppercase">Emergency contact</p>
			{@render item('Name', p.emergencyName ?? '—')}
			{@render item('Phone', p.emergencyPhone)}
			{@render item('Email', p.emergencyEmail)}
			{#if minor || p.guardianName}
				<p class="mt-2 text-xs font-semibold tracking-wider text-warning uppercase">Guardian</p>
				{@render item('Name', p.guardianName ?? 'Missing')}
				{@render item('Email', p.guardianEmail)}
				{@render item('ID / Passport', p.guardianIdNumber)}
			{/if}
		</dl>
	</section>

	<!-- edit -->
	<section class="rounded-2xl border border-border">
		<button
			type="button"
			class="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
			aria-expanded={editing}
			onclick={() => (editing = !editing)}
		>
			Edit details
			<Icon name="chevronsUpDown" class="size-4 text-muted" />
		</button>
		{#if editing}
			<form method="POST" action={action('update')} use:enhance={tracked('update', { onSuccess: () => (editing = false) })} class="border-t border-border p-4">
				<PassengerFields values={p} {offer} currency={dz.currency} {limits} />
				<Button type="submit" loading={busy === 'update'} class="mt-4 w-full">Save changes</Button>
			</form>
		{/if}
	</section>

	<!-- status -->
	<section class="flex flex-wrap gap-2 border-t border-border pt-4">
		{#if p.status !== 'completed' && p.status !== 'cancelled'}
			<form method="POST" action={action('complete')} use:enhance={tracked('complete')}>
				<Button size="sm" variant="secondary" type="submit" loading={busy === 'complete'}><Icon name="check" class="size-4" /> Mark as jumped</Button>
			</form>
		{/if}
		{#if p.status === 'cancelled' || p.status === 'completed'}
			<form method="POST" action={action('reset')} use:enhance={tracked('reset')}>
				<Button size="sm" variant="secondary" type="submit" loading={busy === 'reset'}>Reset tandem</Button>
			</form>
		{/if}
		{#if p.status !== 'cancelled' && p.status !== 'completed' && !p.manifested}
			<form
				method="POST"
				action={action('cancel')}
				use:enhance={tracked('cancel', { before: () => (confirm(`Cancel ${p.name}'s booking?`) ? null : false) })}
			>
				<Button size="sm" variant="ghost" type="submit" loading={busy === 'cancel'} class="text-danger">Cancel booking</Button>
			</form>
		{/if}
	</section>
</div>
