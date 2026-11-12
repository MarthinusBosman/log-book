<script lang="ts">
	import PasaMark from '#lib/components/memberships/PasaMark.svelte';
	import { Avatar, Badge, Button, Icon, Stat } from '#lib/ui/index.ts';
	import { formatMoneyShort } from '#lib/components/staffadmin/money.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import SearchBox from '#lib/components/staffadmin/SearchBox.svelte';
	import SortTh from '#lib/components/staffadmin/SortTh.svelte';
	import { Sorter } from '#lib/components/staffadmin/sorter.svelte.ts';
	import { ROLE_LABELS, formatMoney } from '#lib/domain/constants.ts';
	import { cn } from '#lib/ui/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	type Row = (typeof data.jumpers)[number];
	type Filter = '' | 'checked_in' | 'membership' | 'waiver' | 'negative' | 'staff';

	// svelte-ignore state_referenced_locally
	let q = $state(data.q);
	let filter = $state<Filter>('');
	const sorter = new Sorter<'name' | 'licence' | 'membership' | 'balance'>('name');
	const money = (m: number) => formatMoney(m, data.currency);

	const membershipBad = (r: Row) => r.membership.status === 'expired' || r.membership.status === 'none';
	const tests: Record<Exclude<Filter, ''>, (r: Row) => boolean> = {
		checked_in: (r) => r.checkedIn,
		membership: (r) => r.membership.status !== 'valid',
		waiver: (r) => r.waiver === 'missing',
		negative: (r) => r.availableMinor < 0,
		staff: (r) => r.isStaff
	};
	const filtered = $derived.by(() => {
		const t = q.trim().toLowerCase();
		const rows = data.jumpers.filter((r) => {
			if (t && ![r.name, r.email, r.licence, r.associationNumber].some((v) => v?.toLowerCase().includes(t))) return false;
			return !filter || tests[filter](r);
		});
		return sorter.sort(rows, {
			name: (r) => r.name,
			licence: (r) => r.licence,
			membership: (r) => r.membership.daysLeft ?? -1e9,
			balance: (r) => r.availableMinor
		});
	});
	const count = (f: Exclude<Filter, ''>) => data.jumpers.filter(tests[f]).length;
	const chips = $derived(
		[
			{ id: '' as Filter, label: 'All', n: data.jumpers.length },
			{ id: 'checked_in' as Filter, label: 'Checked in', n: count('checked_in') },
			{ id: 'membership' as Filter, label: 'Membership issue', n: count('membership') },
			...(data.waiverRequired ? [{ id: 'waiver' as Filter, label: 'No waiver', n: count('waiver') }] : []),
			...(data.walletEnabled ? [{ id: 'negative' as Filter, label: 'Negative balance', n: count('negative') }] : []),
			{ id: 'staff' as Filter, label: 'Staff', n: count('staff') }
		].filter((c) => c.id === '' || c.n > 0 || c.id === filter)
	);
	const totalBalance = $derived(data.jumpers.reduce((a, r) => a + r.availableMinor, 0));
	const memTone = { valid: 'success', expiring: 'warning', expired: 'danger', none: 'neutral' } as const;
	const memText = (r: Row) =>
		r.membership.status === 'none'
			? 'None on file'
			: r.membership.status === 'expired'
				? `Expired ${r.membership.expiry}`
				: r.membership.status === 'expiring'
					? `${r.membership.daysLeft}d left`
					: `To ${r.membership.expiry}`;
</script>

<svelte:head><title>Jumpers</title></svelte:head>

<PageHeader icon="users" title="Jumpers" description="Members, currency, waivers and wallet balances.">
	{#snippet actions()}
		<Button href="/app/jumpers/export" variant="secondary" data-sveltekit-reload><Icon name="arrowRight" class="size-4 rotate-90" /> CSV</Button>
	{/snippet}
</PageHeader>

<div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Stat label="Members" value={data.jumpers.length} hint="{count('staff')} staff" />
	<Stat label="Checked in" value={count('checked_in')} hint="right now" />
	<Stat label="Membership" value={count('membership')} hint="expired, expiring or missing" />
	{#if data.walletEnabled}
		<Stat label="Wallets" value={formatMoneyShort(totalBalance, data.currency)} hint="{count('negative')} negative" />
	{:else}
		<Stat label="Waivers" value={data.waiverRequired ? count('waiver') : '—'} hint={data.waiverRequired ? 'missing' : 'not required'} />
	{/if}
</div>

<form method="GET" class="mt-6" onsubmit={(e) => e.preventDefault()}>
	<SearchBox bind:value={q} name="q" placeholder="Search name, email, licence or association no." />
</form>
<div class="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
	{#each chips as c (c.id)}
		<button
			type="button"
			onclick={() => (filter = c.id)}
			aria-pressed={filter === c.id}
			class={cn(
				'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
				filter === c.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:text-fg'
			)}
		>
			{c.label}<span class="font-normal tabular-nums">{c.n}</span>
		</button>
	{/each}
</div>

<div class="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-border bg-surface-2/60">
				<SortTh {sorter} key="name" label="Jumper" class="pl-4" />
				<SortTh {sorter} key="licence" label="Licence" class="hidden md:table-cell" />
				<SortTh {sorter} key="membership" label="Membership" class="hidden sm:table-cell" />
				{#if data.waiverRequired}<th class="hidden px-3 py-2.5 text-left text-xs font-medium tracking-wide text-muted uppercase lg:table-cell">Waiver</th>{/if}
				<SortTh {sorter} key="balance" label="Balance" align="right" class="pr-4" />
			</tr>
		</thead>
		<tbody>
			{#each filtered as r (r.userId)}
				<tr class="group border-b border-border/70 last:border-0 hover:bg-surface-2/40">
					<td class="py-2.5 pr-3 pl-4">
						<a href="/app/jumpers/{r.userId}" class="flex items-center gap-3">
							<span class="relative">
								<Avatar name={r.name} src={r.avatar} size="sm" />
								{#if r.checkedIn}<span class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-success" title="Checked in"></span>{/if}
							</span>
							<span class="min-w-0">
								<span class="block truncate font-medium group-hover:text-primary">{r.name}</span>
								<span class="block truncate text-xs text-muted">
									{#if r.isStaff}{r.roles.filter((x) => x !== 'jumper').map((x) => ROLE_LABELS[x]).join(', ')}{:else}{r.email}{/if}
								</span>
								<span class="mt-1 flex gap-1 sm:hidden">
									<Badge tone={memTone[r.membership.status]} class="!px-2 !text-[11px]">{memText(r)}</Badge><PasaMark state={data.pasaStates[r.userId]} />
									{#if r.waiver === 'missing'}<Badge tone="warning" class="!px-2 !text-[11px]">No waiver</Badge>{/if}
								</span>
							</span>
						</a>
					</td>
					<td class="hidden px-3 py-2.5 md:table-cell">
						<span class="font-medium">{r.licence ?? '—'}</span>
						{#if r.associationNumber}<span class="block text-xs text-muted">{r.association?.toUpperCase()} {r.associationNumber}</span>{/if}
					</td>
					<td class="hidden px-3 py-2.5 sm:table-cell">
						<Badge tone={memTone[r.membership.status]} dot={membershipBad(r) || r.membership.status === 'expiring'}>{memText(r)}</Badge>
						<PasaMark state={data.pasaStates[r.userId]} />
					</td>
					{#if data.waiverRequired}
						<td class="hidden px-3 py-2.5 lg:table-cell">
							{#if r.waiver === 'signed'}<Badge tone="success">Signed</Badge>{:else}<Badge tone="warning" dot>Missing</Badge>{/if}
						</td>
					{/if}
					<td class="py-2.5 pr-4 pl-3 text-right font-medium tabular-nums {r.availableMinor < 0 ? 'text-danger' : r.availableMinor === 0 ? 'text-subtle' : ''}">
						{money(r.availableMinor)}
						{#if r.pendingMinor}<span class="block text-xs font-normal text-muted">{money(r.pendingMinor)} held</span>{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="5" class="px-4 py-12 text-center text-muted">No jumpers match{q ? ` “${q}”` : ''}.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="mt-3 text-xs text-subtle">{filtered.length} of {data.jumpers.length} members</p>
