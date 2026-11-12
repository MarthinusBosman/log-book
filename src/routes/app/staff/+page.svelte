<script lang="ts">
	import { Avatar, Badge, Button, Icon, Stat } from '#lib/ui/index.ts';
	import { formatMoneyShort } from '#lib/components/staffadmin/money.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import DateRange from '#lib/components/staffadmin/DateRange.svelte';
	import RoleChips from '#lib/components/staffadmin/RoleChips.svelte';
	import SearchBox from '#lib/components/staffadmin/SearchBox.svelte';
	import SortTh from '#lib/components/staffadmin/SortTh.svelte';
	import { Sorter } from '#lib/components/staffadmin/sorter.svelte.ts';
	import { ROLE_LABELS, STAFF_ROLES, formatMoney, type DropzoneRole } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	type Row = (typeof data.staff)[number];

	let q = $state('');
	let role = $state<'' | DropzoneRole>('');
	const sorter = new Sorter<'name' | 'jumps' | 'loads' | 'earned' | 'owed'>('name');
	const money = (m: number) => formatMoney(m, data.currency);

	const filtered = $derived(
		sorter.sort(
			data.staff.filter((s) => {
				const t = q.trim().toLowerCase();
				if (t && !`${s.name} ${s.email} ${s.licence ?? ''}`.toLowerCase().includes(t)) return false;
				return !role || s.roles.some((r) => r.role === role);
			}),
			{ name: (r) => r.name, jumps: (r) => r.jumps, loads: (r) => r.loadsFlown, earned: (r) => r.earnedMinor, owed: (r) => r.owedMinor }
		)
	);
	const totals = $derived(
		filtered.reduce((a, s) => ({ jumps: a.jumps + s.jumps, loads: a.loads + s.loadsFlown, earned: a.earned + s.earnedMinor, owed: a.owed + s.owedMinor }), {
			jumps: 0,
			loads: 0,
			earned: 0,
			owed: 0
		})
	);
	const rolesPresent = $derived(STAFF_ROLES.filter((r) => data.staff.some((s) => s.roles.some((x) => x.role === r))));
	const expiring = (s: Row) => s.ratings.filter((r) => r.status === 'overdue' || r.status === 'due_soon').length + (s.membership.status === 'expired' || s.membership.status === 'expiring' ? 1 : 0);
	const alerts = $derived(data.staff.filter((s) => expiring(s) > 0).length);
</script>

<svelte:head><title>Staff</title></svelte:head>

<PageHeader icon="staff" title="Staff" description="Roles, ratings, jumps worked and pay over a period.">
	{#snippet actions()}
		{#if data.canManage}<Button href="/app/settings/members" variant="secondary"><Icon name="users" class="size-4" /> Manage roles</Button>{/if}
	{/snippet}
</PageHeader>

<DateRange class="mt-6" from={data.from} to={data.to} today={data.today} />

<div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Stat label="Staff jumps" value={totals.jumps} hint="{totals.loads} loads flown" />
	<Stat label="Earned" value={formatMoneyShort(totals.earned, data.currency)} hint="Completed loads" />
	<Stat label={data.staffPayToWallet ? 'Still owed' : 'Owed'} value={formatMoneyShort(totals.owed, data.currency)} hint={data.staffPayToWallet ? 'After wallet credits' : 'Not paid via wallet'} />
	<Stat label="Credentials" value={alerts} hint={alerts === 1 ? 'person needs attention' : 'people need attention'} />
</div>

<div class="mt-6 flex flex-col gap-3 sm:flex-row">
	<SearchBox bind:value={q} placeholder="Search staff" class="flex-1" />
	<select bind:value={role} aria-label="Filter by role" class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary">
		<option value="">All roles</option>
		{#each rolesPresent as r (r)}<option value={r}>{ROLE_LABELS[r]}</option>{/each}
	</select>
</div>

<div class="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface">
	<table class="w-full min-w-[56rem] text-sm">
		<thead>
			<tr class="border-b border-border bg-surface-2/60">
				<SortTh {sorter} key="name" label="Staff member" class="pl-4" />
				<th class="px-3 py-2.5 text-left text-xs font-medium tracking-wide text-muted uppercase">Ratings & membership</th>
				<SortTh {sorter} key="jumps" label="Jumps" align="right" />
				<SortTh {sorter} key="loads" label="Loads" align="right" />
				<SortTh {sorter} key="earned" label="Earned" align="right" />
				<th class="px-3 py-2.5 text-right text-xs font-medium tracking-wide text-muted uppercase">To wallet</th>
				<SortTh {sorter} key="owed" label="Owed" align="right" class="pr-4" />
			</tr>
		</thead>
		<tbody>
			{#each filtered as s (s.userId)}
				<tr class="border-b border-border/70 align-top last:border-0 hover:bg-surface-2/40">
					<td class="py-3 pr-3 pl-4">
						<div class="flex items-start gap-3">
							<Avatar name={s.name} src={s.avatar} size="sm" />
							<div class="min-w-0">
								<p class="font-medium">{s.name}</p>
								<p class="text-xs text-muted">{s.licence ?? 'No licence'}</p>
								<RoleChips roles={s.roles} class="mt-1.5" />
							</div>
						</div>
					</td>
					<td class="px-3 py-3">
						<div class="flex max-w-xs flex-wrap gap-1">
							{#each s.ratings as r (r.body + r.rating)}
								<Badge
									tone={r.status === 'overdue' ? 'danger' : r.status === 'due_soon' ? 'warning' : 'neutral'}
									class="!text-[11px]"
								>
									{r.rating}{#if r.expiresOn}<span class="opacity-70">· {r.status === 'overdue' ? 'expired' : r.expiresOn}</span>{/if}
									{#if r.verified}<Icon name="check" class="size-3" strokeWidth={2.5} />{/if}
								</Badge>
							{:else}
								<span class="text-xs text-subtle">No ratings</span>
							{/each}
						</div>
						<p class="mt-1.5 text-xs {s.membership.status === 'expired' ? 'text-danger' : s.membership.status === 'expiring' ? 'text-warning' : 'text-muted'}">
							{#if s.membership.status === 'none'}No membership on file{:else if s.membership.status === 'expired'}Membership expired {s.membership.expiry}{:else}Membership to {s.membership.expiry}{/if}
						</p>
					</td>
					<td class="px-3 py-3 text-right tabular-nums">{s.jumps || '—'}</td>
					<td class="px-3 py-3 text-right tabular-nums">{s.loadsFlown || '—'}</td>
					<td class="px-3 py-3 text-right font-medium tabular-nums">{s.earnedMinor ? money(s.earnedMinor) : '—'}</td>
					<td class="px-3 py-3 text-right text-muted tabular-nums">{s.paidToWalletMinor ? money(s.paidToWalletMinor) : '—'}</td>
					<td class="py-3 pr-4 pl-3 text-right font-semibold tabular-nums {s.owedMinor ? 'text-fg' : 'text-subtle'}">{s.owedMinor ? money(s.owedMinor) : '—'}</td>
				</tr>
			{:else}
				<tr><td colspan="7" class="px-4 py-12 text-center text-muted">No staff match. {#if data.canManage}<a href="/app/settings/members" class="text-primary underline underline-offset-2">Add staff roles</a>{/if}</td></tr>
			{/each}
		</tbody>
		{#if filtered.length > 1}
			<tfoot>
				<tr class="border-t border-border bg-surface-2/40 font-medium">
					<td class="py-2.5 pl-4" colspan="2">Total · {filtered.length} people</td>
					<td class="px-3 py-2.5 text-right tabular-nums">{totals.jumps}</td>
					<td class="px-3 py-2.5 text-right tabular-nums">{totals.loads}</td>
					<td class="px-3 py-2.5 text-right tabular-nums">{money(totals.earned)}</td>
					<td></td>
					<td class="py-2.5 pr-4 text-right tabular-nums">{money(totals.owed)}</td>
				</tr>
			</tfoot>
		{/if}
	</table>
</div>
<p class="mt-3 text-xs text-subtle">
	Pay comes from the staff rates on the <a href="/app/pricelist" class="text-primary underline underline-offset-2">price list</a> and counts completed loads only.
</p>
