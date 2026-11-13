<script lang="ts">
	import { page } from '$app/state';
	import { Button, Card, Icon, Stat } from '#lib/ui/index.ts';
	import { formatMoneyShort } from '#lib/components/staffadmin/money.ts';
	import PageHeader from '#lib/components/staffadmin/PageHeader.svelte';
	import DateRange from '#lib/components/staffadmin/DateRange.svelte';
	import ColumnChart from '#lib/components/staffadmin/charts/ColumnChart.svelte';
	import BarList from '#lib/components/staffadmin/charts/BarList.svelte';
	import { timeSeries } from '#lib/components/staffadmin/series.ts';
	import { SLOT_EXTRA_LABELS, formatMoney, paymentMethodLabel, type SlotExtra } from '#lib/domain/constants.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const money = (m: number) => formatMoney(m, data.currency);
	const compact = (m: number) => {
		const v = m / 100;
		return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
	};
	const csv = (kind: string) => `/app/reports/export?kind=${kind}&from=${data.from}&to=${data.to}`;
	const qs = $derived(`from=${data.from}&to=${data.to}`);

	const t = $derived(data.jumps.totals);
	const jumpsSeries = $derived(timeSeries(data.jumps.perDay, data.from, data.to, (r) => [r.slots], 1));
	const walletSeries = $derived(timeSeries(data.wallet.days, data.from, data.to, (r) => [r.topupMinor, r.chargeMinor], 2));
	const bucketWord = $derived(jumpsSeries.bucket === 'day' ? 'day' : jumpsSeries.bucket);
	const counters = $derived([
		{ label: 'Total loads', v: t.loads },
		{ label: 'Total slots', v: t.slots },
		{ label: 'Tandems', v: t.tandems },
		{ label: 'Sporties', v: t.sporties },
		{ label: 'AFF students', v: t.aff },
		{ label: 'Static line', v: t.staticLine },
		{ label: 'Coach jumps', v: t.coachJumps },
		{ label: 'Gear rental', v: t.gearRental },
		{ label: 'Extra altitude', v: t.extraAltitude },
		{ label: 'Max altitude', v: t.maxAltitude },
		{ label: 'Beach landing', v: t.beachLanding },
		{ label: 'Hand cam', v: t.handcam },
		{ label: 'Outside cam', v: t.outsideVideo },
		{ label: 'Extreme ride', v: t.extremeRide }
	]);
	const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
	const net = $derived(data.wallet.totals.topupMinor - data.wallet.totals.chargeMinor);
</script>

<svelte:head><title>Reports</title></svelte:head>

<PageHeader icon="chart" title="Reports" description="Jumps, revenue, tandems and wallet flows for {data.dzName}.">
	{#snippet actions()}
		<Button href="/app/reports/print?{qs}" variant="secondary" target="_blank"><Icon name="manifest" class="size-4" /> Jump report</Button>
		<Button href="/app/reports/loadsheet?day={data.to}" variant="secondary" target="_blank"><Icon name="plane" class="size-4" /> Load sheet</Button>
	{/snippet}
</PageHeader>

<DateRange class="mt-6" from={data.from} to={data.to} today={data.today} />

<div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Stat label="Loads" value={t.loads} hint="{t.slots} slots" />
	<Stat label="Slot revenue" value={formatMoneyShort(data.revenue.totalMinor, data.currency)} hint="{money(data.revenue.paidMinor)} paid" />
	<Stat label="Tandems" value={t.tandems} hint="{data.tandems.passengers.length} bookings" />
	<Stat label="Staff & pilot pay" value={formatMoneyShort(data.jumps.revenue.staffPayMinor + data.jumps.revenue.pilotPayMinor, data.currency)} hint="completed loads" />
</div>

{#snippet head(title: string, sub: string, kind: string)}
	<div class="flex items-start justify-between gap-3">
		<div>
			<h2 class="text-sm font-semibold">{title}</h2>
			<p class="text-xs text-muted">{sub}</p>
		</div>
		<a href={csv(kind)} data-sveltekit-reload class="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg print:hidden">
			<Icon name="arrowRight" class="size-3.5 rotate-90" /> CSV
		</a>
	</div>
{/snippet}

{#if t.loads === 0 && data.tandems.passengers.length === 0 && data.wallet.days.length === 0}
	<p class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">No loads found in that range. Try a wider date range.</p>
{/if}

<div class="mt-4 grid gap-4 lg:grid-cols-3">
	<Card class="lg:col-span-2">
		{@render head('Jumps per ' + bucketWord, 'Slots on completed loads', 'daily')}
		<ColumnChart class="mt-5" label="Slots per {bucketWord}" points={jumpsSeries.points} series={[{ name: 'Slots', color: 'var(--color-primary)' }]} />
	</Card>
	<Card>
		{@render head('Jump report', 'Counts as in the printed report', 'summary')}
		<dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
			{#each counters as c (c.label)}
				<div class="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1.5">
					<dt class="truncate text-muted">{c.label}</dt>
					<dd class="font-semibold tabular-nums">{c.v}</dd>
				</div>
			{/each}
		</dl>
	</Card>

	<Card>
		{@render head('Per aircraft', 'Loads flown (slots in brackets)', 'aircraft')}
		<BarList
			class="mt-4"
			label="Loads per aircraft"
			rows={data.jumps.perAircraft.map((a) => ({ label: a.aircraft, value: a.loads, sub: `${a.slots} slots` }))}
		/>
	</Card>
	<Card class="lg:col-span-2">
		{@render head('Per staff member', 'Staff slots and earnings on completed loads', 'staff')}
		<BarList
			class="mt-4"
			label="Staff pay"
			color="var(--color-success)"
			format={money}
			rows={data.jumps.perStaff.map((s) => ({ label: s.name, value: s.payMinor, sub: s.slots ? `${s.slots} jump${s.slots === 1 ? '' : 's'}` : 'pilot' }))}
		/>
	</Card>

	<Card class="lg:col-span-2">
		{@render head('Revenue by item', `${money(data.revenue.totalMinor)} billed · ${money(data.revenue.totalMinor - data.revenue.paidMinor)} unpaid`, 'revenue')}
		<BarList
			class="mt-4"
			label="Revenue by price item"
			format={money}
			rows={data.revenue.items.map((i) => ({ label: i.label, value: i.amountMinor, sub: `${i.count}×` }))}
		/>
	</Card>
	<Card>
		{@render head('Tandems', 'Bookings by jump date', 'tandems')}
		<div class="mt-4 grid grid-cols-2 gap-2 text-center">
			<div class="rounded-xl bg-surface-2/60 py-2.5">
				<p class="text-xl font-semibold tabular-nums">{formatMoneyShort(data.tandems.totalMinor, data.currency)}</p>
				<p class="text-[11px] text-muted uppercase">Booked value</p>
			</div>
			<div class="rounded-xl bg-surface-2/60 py-2.5">
				<p class="text-xl font-semibold tabular-nums {data.tandems.outstandingMinor ? 'text-warning' : ''}">{formatMoneyShort(data.tandems.outstandingMinor, data.currency)}</p>
				<p class="text-[11px] text-muted uppercase">Outstanding</p>
			</div>
		</div>
		<BarList
			class="mt-4"
			label="Tandems by status"
			color="var(--color-warning)"
			rows={Object.entries(data.tandems.byStatus).map(([s, n]) => ({ label: statusLabel(s), value: n }))}
			empty="No tandem bookings in this range."
		/>
		{#if Object.keys(data.tandems.extras).length}
			<p class="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Extras</p>
			<div class="mt-2 flex flex-wrap gap-1.5 text-xs">
				{#each Object.entries(data.tandems.extras) as [e, n] (e)}
					<span class="rounded-full border border-border px-2.5 py-0.5">{SLOT_EXTRA_LABELS[e as SlotExtra] ?? e} <b class="tabular-nums">{n}</b></span>
				{/each}
			</div>
		{/if}
		<p class="mt-3 text-xs text-subtle">{data.tandems.online} booked online</p>
	</Card>

	{#if data.walletEnabled || data.wallet.days.length}
		<Card class="lg:col-span-3">
			{@render head('Wallet top-ups vs charges', `Net ${net >= 0 ? '+' : ''}${money(net)} · refunds ${money(data.wallet.totals.refundMinor)} · staff pay ${money(data.wallet.totals.staffPayMinor)}`, 'wallet')}
			<div class="mt-5 grid gap-6 lg:grid-cols-[1fr_16rem]">
				<ColumnChart
					label="Wallet top-ups vs charges per {bucketWord}"
					points={walletSeries.points}
					format={compact}
					series={[
						{ name: 'Top-ups', color: 'var(--color-success)' },
						{ name: 'Jump charges', color: 'var(--color-primary)' }
					]}
				/>
				<div>
					<p class="text-xs font-medium tracking-wide text-muted uppercase">Top-ups by method</p>
					<BarList
						class="mt-3"
						label="Top-ups by method"
						color="var(--color-success)"
						format={money}
						rows={data.wallet.topupsByProvider.map((p) => ({ label: paymentMethodLabel(p.provider), value: p.amountMinor }))}
						empty="No top-ups."
					/>
				</div>
			</div>
		</Card>
	{/if}
</div>
<p class="mt-4 text-xs text-subtle">Jump and revenue figures count completed loads only. Range {data.from} to {data.to}. {page.url.searchParams.size ? '' : 'Default: last 30 days.'}</p>
