<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { Badge, Button, Icon, cn, toast } from '#lib/ui/index.ts';
	import { SLOT_EXTRA_LABELS, formatMoney } from '#lib/domain/constants.ts';
	import BookingSteps from '#lib/components/tandems/BookingSteps.svelte';
	import SignWaiver from '#lib/components/waivers/SignWaiver.svelte';
	import { fmtDay } from '#lib/components/tandems/model.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const b = $derived(data.booking);
	const needsSign = $derived(data.waiver && !b.signedAt && b.status !== 'cancelled');
	const money = (m: number) => formatMoney(m, b.currency);
	const pdfHref = $derived(`/dz/${data.dz.slug}/book/${b.confirmationNumber}/pdf`);
	const signHref = (conf: string) => `/dz/${data.dz.slug}/book/${conf}#indemnity`;
	let signLater = $state(false);
	let payWhat = $state<'deposit' | 'balance'>('deposit');
	let who = $state<'group' | 'me'>('group');
	let paying = $state<string | null>(null);
	const notice = $derived(data.paymentNotice);
	const f = $derived(form as { message?: string; ok?: boolean } | null);

	$effect(() => {
		if (page.url.searchParams.get('new') !== '1') return;
		const u = new URL(page.url.href);
		u.searchParams.delete('new');
		untrack(() => {
			toast.success('Booking confirmed');
			goto(u, { replace: true, shallow: true });
		});
	});

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied');
		} catch {
			/* ignore */
		}
	}
</script>

<svelte:head><title>Booking {b.confirmationNumber} · {data.dz.name}</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-6 pb-16 sm:px-6">
	<BookingSteps current={needsSign && !signLater ? 'waiver' : 'done'} waiver={data.waiver} />

	{#if notice}
		{@const ok = notice.status === 'succeeded'}
		{@const wait = notice.status === 'pending'}
		<div
			class={cn('mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm', ok ? 'border-success/30 bg-success/5' : wait ? 'border-primary/30 bg-primary/5' : 'border-warning/30 bg-warning/10')}
			data-testid="payment-notice"
			data-status={notice.status}
			role="status"
		>
			<JIcon name={ok ? 'checkCircle' : wait ? 'clock' : 'alert'} class={cn('mt-0.5 size-5 shrink-0', ok ? 'text-success' : wait ? 'text-primary' : 'text-warning')} />
			<div class="min-w-0 flex-1">
				{#if ok}
					<p class="font-medium">Payment received — {formatMoney(notice.amountMinor, notice.currency)} via {notice.provider}</p>
					<p class="text-muted">Thank you! It’s been added to your booking.</p>
				{:else if wait}
					<p class="font-medium">Payment processing</p>
					<p class="text-muted">{notice.provider} hasn’t confirmed your {formatMoney(notice.amountMinor, notice.currency)} payment yet. This usually takes a few seconds — <a href={page.url.href} class="font-medium text-primary hover:underline">refresh</a>.</p>
				{:else if notice.status === 'error'}
					<p class="font-medium">We couldn’t start the online payment</p>
					<p class="text-muted">Your booking is confirmed. Try paying online again below, or pay at the dropzone.</p>
				{:else}
					<p class="font-medium">Payment not completed</p>
					<p class="text-muted">No money was taken. Your booking still stands — try again below or pay at the dropzone.</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ticket -->
	<section class="relative mt-6 overflow-hidden rounded-3xl border border-border bg-surface" data-testid="ticket">
		<div class="absolute -top-24 -right-24 size-64 rounded-full bg-primary/20 blur-3xl"></div>
		<div class="relative p-5 sm:p-6">
			<div class="flex items-start gap-3">
				<span class={cn('grid size-11 shrink-0 place-items-center rounded-2xl', b.status === 'cancelled' ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success')}>
					<Icon name={b.status === 'cancelled' ? 'waiver' : 'check'} />
				</span>
				<div class="min-w-0">
					<h1 class="text-xl font-semibold tracking-tight sm:text-2xl">
						{b.status === 'cancelled' ? 'Booking cancelled' : `You’re booked, ${b.name.split(' ')[0]}!`}
					</h1>
					<p class="mt-0.5 text-sm text-muted">Tandem skydive at {data.dz.name}</p>
				</div>
			</div>

			<div class="mt-5 grid gap-4 rounded-2xl border border-dashed border-border-strong bg-surface-2/40 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
				<div>
					<p class="text-[11px] font-semibold tracking-wider text-subtle uppercase">Confirmation number</p>
					<button type="button" class="mt-1 font-mono text-2xl font-semibold tracking-[0.15em] text-primary" onclick={() => copy(b.confirmationNumber)} data-testid="conf">
						{b.confirmationNumber}
					</button>
				</div>
				<div class="sm:text-right">
					<p class="font-semibold">{b.jumpDate ? fmtDay(b.jumpDate, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date to be confirmed'}</p>
					<p class="text-sm text-muted">{b.bookingTime ? `Arrive by ${b.bookingTime}` : ''}</p>
				</div>
			</div>

			<dl class="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				<dt class="text-muted">Add-ons</dt>
				<dd class="text-right">{b.extras.length ? b.extras.map((e) => SLOT_EXTRA_LABELS[e]).join(', ') : 'None'}</dd>
				<dt class="text-muted">Total</dt>
				<dd class="text-right tabular-nums">{money(b.totalMinor)}</dd>
				<dt class="text-muted">Paid</dt>
				<dd class="text-right tabular-nums">{money(b.amountPaidMinor)}</dd>
				<dt class="font-medium">{b.outstandingMinor > 0 ? 'Due at the dropzone' : 'Balance'}</dt>
				<dd class="text-right font-semibold tabular-nums">{money(b.outstandingMinor)}</dd>
				<dt class="text-muted">Indemnity</dt>
				<dd class="text-right">
					{#if b.signedAt}<Badge tone="success">Signed</Badge>{:else if data.waiver}<Badge tone="warning">Not signed yet</Badge>{:else}<span class="text-muted">At the DZ</span>{/if}
				</dd>
			</dl>

			<div class="mt-5 flex flex-wrap gap-2">
				<Button variant="secondary" href={pdfHref} target="_blank" rel="noopener" data-testid="pdf"><Icon name="waiver" class="size-4" /> Download PDF</Button>
				<Button variant="ghost" href="/dz/{data.dz.slug}">About {data.dz.name}</Button>
			</div>
			{#if b.email}<p class="mt-3 text-xs text-subtle">We’ve emailed the details to {b.email}.</p>{/if}
		</div>
	</section>

	{#if data.payOnline}
		{@const po = data.payOnline}
		{@const cur = (who === 'group' && po.group) || po.me || po.group}
		<section class="mt-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="pay-online">
			<h2 class="font-semibold">Pay online now</h2>
			<p class="mt-0.5 text-sm text-muted">Skip the queue on the day. Your payment goes straight to {data.dz.name}.</p>
			<form
				method="POST"
				action="?/pay"
				class="mt-4 space-y-3"
				use:enhance={({ submitter }) => {
					paying = (submitter as HTMLButtonElement | null)?.value ?? 'x';
					return async ({ result, update }) => {
						if (result.type === 'failure') {
							paying = null;
							toast.error(String((result.data as { message?: string })?.message ?? 'Payment could not start'));
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="g" value={data.groupQuery} />
				{#if po.group && po.me}
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who are you paying for">
						{#each [{ id: 'group', title: `Whole group · ${po.group.count} jumpers` }, { id: 'me', title: 'Just me' }] as o (o.id)}
							<label class="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
								<input type="radio" name="who" value={o.id} bind:group={who} class="size-4 accent-[var(--dz-primary)]" data-testid="who-{o.id}" />
								<span class="font-medium">{o.title}</span>
							</label>
						{/each}
					</div>
				{:else}
					<input type="hidden" name="who" value={po.group ? 'group' : 'me'} />
				{/if}
				{#if cur && cur.deposit > 0}
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How much to pay">
						{#each [{ id: 'deposit', title: `Deposit · ${money(cur.deposit)}` }, { id: 'balance', title: `Full balance · ${money(cur.balance)}` }] as o (o.id)}
							<label class="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
								<input type="radio" name="pay" value={o.id} bind:group={payWhat} class="size-4 accent-[var(--dz-primary)]" />
								<span class="font-medium tabular-nums">{o.title}</span>
							</label>
						{/each}
					</div>
				{:else}
					<input type="hidden" name="pay" value="balance" />
				{/if}
				<div class="flex flex-wrap gap-2">
					{#each po.providers as p (p.id)}
						<Button type="submit" name="provider" value={p.id} loading={paying === p.id} data-testid="pay-with-{p.id}">
							Pay {money(cur && cur.deposit > 0 && payWhat === 'deposit' ? cur.deposit : (cur?.balance ?? 0))} with {p.label}
						</Button>
					{/each}
				</div>
				{#if f?.message && !f.ok}<p class="text-sm text-danger">{f.message}</p>{/if}
			</form>
		</section>
	{/if}

	{#if data.group.length}
		<section class="mt-4 rounded-2xl border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold">Your group</h2>
			<p class="mt-0.5 text-xs text-muted">Each jumper signs their own indemnity — share their link.</p>
			<ul class="mt-3 divide-y divide-border">
				{#each data.group as g (g.confirmationNumber)}
					<li class="flex items-center gap-3 py-2 text-sm">
						<span class="min-w-0 flex-1">
							<span class="block truncate">{g.name}</span>
							<span class="block truncate text-xs text-muted">
								{#if !g.cancelled && g.priced}<span class="tabular-nums" data-testid="group-due">{g.outstandingMinor > 0 ? `${money(g.outstandingMinor)} due` : 'Paid'}</span> · {/if}
								<span class="font-mono">{g.confirmationNumber}</span>
							</span>
						</span>
						{#if g.cancelled}<Badge tone="danger">Cancelled</Badge>{:else if g.signed}<Badge tone="success">Signed</Badge>{:else if data.waiver}
							<Button size="sm" variant="secondary" href={signHref(g.confirmationNumber)}>Sign</Button>
							<Button size="sm" variant="ghost" onclick={() => copy(`${page.url.origin}${signHref(g.confirmationNumber)}`)}>Copy link</Button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if data.groupDueMinor !== null}
				<p class="mt-2 flex justify-between border-t border-border pt-3 text-sm font-medium" data-testid="group-total">
					<span>Group total due · {data.group.length + 1} jumpers</span>
					<span class="tabular-nums">{money(data.groupDueMinor)}</span>
				</p>
			{/if}
		</section>
	{/if}

	<!-- step 4: indemnity -->
	{#if needsSign}
		<section id="indemnity" class="mt-8 scroll-mt-20">
			<h2 class="text-2xl font-semibold tracking-tight">Sign your indemnity</h2>
			<p class="mt-1 text-sm text-muted">
				Everyone who jumps signs before boarding. Do it now on your phone and skip the queue at the dropzone{b.minor ? ' — a parent or guardian signs too' : ''}.
			</p>
			{#if signLater}
				<div class="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">
					No problem — open this page again from your email any time before the jump, or sign at the dropzone.
					<Button size="sm" variant="secondary" class="mt-3" onclick={() => (signLater = false)}>Sign now</Button>
				</div>
			{:else}
				<div class="mt-4">
					<SignWaiver
						action="?/sign"
						sections={data.sections}
						dropzoneName={data.dz.name}
						signerName={b.name}
						title="Tandem Skydive Indemnity"
						guardian={b.minor}
						guardianName={b.guardianName ?? ''}
						errorSection={(form as { section?: number | null } | null)?.section ?? null}
						submitLabel="Sign indemnity"
					/>
					<Button variant="ghost" size="sm" class="mt-2" onclick={() => (signLater = true)}>I’ll sign later</Button>
				</div>
			{/if}
		</section>
	{:else if b.signedAt}
		<section class="mt-4 flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm">
			<Icon name="check" class="size-5 text-success" />
			<p class="flex-1">Indemnity signed {new Date(b.signedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}. Your PDF includes the signed form.</p>
		</section>
	{/if}

	<section class="mt-8 grid gap-3 text-sm sm:grid-cols-3">
		{#each [['sun', 'Dress comfortably', 'Closed shoes and clothes you can move in. We provide the jumpsuit.'], ['wind', 'Weather dependent', 'If the sky says no, we’ll move you to the next good day.'], ['shield', 'Bring ID', 'And plan for 3–4 hours on site including the briefing.']] as [icon, t, d] (t)}
			<div class="rounded-2xl border border-border bg-surface p-4">
				<Icon name={icon as 'sun'} class="size-4 text-primary" />
				<p class="mt-2 font-medium">{t}</p>
				<p class="mt-0.5 text-muted">{d}</p>
			</div>
		{/each}
	</section>
</div>
