<script lang="ts">
	import { Button, Icon } from '#lib/ui/index.ts';
	import { SLOT_EXTRA_LABELS, formatMoney } from '#lib/domain/constants.ts';
	import { countryName } from '#lib/domain/countries.ts';
	import { fmtDay } from '#lib/components/tandems/model.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const dz = $derived(data.dz);
	const DAYS = [
		['mon', 'Mon'],
		['tue', 'Tue'],
		['wed', 'Wed'],
		['thu', 'Thu'],
		['fri', 'Fri'],
		['sat', 'Sat'],
		['sun', 'Sun']
	] as const;
	const money = (m: number) => formatMoney(m, dz.currency);
	const mapHref = $derived(
		dz.lat != null && dz.lng != null
			? `https://www.openstreetmap.org/?mlat=${dz.lat}&mlon=${dz.lng}#map=13/${dz.lat}/${dz.lng}`
			: dz.address
				? `https://www.openstreetmap.org/search?query=${encodeURIComponent(dz.address)}`
				: null
	);
	const bookHref = $derived(`/dz/${dz.slug}/book`);
	const countryLabel = $derived(dz.country ? countryName(dz.country) : null);
</script>

<svelte:head>
	<title>{dz.name} — Tandem skydiving</title>
	<meta name="description" content={dz.description ?? `Book a tandem skydive at ${dz.name}.`} />
</svelte:head>

<!-- hero -->
<section class="relative isolate overflow-hidden">
	{#if dz.hasPhoto}
		<img src="/dz/{dz.slug}/photo" alt="" class="absolute inset-0 -z-10 size-full object-cover" />
		<div class="absolute inset-0 -z-10 bg-gradient-to-t from-[#050a15] via-[#050a15]/70 to-[#050a15]/20"></div>
	{:else}
		<div class="absolute inset-0 -z-10 bg-[#050a15]"></div>
		<div class="bg-chart absolute inset-0 -z-10 opacity-60"></div>
		<div class="absolute -top-32 left-1/2 -z-10 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-brand-500/30 blur-[120px]"></div>
		<div class="absolute -bottom-24 -left-24 -z-10 size-[22rem] rounded-full bg-cyan-400/10 blur-[100px]"></div>
	{/if}
	<div class="mx-auto max-w-5xl px-4 pt-16 pb-14 text-white sm:px-6 sm:pt-24 sm:pb-20">
		<p class="text-xs font-semibold tracking-[0.2em] text-brand-300 uppercase">Tandem skydiving{countryLabel ? ` · ${countryLabel}` : ''}</p>
		<h1 class="mt-3 max-w-2xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">{dz.name}</h1>
		{#if dz.description}<p class="mt-5 max-w-xl text-base text-pretty text-white/75 sm:text-lg">{dz.description}</p>{/if}
		<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
			<Button href={bookHref} size="lg" data-testid="book-cta">Book a tandem <Icon name="arrowRight" class="size-4" /></Button>
			{#if data.offer.baseMinor > 0}
				<p class="text-sm text-white/70">From <span class="font-semibold text-white">{money(data.offer.baseMinor)}</span> per person</p>
			{/if}
		</div>
	</div>
</section>

<div class="mx-auto grid max-w-5xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-3">
	<!-- next dates -->
	<section class="rounded-2xl border border-border bg-surface p-5 md:col-span-2">
		<h2 class="flex items-center gap-2 font-semibold"><Icon name="calendar" class="size-4 text-primary" /> Next available days</h2>
		{#if data.upcoming.length}
			<ul class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each data.upcoming as d (d.date)}
					<li>
						<a
							href="{bookHref}?date={d.date}"
							class="flex flex-col rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 transition-colors hover:border-primary/60 hover:bg-primary/5"
						>
							<span class="text-sm font-medium">{d.date === data.today ? 'Today' : fmtDay(d.date, { weekday: 'long' })}</span>
							<span class="text-xs text-muted">{fmtDay(d.date, { day: 'numeric', month: 'long' })} · {d.remaining} place{d.remaining === 1 ? '' : 's'}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-3 text-sm text-muted">No online booking times are open right now. Get in touch and we’ll find you a slot.</p>
		{/if}
		{#if data.offer.extras.length}
			<h3 class="mt-6 text-xs font-semibold tracking-wider text-subtle uppercase">Add-ons</h3>
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each data.offer.extras as e (e.code)}
					<li class="rounded-full border border-border bg-surface-2/50 px-3 py-1 text-sm">
						{SLOT_EXTRA_LABELS[e.code]} <span class="text-muted">+{money(e.priceMinor)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- info -->
	<aside class="flex flex-col gap-4">
		<section class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="flex items-center gap-2 font-semibold"><Icon name="sun" class="size-4 text-primary" /> Opening hours</h2>
			{#if dz.openDays.length}
				<ul class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]">
					{#each DAYS as [key, label] (key)}
						{@const open = dz.openDays.includes(key)}
						<li class="rounded-md py-1.5 {open ? 'bg-primary/15 font-semibold text-primary' : 'bg-surface-2 text-subtle'}">{label}</li>
					{/each}
				</ul>
				{#if dz.openTime && dz.closeTime}<p class="mt-3 text-sm text-muted">{dz.openTime} – {dz.closeTime}, weather permitting</p>{/if}
			{:else}
				<p class="mt-2 text-sm text-muted">Open by appointment — weather permitting.</p>
			{/if}
		</section>
		{#if dz.address || mapHref || dz.contactPhone || dz.contactEmail}
			<section class="rounded-2xl border border-border bg-surface p-5 text-sm">
				<h2 class="flex items-center gap-2 font-semibold"><Icon name="globe" class="size-4 text-primary" /> Find us</h2>
				{#if dz.address}<p class="mt-2 text-muted">{dz.address}</p>{/if}
				{#if mapHref}<a href={mapHref} target="_blank" rel="noopener" class="mt-2 inline-block font-medium text-primary hover:underline">Open map →</a>{/if}
				{#if dz.contactPhone || dz.contactEmail}
					<div class="mt-3 flex flex-col gap-1 border-t border-border pt-3">
						{#if dz.contactPhone}<a href="tel:{dz.contactPhone}" class="hover:text-primary">{dz.contactPhone}</a>{/if}
						{#if dz.contactEmail}<a href="mailto:{dz.contactEmail}" class="break-all hover:text-primary">{dz.contactEmail}</a>{/if}
					</div>
				{/if}
			</section>
		{/if}
	</aside>
</div>

<!-- sticky mobile CTA -->
<div class="sticky bottom-0 z-20 border-t border-border bg-bg/85 p-3 backdrop-blur-xl sm:hidden">
	<Button href={bookHref} class="w-full" size="lg">Book a tandem</Button>
</div>
