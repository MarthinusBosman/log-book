<script lang="ts">
	import { onMount } from 'svelte';
	import { JUMP_TYPE_LABELS, LOAD_STATUS_LABELS, formatMoney, type JumpType } from '#lib/domain/constants.ts';
	import { Badge, Button, Icon, cn } from '#lib/ui/index.ts';
	import type { IconName } from '#lib/ui/Icon.svelte';
	import type { JumperDashboardData } from '#lib/server/jumper/dashboard.ts';
	import JIcon, { type JIconName } from './JIcon.svelte';
	import StatTile from './StatTile.svelte';
	import { DUE_TONES, countdown, dueLabel, fmtDate, fmtFreefall, fmtNumber, fmtTime } from './format.ts';

	let { data }: { data: JumperDashboardData } = $props();

	let now = $state(Date.now());
	onMount(() => {
		now = Date.now();
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	const next = $derived(data.next);
	const callLeft = $derived(next?.load.callDueAt && next.load.status === 'called' ? countdown(next.load.callDueAt, now) : null);
	const schedLeft = $derived(next?.load.scheduledAt && next.load.status !== 'called' ? countdown(next.load.scheduledAt, now) : null);
	const statusTone = (s: string) => (s === 'called' ? 'warning' : s === 'boarding' ? 'danger' : 'brand');

	type Action = { href: string; label: string; hint: string; icon?: IconName; jicon?: JIconName; testid: string };
	const actions: Action[] = $derived([
		data.checkin
			? { href: '/app/check-in', label: 'Join a load', hint: data.joinableLoads ? `${data.joinableLoads} open now` : 'See today’s loads', icon: 'plane', testid: 'qa-join' }
			: { href: '/app/check-in', label: 'Check in', hint: 'Start your jump day', icon: 'checkin', testid: 'qa-checkin' },
		{ href: '/app/logbook/new', label: 'Log a jump', hint: `Next is #${data.totals.totalJumps + 1}`, icon: 'book', testid: 'qa-log' },
		{ href: data.wallet ? `/app/wallet/${data.wallet.dropzone.slug}#topup` : '/app/wallet', label: 'Top up', hint: 'Add funds to your wallet', icon: 'wallet', testid: 'qa-topup' },
		{ href: '/app/my-gear', label: 'My gear', hint: 'Rigs, repacks, AAD', icon: 'parachute', testid: 'qa-gear' },
		{ href: '/app/team', label: 'My teams', hint: 'Manifest together', icon: 'team', testid: 'qa-team' },
		{ href: '/app/dropzones', label: 'Dropzones', hint: 'Find & follow', jicon: 'mapPin', testid: 'qa-dz' }
	]);
</script>

<section class="space-y-4 lg:space-y-6" data-testid="jumper-dashboard">
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
		<!-- Next load hero -->
		<div
			class={cn(
				'relative overflow-hidden rounded-3xl border border-primary/25 bg-linear-to-br from-primary/20 via-surface to-surface p-5 sm:p-6 lg:col-span-3',
				!next && 'lg:flex lg:flex-col lg:justify-center'
			)}
			data-testid="next-load"
		>
			<div class="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-primary/20 blur-3xl"></div>
			{#if next}
				<div class="relative flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-medium tracking-wider text-primary uppercase">Your next load</p>
						<h2 class="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Load {next.load.loadNumber}</h2>
						<p class="mt-1 text-sm text-muted">
							{next.dropzone.name}{next.load.aircraftName ? ` · ${next.load.aircraftName}` : ''}{next.load.day !== data.today
								? ` · ${fmtDate(next.load.day, { year: false })}`
								: ''}
						</p>
					</div>
					<Badge tone={statusTone(next.load.status)} dot>{LOAD_STATUS_LABELS[next.load.status]}</Badge>
				</div>
				<div class="relative mt-6 flex flex-wrap items-end justify-between gap-4">
					<div>
						{#if next.load.status === 'boarding'}
							<p class="text-sm text-muted">Gear up and go</p>
							<p class="text-4xl font-semibold tracking-tight text-danger sm:text-5xl">Boarding</p>
						{:else if callLeft}
							<p class="text-sm text-muted">20 min call · time to gear up</p>
							<p class="font-mono text-5xl font-semibold tracking-tight text-warning tabular-nums sm:text-6xl" data-testid="countdown">{callLeft}</p>
						{:else if schedLeft}
							<p class="text-sm text-muted">Scheduled {fmtTime(next.load.scheduledAt)}</p>
							<p class="font-mono text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl" data-testid="countdown">{schedLeft}</p>
						{:else}
							<p class="text-sm text-muted">Waiting for the call</p>
							<p class="text-3xl font-semibold tracking-tight">Stand by</p>
						{/if}
					</div>
					<div class="text-right text-sm">
						<p class="font-medium">{JUMP_TYPE_LABELS[next.slot.jumpType as JumpType] ?? next.slot.jumpType}</p>
						<p class="text-muted tabular-nums">
							{formatMoney(next.slot.totalMinor, next.slot.currency)}
							{#if next.slot.paid}· paid{/if}
						</p>
					</div>
				</div>
				<div class="relative mt-5 flex flex-wrap gap-2">
					<Button href="/app/check-in" size="md"><Icon name="manifest" class="size-4" /> Manage my loads</Button>
					{#if data.moreUpcoming}<span class="self-center text-sm text-muted">+{data.moreUpcoming} more manifested</span>{/if}
				</div>
			{:else}
				<div class="relative">
					<p class="text-xs font-medium tracking-wider text-primary uppercase">Next load</p>
					<h2 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
						{data.checkin ? 'You’re not on a load yet' : 'Ready to jump?'}
					</h2>
					<p class="mt-1.5 max-w-md text-sm text-muted">
						{#if data.checkin}
							{data.joinableLoads
								? `${data.joinableLoads} load${data.joinableLoads === 1 ? ' is' : 's are'} open at ${data.checkin.dropzone.name}. Grab a slot.`
								: `No open loads at ${data.checkin.dropzone.name} right now — check back soon.`}
						{:else}
							Check in at your dropzone, then manifest yourself on the next load straight from your phone.
						{/if}
					</p>
					<div class="mt-5 flex flex-wrap gap-2">
						{#if data.checkin}
							<Button href="/app/check-in" size="lg"><Icon name="plane" class="size-5" /> Join a load</Button>
						{:else}
							<Button href="/app/check-in" size="lg"><Icon name="checkin" class="size-5" /> Check in now</Button>
							<Button href="/app/dropzones" size="lg" variant="secondary">Find a dropzone</Button>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Check-in status -->
		<div class="flex flex-col gap-4 lg:col-span-2">
			<a
				href="/app/check-in"
				class={cn(
					'flex items-center gap-4 rounded-2xl border p-4 transition-colors hover:border-border-strong',
					data.checkin ? 'border-success/30 bg-success/5' : 'border-border bg-surface'
				)}
				data-testid="checkin-status"
			>
				<span
					class={cn(
						'grid size-11 shrink-0 place-items-center rounded-xl',
						data.checkin ? 'bg-success/15 text-success' : 'bg-surface-2 text-subtle'
					)}
				>
					<Icon name="checkin" />
				</span>
				<span class="min-w-0 flex-1">
					{#if data.checkin}
						<span class="block truncate font-medium">Checked in at {data.checkin.dropzone.name}</span>
						<span class="block truncate text-sm text-muted">
							Since {fmtTime(data.checkin.checkedInAt)}{data.checkin.weightKg ? ` · ${data.checkin.weightKg} kg` : ''}{data.checkin.gearRental
								? ' · rental gear'
								: ''}
						</span>
					{:else}
						<span class="block font-medium">Not checked in</span>
						<span class="block text-sm text-muted">Check in when you arrive at the DZ</span>
					{/if}
				</span>
				{#if data.checkin?.verified}<Badge tone="success">Verified</Badge>{/if}
				<JIcon name="chevronRight" class="size-4 text-subtle" />
			</a>

			<div class="grid grid-cols-2 gap-3">
				<StatTile label="Total jumps" value={fmtNumber(data.totals.totalJumps)} hint="{data.totals.last30Days} in 30 days" href="/app/logbook">
					{#snippet icon()}<Icon name="book" class="size-4" />{/snippet}
				</StatTile>
				<StatTile label="Freefall" value={fmtFreefall(data.totals.totalFreefallSeconds)} hint="{data.totals.logged} logged" href="/app/logbook">
					{#snippet icon()}<JIcon name="clock" class="size-4" />{/snippet}
				</StatTile>
				<StatTile
					label="Wallet"
					value={data.wallet ? formatMoney(data.wallet.availableMinor, data.wallet.currency) : '—'}
					hint={data.wallet
						? data.wallet.pendingMinor
							? `${formatMoney(data.wallet.pendingMinor, data.wallet.currency)} reserved`
							: data.wallet.dropzone.name
						: 'No wallet yet'}
					tone={data.wallet && data.wallet.availableMinor < 0 ? 'danger' : 'default'}
					href={data.wallet ? `/app/wallet/${data.wallet.dropzone.slug}` : '/app/wallet'}
				>
					{#snippet icon()}<Icon name="wallet" class="size-4" />{/snippet}
				</StatTile>
				<StatTile
					label="Reserve repack"
					value={data.nextRepack.dueOn ? fmtDate(data.nextRepack.dueOn, { year: false }) : '—'}
					hint={data.nextRepack.dueOn ? dueLabel(data.nextRepack) : 'Add your rig'}
					tone={data.nextRepack.status === 'overdue' ? 'danger' : data.nextRepack.status === 'due_soon' ? 'warning' : 'default'}
					href="/app/my-gear"
				>
					{#snippet icon()}<Icon name="parachute" class="size-4" />{/snippet}
				</StatTile>
			</div>
		</div>
	</div>

	{#if data.alerts.length}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="alerts">
			{#each data.alerts as a (a.id)}
				<a
					href={a.href}
					class={cn(
						'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
						a.tone === 'danger' ? 'border-danger/30 bg-danger/5 hover:bg-danger/10' : 'border-warning/30 bg-warning/5 hover:bg-warning/10'
					)}
				>
					<JIcon name="alert" class={cn('mt-0.5 size-5', a.tone === 'danger' ? 'text-danger' : 'text-warning')} />
					<span class="min-w-0">
						<span class="block text-sm font-medium">{a.title}</span>
						<span class="block text-sm text-muted">{a.body}</span>
					</span>
				</a>
			{/each}
		</div>
	{/if}

	<div>
		<h2 class="mb-3 text-sm font-medium text-muted">Quick actions</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
			{#each actions as a (a.testid)}
				<a
					href={a.href}
					data-testid={a.testid}
					class="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-border-strong active:scale-[0.98]"
				>
					<span class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
						{#if a.icon}<Icon name={a.icon} class="size-5" />{:else if a.jicon}<JIcon name={a.jicon} class="size-5" />{/if}
					</span>
					<span>
						<span class="block text-sm font-medium">{a.label}</span>
						<span class="block truncate text-xs text-muted">{a.hint}</span>
					</span>
				</a>
			{/each}
		</div>
	</div>

	{#if data.membership.status === 'valid'}
		<p class="flex items-center gap-2 text-xs text-muted">
			<JIcon name="badgeCheck" class="size-4 text-success" /> Membership valid until {fmtDate(data.membership.expiry)} ·
			<Badge tone={DUE_TONES.ok} class="!py-0">{data.membership.daysLeft} days</Badge>
		</p>
	{/if}
</section>
