<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Card, Icon, cn, toast } from '#lib/ui/index.ts';
	import { ROLE_LABELS, formatMoney } from '#lib/domain/constants.ts';
	import PageHeader from '#lib/components/jumper/PageHeader.svelte';
	import JIcon from '#lib/components/jumper/JIcon.svelte';
	import { WEEKDAYS, WEEKDAY_LABELS, openToday, weekdayIn } from '#lib/components/jumper/hours.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const dz = $derived(data.dz);
	const open = $derived(openToday(dz));
	const today = $derived(weekdayIn(Date.now(), dz.timezone));
	const mapHref = $derived(
		dz.lat != null && dz.lng != null
			? `https://www.openstreetmap.org/?mlat=${dz.lat}&mlon=${dz.lng}#map=13/${dz.lat}/${dz.lng}`
			: dz.address
				? `https://www.openstreetmap.org/search?query=${encodeURIComponent(dz.address)}`
				: null
	);
	const quiet = () => async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
		await update();
		const msg = (result.data as { success?: string } | undefined)?.success;
		if (result.type === 'success' && msg) toast.success(msg);
	};
</script>

<svelte:head><title>{dz.name}</title></svelte:head>

<PageHeader title={dz.name} description={dz.address ?? undefined} back={{ href: '/app/dropzones', label: 'Dropzones' }}>
	{#snippet actions()}
		<form method="POST" action="?/favourite" use:enhance={quiet}>
			<input type="hidden" name="favourite" value={String(!data.favourite)} />
			<Button type="submit" variant="outline" size="icon" aria-label={data.favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={data.favourite} class={data.favourite ? 'text-warning' : ''}>
				<svg viewBox="0 0 24 24" class="size-4" fill={data.favourite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
			</Button>
		</form>
		<form method="POST" action={data.following ? '?/unfollow' : '?/follow'} use:enhance={quiet}>
			<Button type="submit" variant={data.following ? 'secondary' : 'outline'} data-testid="follow">
				{#if data.following}<Icon name="check" class="size-4" /> Following{:else}<JIcon name="heart" class="size-4" /> Follow{/if}
			</Button>
		</form>
	{/snippet}
</PageHeader>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
	<div class="space-y-4 lg:col-span-2">
		<!-- hero / check-in -->
		<div class="relative overflow-hidden rounded-3xl border border-primary/25 bg-linear-to-br from-primary/15 via-surface to-surface p-5 sm:p-6">
			{#if dz.photo}
				<div class="relative -mx-5 -mt-5 mb-5 sm:-mx-6 sm:-mt-6">
					<img src={dz.photo} alt="{dz.name}" width="1200" height="400" class="h-40 w-full object-cover sm:h-56" decoding="async" data-testid="dz-photo" />
					<div class="absolute inset-0 bg-linear-to-t from-surface via-transparent to-transparent"></div>
				</div>
			{:else}
				<div class="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-primary/20 blur-3xl"></div>
			{/if}
			<div class="relative flex flex-wrap items-center gap-2">
				{#if open}<Badge tone={open.tone} dot>{open.label}</Badge>{/if}
				{#if data.checkedInHere}<Badge tone="success"><Icon name="check" class="size-3.5" /> You’re checked in</Badge>{/if}
				{#each data.roles.filter((r) => r !== 'jumper') as r (r)}<Badge tone="brand">{ROLE_LABELS[r]}</Badge>{/each}
			</div>
			{#if dz.description}<p class="relative mt-4 max-w-prose text-[15px] text-fg/90">{dz.description}</p>{/if}
			<div class="relative mt-5 grid gap-2 sm:flex sm:flex-wrap">
				{#if data.checkedInHere}
					<Button href="/app/check-in" size="md"><Icon name="plane" class="size-4" /> Join a load{data.openLoads ? ` · ${data.openLoads} open` : ''}</Button>
					<form method="POST" action="/app/check-in?/checkout" use:enhance={() => async ({ update }) => { await update(); toast.success('Successfully checked out'); }}>
						<Button type="submit" size="md" variant="secondary" class="w-full"><JIcon name="logOut" class="size-4" /> Check out</Button>
					</form>
				{:else}
					<Button href="/app/check-in?dz={dz.slug}" size="md" data-testid="dz-checkin"><Icon name="checkin" class="size-4" /> Check in now</Button>
				{/if}
				{#if data.needsWaiver}
					<Button href="/app/waivers/sign/{dz.id}" size="md" variant="secondary" data-testid="dz-waiver"><Icon name="waiver" class="size-4" /> Sign waiver</Button>
				{/if}
				<Button href="/dz/{dz.slug}/book" size="md" variant="outline"><Icon name="tandem" class="size-4" /> Book a tandem</Button>
			</div>
			{#if data.needsWaiver}
				<p class="relative mt-3 text-sm text-warning">{dz.name} needs your signed waiver before you can join a load.</p>
			{/if}
			{#if data.checkedInElsewhere}
				<p class="relative mt-3 text-sm text-muted">You’re checked in at {data.checkedInElsewhere}. Checking in here checks you out there.</p>
			{/if}
		</div>

		<Card title="Opening times">
			<div class="grid grid-cols-7 gap-1.5">
				{#each WEEKDAYS as d (d)}
					{@const on = dz.openDays.includes(d)}
					<div
						class={cn(
							'flex flex-col items-center rounded-xl border py-2 text-xs font-medium',
							on ? 'border-primary/30 bg-primary/10 text-fg' : 'border-border bg-surface-2/40 text-subtle',
							d === today && 'ring-2 ring-primary/50'
						)}
					>
						{WEEKDAY_LABELS[d]}
						<span class={cn('mt-1 size-1.5 rounded-full', on ? 'bg-primary' : 'bg-border-strong')}></span>
					</div>
				{/each}
			</div>
			<p class="mt-4 flex items-center gap-2 text-sm text-muted">
				<JIcon name="clock" class="size-4" />
				{#if dz.openDays.length === 0}Opening days not published yet{:else if dz.openTime && dz.closeTime}{dz.openTime} – {dz.closeTime} <span class="text-subtle">({dz.timezone})</span>{:else}Times not published{/if}
			</p>
		</Card>

		<Card title="Team & aircraft">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<p class="text-xs font-medium tracking-wider text-muted uppercase">Staff</p>
					{#if data.staffCounts.length}
						<ul class="mt-2 space-y-1.5 text-sm">
							{#each data.staffCounts as s (s.role)}
								<li class="flex justify-between"><span class="text-muted">{ROLE_LABELS[s.role]}</span><span class="font-medium tabular-nums">{s.count}</span></li>
							{/each}
						</ul>
					{:else}<p class="mt-2 text-sm text-muted">No staff listed.</p>{/if}
					<p class="mt-3 text-sm text-muted"><span class="font-medium text-fg tabular-nums">{data.jumpers}</span> jumpers</p>
				</div>
				<div>
					<p class="text-xs font-medium tracking-wider text-muted uppercase">Aircraft</p>
					{#if data.aircraft.length}
						<ul class="mt-2 space-y-1.5 text-sm">
							{#each data.aircraft as a (a.id)}
								<li class="flex justify-between"><span>{a.name}</span><span class="text-muted tabular-nums">{a.capacity} seats</span></li>
							{/each}
						</ul>
					{:else}<p class="mt-2 text-sm text-muted">No aircraft listed.</p>{/if}
				</div>
			</div>
		</Card>
	</div>

	<aside class="space-y-4">
		<Card title="Contact">
			<ul class="space-y-3 text-sm">
				{#if dz.address}
					<li class="flex items-start gap-3">
						<JIcon name="mapPin" class="mt-0.5 size-4 text-muted" />
						<span class="min-w-0 flex-1">{dz.address}{#if mapHref}<br /><a href={mapHref} target="_blank" rel="noopener" class="font-medium text-primary hover:underline">Open map</a>{/if}</span>
					</li>
				{/if}
				{#if dz.contactPhone}
					<li class="flex items-center gap-3"><JIcon name="phone" class="size-4 text-muted" /><a href="tel:{dz.contactPhone}" class="font-medium hover:underline">{dz.contactPhone}</a></li>
				{/if}
				{#if dz.contactEmail}
					<li class="flex items-center gap-3"><JIcon name="mail" class="size-4 text-muted" /><a href="mailto:{dz.contactEmail}?subject=Skydive%20Inquiry" class="truncate font-medium hover:underline">{dz.contactEmail}</a></li>
				{/if}
				{#if dz.website}
					<li class="flex items-center gap-3"><JIcon name="external" class="size-4 text-muted" /><a href={dz.website} target="_blank" rel="noopener" class="truncate font-medium hover:underline">{dz.website.replace(/^https?:\/\//, '')}</a></li>
				{/if}
				{#if !dz.address && !dz.contactPhone && !dz.contactEmail && !dz.website}<li class="text-muted">No contact details published.</li>{/if}
			</ul>
			{#if dz.contactPhone || dz.contactEmail}
				<div class="mt-4 grid grid-cols-2 gap-2">
					{#if dz.contactPhone}<Button href="tel:{dz.contactPhone}" variant="secondary" size="sm"><JIcon name="phone" class="size-4" /> Call</Button>{/if}
					{#if dz.contactEmail}<Button href="mailto:{dz.contactEmail}?subject=Skydive%20Inquiry" variant="secondary" size="sm"><JIcon name="mail" class="size-4" /> Email</Button>{/if}
				</div>
			{/if}
		</Card>
		{#if dz.walletEnabled}
			<a href="/app/wallet/{dz.slug}" class="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
				<span class="flex items-center gap-3">
					<span class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="wallet" class="size-4" /></span>
					<span>
						<span class="block text-xs text-muted">Your wallet here</span>
						<span class="block font-semibold tabular-nums">{formatMoney(data.wallet?.availableMinor ?? 0, data.wallet?.currency ?? dz.currency)}</span>
					</span>
				</span>
				<JIcon name="chevronRight" class="size-4 text-muted" />
			</a>
		{/if}
	</aside>
</div>
