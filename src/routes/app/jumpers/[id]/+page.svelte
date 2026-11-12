<script lang="ts">
	import { enhance } from '$app/forms';
	import { Avatar, Badge, Button, Card, Icon, Input, Select } from '#lib/ui/index.ts';
	import MoneyField from '#lib/components/staffadmin/MoneyField.svelte';
	import { currencySymbol } from '#lib/components/staffadmin/money.ts';
	import { toastEnhance } from '#lib/components/staffadmin/enhance.ts';
	import {
		ASSOCIATION_LABELS,
		JUMP_TYPE_LABELS,
		LEDGER_TYPE_LABELS,
		ROLE_LABELS,
		SLOT_STAFF_ROLE_LABELS,
		formatMoney,
		type Association,
		type JumpType,
		type SlotStaffRole
	} from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/index.ts';
	import StaffPasaPanel from '#lib/components/memberships/StaffPasaPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const money = (m: number) => formatMoney(m, data.currency);
	const symbol = $derived(currencySymbol(data.currency));

	let kind = $state<'topup' | 'adjust' | 'refund'>('topup');
	let pending = $state(false);
	let amount = $state('');
	const kinds = [
		{ id: 'topup', label: 'Add funds', hint: 'Cash, card or EFT received at manifest.' },
		{ id: 'adjust', label: 'Adjust', hint: 'Credit or correction. Use a minus sign to debit.' },
		{ id: 'refund', label: 'Refund', hint: 'Money returned to the wallet, e.g. a cancelled jump.' }
	] as const;

	const memTone = { valid: 'success', expiring: 'warning', expired: 'danger', none: 'neutral' } as const;
	const fmtTime = (d: Date | string) =>
		new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	const signed = (type: string, amountMinor: number) => (type === 'charge' || type === 'hold' ? -Math.abs(amountMinor) : type === 'hold_release' ? Math.abs(amountMinor) : amountMinor);
	const assoc = $derived(data.user.association ? (ASSOCIATION_LABELS[data.user.association as Association] ?? data.user.association) : null);
</script>

<svelte:head><title>{data.user.name} · Jumpers</title></svelte:head>

<a href="/app/jumpers" class="inline-flex items-center gap-1 text-sm text-muted hover:text-fg print:hidden">
	<Icon name="arrowRight" class="size-4 rotate-180" /> Jumpers
</a>

<div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
	<div class="flex min-w-0 items-center gap-4">
		<Avatar name={data.user.name} src={data.user.avatar} size="lg" />
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold tracking-tight">{data.user.name}</h1>
			<p class="truncate text-sm text-muted">{data.user.email}{data.user.phone ? ` · ${data.user.phone}` : ''}</p>
			<div class="mt-2 flex flex-wrap gap-1">
				{#each data.roles as r (r)}<Badge tone={r === 'jumper' ? 'neutral' : 'brand'}>{ROLE_LABELS[r]}</Badge>{/each}
				{#if data.status !== 'active'}<Badge tone="warning">{data.status}</Badge>{/if}
			</div>
		</div>
	</div>
	{#if data.walletEnabled}
		<div class="rounded-2xl border border-border bg-surface px-5 py-3 sm:text-right">
			<p class="text-xs font-medium tracking-wide text-muted uppercase">Wallet</p>
			<p class="text-2xl font-semibold tabular-nums {(data.account?.availableMinor ?? 0) < 0 ? 'text-danger' : ''}">{money(data.account?.availableMinor ?? 0)}</p>
			{#if data.account?.pendingMinor}<p class="text-xs text-muted">{money(data.account.pendingMinor)} held for jumps</p>{/if}
		</div>
	{/if}
</div>

<div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
	<Card class="min-w-0 lg:col-span-1">
		<h2 class="text-sm font-semibold">Credentials</h2>
		<dl class="mt-3 space-y-2.5 text-sm">
			<div class="flex justify-between gap-3"><dt class="text-muted">Licence</dt><dd class="font-medium">{data.user.licence ?? '—'}</dd></div>
			<div class="flex justify-between gap-3">
				<dt class="text-muted">Association</dt>
				<dd class="text-right">{assoc ?? '—'}{#if data.user.associationNumber}<span class="block text-xs text-muted">{data.user.associationNumber}</span>{/if}</dd>
			</div>
			<div class="flex items-center justify-between gap-3">
				<dt class="text-muted">Membership</dt>
				<dd>
					<Badge tone={memTone[data.membership.status]} dot={data.membership.status !== 'valid'}>
						{data.membership.status === 'none' ? 'None on file' : data.membership.status === 'expired' ? `Expired ${data.membership.expiry}` : `To ${data.membership.expiry}`}
					</Badge>
				</dd>
			</div>
			{#if data.waiverRequired}
				<div class="flex items-center justify-between gap-3">
					<dt class="text-muted">Waiver</dt>
					<dd>
						{#if data.waiverSignedAt}<Badge tone="success">Signed {new Date(data.waiverSignedAt).toLocaleDateString('en-ZA')}</Badge>{:else}<Badge tone="warning" dot>Not signed</Badge>{/if}
					</dd>
				</div>
			{/if}
			<div class="flex justify-between gap-3"><dt class="text-muted">Declared jumps</dt><dd class="tabular-nums">{data.user.declaredJumpCount ?? '—'}</dd></div>
			<div class="flex justify-between gap-3">
				<dt class="text-muted">Weight</dt>
				<dd class="tabular-nums">{data.user.weightKg ? `${data.user.weightKg} kg` : '—'}{data.user.loadingWeightKg ? ` · exit ${data.user.loadingWeightKg} kg` : ''}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt class="text-muted">Emergency</dt>
				<dd class="text-right">{data.user.emergencyName ?? '—'}{#if data.user.emergencyPhone}<span class="block text-xs text-muted">{data.user.emergencyPhone}</span>{/if}</dd>
			</div>
		</dl>
		<StaffPasaPanel check={data.pasa} profileName={data.user.name} canReview={data.canReviewPasa} isSelf={data.isSelf} today={data.pasaToday} />
		{#if data.ratings.length}
			<h3 class="mt-5 text-xs font-medium tracking-wide text-muted uppercase">Ratings</h3>
			<div class="mt-2 flex flex-wrap gap-1">
				{#each data.ratings as r (r.body + r.rating)}
					<Badge tone={r.expiresOn && r.expiresOn < new Date().toISOString().slice(0, 10) ? 'danger' : 'neutral'}>
						{r.rating}{#if r.expiresOn}<span class="opacity-70">· {r.expiresOn}</span>{/if}
						{#if r.verified}<Icon name="check" class="size-3" strokeWidth={2.5} />{/if}
					</Badge>
				{/each}
			</div>
		{/if}
	</Card>

	<div class="min-w-0 space-y-4 lg:col-span-2">
		{#if data.canPay && data.walletEnabled}
			<Card>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="text-sm font-semibold">Wallet transaction</h2>
					<div class="inline-flex rounded-xl border border-border bg-surface-2/60 p-1" role="tablist" aria-label="Transaction type">
						{#each kinds as k (k.id)}
							<button
								type="button"
								role="tab"
								aria-selected={kind === k.id}
								onclick={() => (kind = k.id)}
								class={cn('h-8 rounded-lg px-3 text-sm font-medium transition-all', kind === k.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
							>
								{k.label}
							</button>
						{/each}
					</div>
				</div>
				<p class="mt-2 text-sm text-muted">{kinds.find((k) => k.id === kind)?.hint}</p>
				<form
					method="POST"
					action="?/wallet"
					class="mt-4 grid gap-3 sm:grid-cols-[10rem_9rem_1fr_auto] sm:items-end"
					use:enhance={toastEnhance({ pending: (v) => (pending = v), reset: true, onSuccess: () => (amount = '') })}
				>
					<input type="hidden" name="kind" value={kind} />
					<MoneyField name="amount" label="Amount" {symbol} bind:value={amount} allowNegative={kind === 'adjust'} required />
					{#if kind === 'topup'}
						<Select
							label="Paid by"
							name="provider"
							value="cash"
							options={[
								{ value: 'cash', label: 'Cash' },
								{ value: 'card', label: 'Card' },
								{ value: 'eft', label: 'EFT' },
								{ value: 'manual', label: 'Other' }
							]}
						/>
					{:else}
						<div class="hidden sm:block"></div>
					{/if}
					<Input label="Reason" name="reason" required maxlength={200} placeholder={kind === 'topup' ? 'Cash at manifest' : kind === 'refund' ? 'Load 4 cancelled' : 'Account credit'} />
					<Button type="submit" loading={pending}>Record</Button>
				</form>
				{#if !data.allowNegative}<p class="mt-2 text-xs text-subtle">Negative balances are off: debits can't take the wallet below zero.</p>{/if}
			</Card>
		{/if}

		{#if data.walletEnabled}
			<Card padded={false} class="overflow-hidden">
				<h2 class="px-5 pt-5 text-sm font-semibold">Ledger</h2>
				<div class="mt-3 overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-y border-border bg-surface-2/60 text-left text-xs tracking-wide text-muted uppercase">
								<th class="hidden py-2 pr-3 pl-5 font-medium sm:table-cell">When</th>
								<th class="py-2 pr-3 pl-5 font-medium sm:pl-3">Entry</th>
								<th class="hidden px-3 py-2 font-medium sm:table-cell">By</th>
								<th class="py-2 pr-5 pl-3 text-right font-medium sm:pr-3">Amount</th>
								<th class="hidden py-2 pr-5 pl-3 text-right font-medium sm:table-cell">Balance</th>
							</tr>
						</thead>
						<tbody>
							{#each data.ledger as e (e.id)}
								{@const amt = signed(e.type, e.amountMinor)}
								<tr class="border-b border-border/70 last:border-0">
									<td class="hidden py-2.5 pr-3 pl-5 text-xs whitespace-nowrap text-muted tabular-nums sm:table-cell">{fmtTime(e.createdAt)}</td>
									<td class="py-2.5 pr-3 pl-5 sm:pl-3">
										<span class="font-medium">{LEDGER_TYPE_LABELS[e.type]}</span>
										{#if e.provider && e.type === 'topup'}<span class="text-xs text-muted uppercase"> · {e.provider}</span>{/if}
										{#if e.reason}<span class="block text-xs text-muted">{e.reason}</span>{/if}
										<span class="block text-[11px] text-subtle tabular-nums sm:hidden">{fmtTime(e.createdAt)}{e.createdByName ? ` · ${e.createdByName}` : ''}</span>
									</td>
									<td class="hidden px-3 py-2.5 text-xs text-muted sm:table-cell">{e.createdByName ?? 'System'}</td>
									<td class="py-2.5 pr-5 pl-3 text-right font-medium whitespace-nowrap tabular-nums sm:pr-3 {amt < 0 ? 'text-danger' : amt > 0 ? 'text-success' : ''}">
										{amt > 0 ? '+' : ''}{money(amt)}
									</td>
									<td class="hidden py-2.5 pr-5 pl-3 text-right text-muted tabular-nums sm:table-cell">{money(e.availableAfterMinor)}</td>
								</tr>
							{:else}
								<tr><td colspan="5" class="px-5 py-8 text-center text-muted">No wallet activity yet.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}

		<Card padded={false} class="overflow-hidden">
			<h2 class="px-5 pt-5 text-sm font-semibold">Recent jumps here</h2>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-y border-border bg-surface-2/60 text-left text-xs tracking-wide text-muted uppercase">
							<th class="py-2 pr-3 pl-5 font-medium">Day</th>
							<th class="px-3 py-2 font-medium">Load</th>
							<th class="px-3 py-2 font-medium">Jump</th>
							<th class="py-2 pr-5 pl-3 text-right font-medium">Price</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recent as s (s.slotId)}
							<tr class="border-b border-border/70 last:border-0">
								<td class="py-2.5 pr-3 pl-5 whitespace-nowrap tabular-nums">{s.day}</td>
								<td class="px-3 py-2.5">#{s.loadNumber}<span class="text-xs text-muted"> · {s.aircraft ?? '—'}</span></td>
								<td class="px-3 py-2.5">
									{JUMP_TYPE_LABELS[s.jumpType as JumpType] ?? s.jumpType}
									{#if s.staffRole}<Badge tone="brand" class="ml-1 !text-[11px]">{SLOT_STAFF_ROLE_LABELS[s.staffRole as SlotStaffRole] ?? s.staffRole}</Badge>{/if}
								</td>
								<td class="py-2.5 pr-5 pl-3 text-right tabular-nums">
									{s.staffRole ? '—' : money(s.totalMinor)}
									{#if !s.staffRole}<span class="block text-xs {s.paid ? 'text-success' : 'text-warning'}">{s.paid ? `Paid${s.paidVia ? ` · ${s.paidVia}` : ''}` : 'Unpaid'}</span>{/if}
								</td>
							</tr>
						{:else}
							<tr><td colspan="4" class="px-5 py-8 text-center text-muted">No jumps at this dropzone yet.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	</div>
</div>
