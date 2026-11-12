<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Badge, Button, Dialog, EmptyState, Icon, toast, cn } from '#lib/ui/index.ts';
	import { SLOT_EXTRA_LABELS, formatMoney } from '#lib/domain/constants.ts';
	import PassengerDetail from '#lib/components/tandems/PassengerDetail.svelte';
	import PassengerFields from '#lib/components/tandems/PassengerFields.svelte';
	import { toastEnhance } from '#lib/components/tandems/enhance.ts';
	import {
		PAYMENT_LABELS,
		PAYMENT_TONES,
		STAGE_LABELS,
		STAGE_TONES,
		addDaysIso,
		fmtDay,
		limitWarnings,
		tandemStage
	} from '#lib/components/tandems/model.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let creating = $state(false);
	let createBusy = $state(false);
	let drawer = $state(false);
	$effect(() => {
		drawer = !!data.detail;
	});

	$effect(() => {
		if (page.url.searchParams.get('created') !== '1') return;
		const u = new URL(page.url.href);
		u.searchParams.delete('created');
		untrack(() => {
			toast.success('Tandem jumper has been created');
			goto(u, { replace: true, shallow: true });
		});
	});

	const dayHref = (day: string) => `/app/tandems?day=${day}`;
	const openHref = (id: string, day: string | null) => `/app/tandems?${new URLSearchParams({ day: day ?? data.day, ...(data.q ? { q: data.q } : {}), p: id })}`;
	function closeDrawer() {
		const u = new URL(page.url.href);
		if (!u.searchParams.has('p')) return;
		u.searchParams.delete('p');
		goto(u, { reset: false });
	}

	const active = $derived(data.passengers.filter((p) => p.status !== 'cancelled'));
	const stats = $derived({
		total: active.length,
		signed: active.filter((p) => p.indemnitySignedAt).length,
		paid: active.filter((p) => p.paymentStatus === 'paid').length,
		manifested: active.filter((p) => p.manifested || p.status === 'completed').length
	});
	const groups = $derived.by(() => {
		const m = new Map<string, typeof data.passengers>();
		for (const p of data.passengers) {
			const k = data.q ? (p.jumpDate ?? 'No date') : (p.bookingTime ?? 'Any time');
			m.set(k, [...(m.get(k) ?? []), p]);
		}
		return [...m.entries()];
	});
	const money = (m: number) => formatMoney(m, data.dz.currency);
</script>

<svelte:head><title>Tandems · {data.dz.name}</title></svelte:head>

<div class="flex flex-wrap items-center gap-3">
	<span class="hidden size-10 place-items-center rounded-xl border border-border bg-surface text-primary sm:grid"><Icon name="tandem" /></span>
	<div class="mr-auto">
		<h1 class="text-2xl font-semibold tracking-tight">Tandems</h1>
		<p class="text-sm text-muted">Bookings, passengers, payments and manifesting.</p>
	</div>
	<div class="flex gap-2">
		<Button variant="secondary" href="/app/tandems/slots"><Icon name="calendar" class="size-4" /><span class="sm:hidden">Slots</span><span class="hidden sm:inline">Booking slots</span></Button>
		<Button onclick={() => (creating = true)} data-testid="new-tandem"><Icon name="plus" class="size-4" /> New tandem</Button>
	</div>
</div>

<!-- search + date -->
<div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
	<form method="GET" class="relative flex-1" data-sveltekit-keepfocus>
		<input type="hidden" name="day" value={data.day} />
		<Icon name="users" class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
		<input
			type="search"
			name="q"
			value={data.q}
			placeholder="Search name, email or confirmation number"
			aria-label="Search tandems"
			class="h-11 w-full rounded-xl border border-border bg-surface pr-3.5 pl-10 text-[15px] outline-none placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/15"
		/>
	</form>
	<div class="flex items-center gap-1.5">
		<Button size="icon" variant="ghost" href={dayHref(addDaysIso(data.day, -1))} aria-label="Previous day"><span aria-hidden="true">‹</span></Button>
		<form method="GET" class="flex">
			<input
				type="date"
				name="day"
				value={data.day}
				aria-label="Choose day"
				onchange={(e) => goto(dayHref(e.currentTarget.value))}
				class="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
			/>
			<noscript><Button size="sm" type="submit" variant="secondary" class="ml-1">Go</Button></noscript>
		</form>
		<Button size="icon" variant="ghost" href={dayHref(addDaysIso(data.day, 1))} aria-label="Next day"><span aria-hidden="true">›</span></Button>
		{#if data.day !== data.today}<Button size="sm" variant="secondary" href={dayHref(data.today)}>Today</Button>{/if}
	</div>
</div>

<!-- two-week strip -->
<nav class="-mx-4 mt-4 scrollbar-none overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Days">
	<ol class="flex min-w-max gap-1.5">
		{#each data.strip as d (d.date)}
			{@const sel = d.date === data.day && !data.q}
			<li>
				<a
					href={dayHref(d.date)}
					aria-current={sel ? 'date' : undefined}
					class={cn(
						'flex w-14 flex-col items-center gap-0.5 rounded-xl border py-2 text-center transition-colors',
						sel ? 'border-primary bg-primary text-primary-fg shadow-glow' : 'border-border bg-surface hover:border-border-strong',
						d.date === data.today && !sel && 'border-primary/50'
					)}
				>
					<span class={cn('text-[11px] font-medium uppercase', sel ? 'text-white/80' : 'text-subtle')}>{fmtDay(d.date, { weekday: 'short' })}</span>
					<span class="text-lg leading-none font-semibold tabular-nums">{fmtDay(d.date, { day: 'numeric' })}</span>
					<span
						class={cn(
							'mt-0.5 min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
							d.count ? (sel ? 'bg-white/20' : 'bg-primary/15 text-primary') : sel ? 'text-white/60' : 'text-subtle'
						)}>{d.count || '·'}</span
					>
				</a>
			</li>
		{/each}
	</ol>
</nav>

<!-- day summary -->
<div class="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
	<h2 class="text-lg font-semibold tracking-tight">
		{#if data.q}Results for “{data.q}”{:else}{fmtDay(data.day, { weekday: 'long', day: 'numeric', month: 'long' })}{/if}
	</h2>
	{#if data.q}<a href={dayHref(data.day)} class="text-sm text-primary hover:underline">Clear search</a>{/if}
</div>
<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
	{#each [['Booked', stats.total, 'tandem'], ['Indemnity signed', stats.signed, 'waiver'], ['Paid in full', stats.paid, 'wallet'], ['Manifested', stats.manifested, 'plane']] as [label, n, icon] (label)}
		<div class="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
			<Icon name={icon as 'tandem'} class="size-4 text-subtle" />
			<div>
				<p class="text-xl leading-none font-semibold tabular-nums">{n}<span class="text-sm font-normal text-subtle">{label !== 'Booked' ? `/${stats.total}` : ''}</span></p>
				<p class="mt-1 text-xs text-muted">{label}</p>
			</div>
		</div>
	{/each}
</div>

<!-- list -->
<div class="mt-5 space-y-5">
	{#each groups as [heading, list] (heading)}
		<section>
			<h3 class="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-subtle uppercase">
				<Icon name="calendar" class="size-3.5" />
				{data.q && heading !== 'No date' ? fmtDay(heading) : heading}
				<span class="font-normal">· {list.length}</span>
			</h3>
			<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
				{#each list as p (p.id)}
					{@const stage = tandemStage(p)}
					{@const warn = limitWarnings(p, data.limits)}
					{@const due = Math.max(0, p.totalMinor - p.amountPaidMinor)}
					<li>
						<a
							href={openHref(p.id, p.jumpDate)}
							data-sveltekit-reset="false"
							class={cn(
								'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:grid-cols-[4rem_1fr_auto_auto]',
								stage === 'cancelled' && 'opacity-55'
							)}
							data-testid="tandem-row"
						>
							<span class="hidden font-mono text-sm text-muted tabular-nums sm:block">{p.bookingTime ?? '—'}</span>
							<span class="min-w-0">
								<span class="flex items-center gap-2">
									<span class="truncate font-medium">{p.name}</span>
									{#if warn.length}<span class="size-2 shrink-0 rounded-full bg-warning" title={warn.join(', ')}></span>{/if}
								</span>
								<span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
									<span class="sm:hidden">{p.bookingTime ?? ''}</span>
									<span class="font-mono">{p.confirmationNumber}</span>
									{#if p.weightKg}<span>{p.weightKg} kg</span>{/if}
									{#each p.extras as e (e)}<span class="rounded bg-surface-2 px-1.5 py-px">{SLOT_EXTRA_LABELS[e]}</span>{/each}
								</span>
							</span>
							<span class="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
								<Badge tone={STAGE_TONES[stage]} dot>{STAGE_LABELS[stage]}</Badge>
								<Badge tone={PAYMENT_TONES[p.paymentStatus]} class="hidden sm:inline-flex">{PAYMENT_LABELS[p.paymentStatus]}</Badge>
							</span>
							<span class="hidden w-24 text-right text-sm tabular-nums sm:block {due > 0 ? 'text-warning' : 'text-muted'}">
								{due > 0 ? money(due) : 'Paid'}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<EmptyState
			title={data.q ? 'No tandems match your search' : 'No tandems booked for this day'}
			description={data.q
				? 'Search by full name, email address or confirmation number (e.g. K7M2-QX9P).'
				: 'Online bookings appear here automatically. You can also add a walk-in passenger.'}
		>
			{#snippet icon()}<Icon name="tandem" class="size-6" />{/snippet}
			{#snippet action()}
				<div class="flex flex-wrap justify-center gap-2">
					<Button onclick={() => (creating = true)}><Icon name="plus" class="size-4" /> New tandem</Button>
					<Button variant="secondary" href="/dz/{data.dz.slug}/book" target="_blank">Open booking page</Button>
				</div>
			{/snippet}
		</EmptyState>
	{/each}
</div>

<p class="mt-6 text-sm text-muted">
	Public booking link:
	<a class="font-medium text-primary hover:underline" href="/dz/{data.dz.slug}/book" target="_blank">{page.url.origin}/dz/{data.dz.slug}/book</a>
</p>

<!-- drawer -->
<Dialog bind:open={drawer} variant="right" class="!w-[min(40rem,100vw)]" title="Tandem booking" onclose={closeDrawer}>
	{#if data.detail}
		<PassengerDetail detail={data.detail} dz={data.dz} offer={data.offer} limits={data.limits} />
		<a href="/app/tandems/{data.detail.passenger.id}" class="mt-6 inline-block text-sm text-muted hover:text-fg">Open as full page →</a>
	{/if}
</Dialog>

<!-- create -->
<Dialog bind:open={creating} title="Create tandem passenger" description="Walk-in or phone booking. They can complete details and sign via the registration link." variant="right" class="!w-[min(36rem,100vw)]">
	<form
		method="POST"
		action="?/create"
		use:enhance={toastEnhance({ pending: (on) => (createBusy = on), onSuccess: () => (creating = false) })}
		class="flex flex-col gap-4"
	>
		<PassengerFields mode="create" values={{ jumpDate: data.day }} offer={data.offer} currency={data.dz.currency} limits={data.limits} />
		<Button type="submit" loading={createBusy} class="w-full">Create tandem passenger</Button>
	</form>
</Dialog>
