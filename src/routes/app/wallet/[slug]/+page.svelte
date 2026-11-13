<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Badge, Button, Card, EmptyState, Icon, Tabs, cn, toast } from '#lib/ui/index.ts';
	import { formatMoney } from '#lib/domain/constants.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import FormAlert from '#lib/components/jumper/FormAlert.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { fmtDate, fmtDateTime, relativeTime } from '#lib/components/jumper/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const f = $derived(form as { action?: string; message?: string; success?: string; redirect?: string } | null);
	const cur = $derived(data.account?.currency ?? data.dz.currency);
	const money = (m: number) => formatMoney(m, cur);
	// svelte-ignore state_referenced_locally
	let tab = $state(data.unpaid.length ? 'unpaid' : 'history');
	let amount = $state('');
	const firstProvider = () => data.providers[0]?.id ?? 'manual';
	let provider = $state<string>(firstProvider());
	const online = $derived(provider !== 'manual');
	const providerLabel = $derived(data.providers.find((p) => p.id === provider)?.label ?? '');
	const notice = $derived(data.paymentNotice);
	let busy = $state<string | null>(null);
	const unpaidTotal = $derived(data.unpaid.reduce((a, s) => a + s.totalMinor, 0));
	const pending = $derived(data.requests.filter((r) => r.status === 'pending'));
	const low = $derived(!!data.account && data.account.availableMinor < unpaidTotal);
	const presets = [50000, 100000, 200000, 500000];


	const submit = (name: string) => () => {
		busy = name;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = null;
			const d = result.data as { success?: string; redirect?: string } | undefined;
			if (d?.redirect) location.href = d.redirect;
			else if (result.type === 'success' && d?.success) {
				toast.success(d.success);
				if (name === 'topup') amount = '';
			}
		};
	};
</script>

<svelte:head><title>Wallet · {data.dz.name}</title></svelte:head>

<PageHeader title="{data.dz.name} wallet" back={{ href: '/app/wallet', label: 'Wallet' }} />

{#if notice}
	{@const ok = notice.status === 'succeeded'}
	{@const wait = notice.status === 'pending'}
	<div class={cn('mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm', ok ? 'border-success/30 bg-success/5' : wait ? 'border-primary/30 bg-primary/5' : 'border-warning/30 bg-warning/10')} data-testid="payment-notice" data-status={notice.status} role="status">
		<JIcon name={ok ? 'checkCircle' : wait ? 'clock' : 'alert'} class={cn('mt-0.5 size-5 shrink-0', ok ? 'text-success' : wait ? 'text-primary' : 'text-warning')} />
		<p class="min-w-0 flex-1">
			{#if ok}<span class="font-medium">{formatMoney(notice.amountMinor, notice.currency)} added to your wallet</span> <span class="text-muted">· paid via {notice.provider}</span>
			{:else if wait}<span class="font-medium">Payment processing</span> <span class="text-muted">· waiting for {notice.provider} to confirm. <a href={page.url.href} class="font-medium text-primary hover:underline">Refresh</a></span>
			{:else}<span class="font-medium">Top-up not completed</span> <span class="text-muted">· no money was taken.</span>{/if}
		</p>
	</div>
{/if}

{#if !data.dz.walletEnabled}
	<FormAlert tone="info" class="mb-6" message="{data.dz.name} doesn’t use wallets. Please pay for your jumps at manifest." />
{/if}

<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
	<div class="space-y-4 lg:col-span-2">
		<div class="relative overflow-hidden rounded-3xl border border-primary/25 bg-linear-to-br from-primary/20 via-surface to-surface p-6" data-testid="wallet-balance">
			<div class="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/20 blur-3xl"></div>
			<p class="relative text-xs font-medium tracking-wider text-primary uppercase">Available</p>
			<p class="relative mt-1 text-4xl font-semibold tracking-tight tabular-nums {data.account && data.account.availableMinor < 0 ? 'text-danger' : ''}">{money(data.account?.availableMinor ?? 0)}</p>
			<div class="relative mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
				<span><span class="font-medium text-fg tabular-nums">{money(data.account?.pendingMinor ?? 0)}</span> reserved</span>
				{#if data.account?.updatedAt}<span>Updated {relativeTime(data.account.updatedAt)}</span>{/if}
			</div>
			{#if low}
				<p class="relative mt-4 flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning"><JIcon name="alert" class="size-4" /> Low balance — you owe {money(unpaidTotal)}</p>
			{/if}
		</div>

		{#if data.dz.walletEnabled}
			<Card title="Add funds" description="Top up your {data.dz.name} wallet." id="topup">
				<form method="POST" action="?/topup" class="space-y-4" use:enhance={submit('topup')} data-testid="topup-form">
					<div>
						<label for="amount" class="text-sm font-medium">Amount ({cur})</label>
						<input id="amount" name="amount" bind:value={amount} inputmode="decimal" placeholder="0.00" required class="mt-1.5 h-14 w-full rounded-xl border border-border bg-surface px-4 text-2xl font-semibold tabular-nums outline-none hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15" />
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each presets as p (p)}
								<button type="button" class="h-8 rounded-lg border border-border px-3 text-sm text-muted hover:border-border-strong hover:text-fg" onclick={() => (amount = String(p / 100))}>{money(p)}</button>
							{/each}
						</div>
					</div>
					<fieldset class="min-w-0 space-y-2">
						<legend class="mb-1.5 text-sm font-medium">Pay with</legend>
						{#each data.providers as p (p.id)}
							<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border-strong has-checked:border-primary/50 has-checked:bg-primary/5">
								<input type="radio" name="provider" value={p.id} bind:group={provider} class="mt-1 accent-[var(--dz-primary)]" data-testid="topup-provider-{p.id}" />
								<span class="min-w-0 flex-1 text-sm">
									<span class="block font-medium">{p.id === 'manual' ? p.label : `Pay online with ${p.label}`}</span>
									<span class="block text-muted">{p.description}</span>
								</span>
							</label>
						{/each}
					</fieldset>
					<FormAlert message={f?.action === 'topup' ? f.message : null} />
					<Button type="submit" size="lg" class="w-full" loading={busy === 'topup'} data-testid="topup-submit">{#if online}Continue to {providerLabel} <Icon name="arrowRight" class="size-5" />{:else}<Icon name="plus" class="size-5" /> Request top-up{/if}</Button>
				</form>
			</Card>
		{/if}

		{#if pending.length}
			<Card title={pending.every((r) => r.provider === 'manual') ? 'Waiting for manifest' : 'Pending top-ups'} padded={false}>
				<ul class="divide-y divide-border" data-testid="pending-topups">
					{#each pending as r (r.id)}
						<li class="flex items-center justify-between gap-3 px-5 py-3 text-sm">
							<span>
								<span class="block font-medium tabular-nums">{formatMoney(r.amountMinor, r.currency)}</span>
								<span class="text-muted">Requested {relativeTime(r.createdAt)} · {r.provider === 'manual' ? 'pay at manifest' : `waiting for ${r.providerLabel}`}</span>
							</span>
							<form method="POST" action="?/cancel" use:enhance={submit('cancel')}>
								<input type="hidden" name="paymentId" value={r.id} />
								<Button type="submit" variant="ghost" size="sm">Cancel</Button>
							</form>
						</li>
					{/each}
				</ul>
			</Card>
		{/if}
	</div>

	<div class="lg:col-span-3">
		<Tabs bind:value={tab} tabs={[{ id: 'unpaid', label: 'Unpaid', count: data.unpaid.length }, { id: 'paid', label: 'Paid', count: data.paid.length }, { id: 'history', label: 'History' }]}>
			{#snippet children(active)}
				{#if active === 'unpaid'}
					{#if data.unpaid.length === 0}
						<EmptyState title="All paid up" description="Congratulations. All jumps at {data.dz.name} have been paid.">
							{#snippet icon()}<Icon name="check" class="size-6" />{/snippet}
						</EmptyState>
					{:else}
						<form method="POST" action="?/pay" use:enhance={(e) => { if (!confirm(`Are you sure you want to pay ${money(unpaidTotal)} from your wallet?`)) return e.cancel(); return submit('pay')(); }}>
							<ul class="space-y-2.5">
								{#each data.unpaid as s (s.id)}
									<li class="rounded-2xl border border-border bg-surface p-4">
										<input type="hidden" name="slotIds" value={s.id} />
										<div class="flex items-start justify-between gap-3">
											<div>
												<p class="font-medium">Load {s.loadNumber} · {s.title}</p>
												<p class="text-sm text-muted">{fmtDate(s.day)}{s.held ? ' · reserved in wallet' : ''}</p>
											</div>
											<p class="font-semibold tabular-nums">{formatMoney(s.totalMinor, s.currency)}</p>
										</div>
										{#if s.lines.length > 1}
											<ul class="mt-2 space-y-0.5 border-t border-border pt-2 text-sm text-muted">
												{#each s.lines as l, i (i)}<li class="flex justify-between"><span>{l.label}</span><span class="tabular-nums">{formatMoney(l.amountMinor, s.currency)}</span></li>{/each}
											</ul>
										{/if}
									</li>
								{/each}
							</ul>
							<FormAlert class="mt-3" message={f?.action === 'pay' ? f.message : null} />
							<div class="mt-4 flex flex-col items-stretch gap-2 rounded-2xl bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
								<p class="text-sm text-muted">Total due <span class="ml-1 text-lg font-semibold text-fg tabular-nums">{money(unpaidTotal)}</span></p>
								{#if data.dz.walletEnabled}
									<Button type="submit" loading={busy === 'pay'} data-testid="pay-wallet"><Icon name="wallet" class="size-4" /> Pay with wallet</Button>
								{:else}
									<p class="text-sm font-medium">Please pay at manifest</p>
								{/if}
							</div>
						</form>
					{/if}
				{:else if active === 'paid'}
					{#if data.paid.length === 0}
						<p class="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">No paid jumps yet.</p>
					{:else}
						<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
							{#each data.paid as s (s.id)}
								<li class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
									<span><span class="block font-medium">Load {s.loadNumber} · {s.title}</span><span class="text-muted">{fmtDate(s.day)}{s.paidVia ? ` · ${s.paidVia}` : ''}</span></span>
									<span class="font-medium tabular-nums">{formatMoney(s.totalMinor, s.currency)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				{:else if data.history.length === 0}
					<p class="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">There have been no transactions at this dropzone.</p>
				{:else}
					<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" data-testid="ledger">
						{#each data.history as e (e.id)}
							{@const into = e.direction === 'in'}
							{@const held = e.direction === 'reserved'}
							<li class="flex items-center gap-3 px-4 py-3 text-sm" data-direction={e.direction}>
								<span class={cn('grid size-9 shrink-0 place-items-center rounded-xl', into ? 'bg-success/10 text-success' : held ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-muted')}>
									<JIcon name={into ? 'arrowDownLeft' : held ? 'clock' : 'arrowUpRight'} class="size-4" />
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium">{e.title}{e.detail ? ` · ${e.detail}` : ''}</span>
									<span class="block truncate text-xs text-muted">{#if held && e.loadNumber != null}Load {e.loadNumber}{e.loadDay ? ` on ${fmtDate(e.loadDay)}` : ''}{:else}{e.loadNumber != null ? `Load ${e.loadNumber} · ` : ''}{fmtDateTime(e.createdAt)}{/if}</span>
								</span>
								<span class="text-right tabular-nums">
									{#if held}
										<span class="block font-medium text-muted">{money(e.amountMinor)}</span>
										<span class="text-xs text-muted">held</span>
									{:else}
										<span class={cn('block font-medium', into && 'text-success')}>{into ? '+' : '−'}{money(e.amountMinor)}</span>
										<span class="text-xs text-muted"><span class="sr-only">Balance </span>{money(e.balanceAfterMinor)}</span>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
					<p class="mt-2 px-1 text-xs text-muted">Right-hand figures are your balance after each entry, including money held for jumps you’re manifested on.</p>
				{/if}
			{/snippet}
		</Tabs>
	</div>
</div>
