<script lang="ts">
	import { brand } from '#lib/brand.ts';
	import AltitudeTape from '#lib/components/marketing/AltitudeTape.svelte';
	import Canopy from '#lib/components/marketing/Canopy.svelte';
	import BookingMock from '#lib/components/marketing/BookingMock.svelte';
	import ImportMock from '#lib/components/marketing/ImportMock.svelte';
	import ManifestWindow from '#lib/components/marketing/ManifestWindow.svelte';
	import PhoneLogbook from '#lib/components/marketing/PhoneLogbook.svelte';
	import PhoneNextLoad from '#lib/components/marketing/PhoneNextLoad.svelte';
	import Seo from '#lib/components/marketing/Seo.svelte';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const jumperPoints = [
		{ title: 'Check in, then manifest yourself', body: 'Tap in when you arrive and take a slot on the next load from your phone.' },
		{ title: 'Gear with dates on it', body: 'Your rig, reserve repack and AAD service dates, with a reminder before they run out.' },
		{ title: 'A wallet at every dropzone', body: 'Balance and jump tickets per DZ, topped up by card or at the counter.' },
		{ title: 'Teams', body: 'Put your 4-way on a load together instead of four trips to manifest.' },
		{ title: 'One account, any DZ', body: 'Licence, ratings and jump numbers come with you, even to a dropzone that runs its own server.' }
	];

	const ledger = [
		{ what: 'Top-up · card', amt: '+R2 000', tone: 'text-emerald-700 dark:text-emerald-300' },
		{ what: 'Load 3 · 13 500 ft', amt: '−R380', tone: '' },
		{ what: 'Load 7 · 13 500 ft', amt: '−R380', tone: '' },
		{ what: 'Packing ×2', amt: '−R160', tone: '' }
	];
	const pay = [
		{ who: 'Pieter van Wyk', role: 'Tandem instructor', jumps: 6, amt: 'R3 300' },
		{ who: 'Lebo Dlamini', role: 'Video', jumps: 5, amt: 'R1 750' },
		{ who: 'Thando Khumalo', role: 'Packer', jumps: 22, amt: 'R1 320' }
	];
	const gear = [
		{ rig: 'Student rig S-04', what: 'Reserve repack', when: 'in 9 days', tone: 'text-amber-700 bg-amber-500/12 dark:text-amber-300' },
		{ rig: 'Tandem T-02', what: 'AAD service', when: 'Mar 2027', tone: 'text-muted bg-surface-2' },
		{ rig: 'Rental R-11', what: 'Reserve repack', when: 'overdue', tone: 'text-red-700 bg-red-500/12 dark:text-red-300' }
	];
	const bars = [38, 52, 44, 61, 30, 72, 88, 41, 47, 55, 63, 35, 79, 96];
	const display = [
		{ n: 7, t: '12:00', s: 'Boarding at 5', hot: true },
		{ n: 8, t: '47:00', s: '9 of 16' },
		{ n: 9, t: '65:00', s: '4 of 14' }
	];
	const onboard = ['Ruan S.', 'Naledi M.', 'Kim N.', 'Jo B.', 'Pieter W.', 'Sarah J.', 'Lebo D.', 'Johan B.', 'Aisha P.', 'Thabo K.', 'Mia C.', 'Ettienne R.'];
	const hostedPoints = [
		'Sign up and set up your dropzone in a few minutes',
		'Updates and backups are our problem',
		'Jumpers who already have an account just check in'
	];
	const selfPoints = [
		'One Docker container and one SQLite file',
		'On a local machine, manifest keeps going when the internet drops',
		'Free, with the same features as hosted'
	];
	const syncNodes = [
		{ k: 'Your server', v: 'manifest.your-dz.co.za' },
		{ k: 'Global logbook', v: brand.domain },
		{ k: "Jumper's phone", v: 'Jump 412 ✓' }
	];
	const plans = [
		{
			who: 'Jumpers',
			price: 'Free',
			note: 'always',
			body: 'Logbook with sign-offs, wallet, gear dates, check-in, self-manifest and teams.',
			cta: 'Create your account',
			href: '/signup',
			main: false
		},
		{
			who: 'Hosted dropzone',
			price: 'Free',
			note: 'always',
			body: 'Everything on this page on our servers. No subscription, no per-slot fees and no cut of your payments: online payments go straight to your own PayFast, Paystack, Yoco or Stripe account.',
			cta: 'Start free',
			href: '/signup',
			main: true
		},
		{
			who: 'Self-hosted dropzone',
			price: 'Free',
			note: 'on your hardware',
			body: 'The same app as one Docker container. You look after the server, and jumpers can still link their logbooks.',
			cta: 'Self-host guide',
			href: '/self-host',
			main: false
		}
	];

	const faqs = [
		{
			q: 'Do jumpers pay for an account?',
			a: 'No. Logbook, wallet, gear tracking, check-in and teams are free for jumpers. What you pay for slots is up to each dropzone.'
		},
		{
			q: 'Can we run it on our own server?',
			a: 'Yes. It ships as one Docker container that keeps everything in a single SQLite file, so a small Linux box or mini-PC in the office is enough. The self-host guide covers setup, backups and updates.'
		},
		{
			q: 'Our DZ self-hosts. Do my jumps still reach my logbook?',
			a: 'Yes, once you link your account. The dropzone server sends each completed jump to your global logbook. If the internet is down, jumps queue up and go through when it is back.'
		},
		{
			q: 'Which currencies does it handle?',
			a: 'Each dropzone sets its own: rand, US dollar, euro, pound and others. Online card payments run through PayFast today.'
		},
		{
			q: 'How does the Jump Master import work?',
			a: `You sign in with your Jump Master email and password inside ${brand.name}. Your browser fetches your jumps, gear and ratings and shows a preview, and nothing is saved until you confirm. If you would rather not sign in, upload a CSV of your logbook instead.`
		},
		{
			q: 'Do tandem customers need an account?',
			a: 'No. They book, pay the deposit and sign the waiver from your booking link. The signed waiver is kept as a PDF with the booking.'
		},
		{
			q: 'Can we show the loads on the hangar TV?',
			a: 'Open the display link on any screen with a browser. It shows upcoming loads and call times and refreshes itself.'
		},
		{
			q: 'Who owns the data?',
			a: 'You do. Dropzones can export everything as JSON, and jumpers can download their logbook as CSV or JSON at any time.'
		}
	];
</script>

<Seo />

{#snippet eyebrow(text: string)}
	<p class="font-mono text-xs font-medium tracking-[0.16em] text-primary uppercase">{text}</p>
{/snippet}

{#snippet check()}
	<svg viewBox="0 0 24 24" class="mt-0.5 size-5 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
{/snippet}

{#snippet arrow()}
	<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
{/snippet}

<!-- ───────────────────────── Hero ───────────────────────── -->
{#if page.url.searchParams.get('deleted') === '1' && !data.user}
	<div class="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
		<p class="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" role="status" data-testid="account-deleted">
			Your account has been deleted and you've been signed out. Blue skies.
		</p>
	</div>
{/if}

<section class="relative isolate">
	<div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
		<div class="hero-glow absolute -top-40 left-1/2 h-[46rem] w-[90rem] -translate-x-1/2"></div>
		<div class="bg-chart absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"></div>
		<!-- jump run: a dashed track across the sky -->
		<svg class="absolute top-20 left-0 h-48 w-full text-primary" preserveAspectRatio="none" viewBox="0 0 1440 200" fill="none">
			<path d="M-20 170 L1460 30" stroke="currentColor" stroke-opacity="0.25" stroke-width="1.25" stroke-dasharray="2 8" vector-effect="non-scaling-stroke" />
		</svg>
	</div>

	<div class="mx-auto max-w-6xl px-5 pt-14 sm:px-8 sm:pt-20 lg:pt-24">
		<div class="grid items-stretch gap-10 lg:grid-cols-[1fr_auto]">
			<div>
				<a
					href="#import"
					class="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 py-1 pr-3 pl-1 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-fg"
				>
					<span class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">New</span>
					Import your Jump Master logbook
					{@render arrow()}
				</a>
				<h1 class="mt-7 text-[2.75rem] leading-[1.02] font-[580] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[5.25rem]">
					Run the dropzone.<br /><span class="text-muted">Log every jump.</span>
				</h1>
				<p class="mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-muted sm:text-xl">
					Manifest, tandem bookings, waivers, staff pay and gear for the people running the DZ. A free logbook and
					wallet for the people jumping. Use ours, or run it on a server you own.
				</p>
				<div class="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
					<a
						href={data.user ? '/app' : '/signup'}
						class="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-fg shadow-[0_8px_30px_-8px_rgb(30_107_255/0.6)] transition-colors hover:bg-brand-600"
					>
						{data.user ? 'Open the app' : 'Start free'}
						{@render arrow()}
					</a>
					<a
						href="/self-host"
						class="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong px-6 font-medium transition-colors hover:bg-surface-2"
					>
						Self-host it
					</a>
					<p class="text-sm text-muted sm:ml-3">Free for jumpers. No card to start.</p>
				</div>
			</div>
			<div class="hidden pt-2 pb-6 lg:block">
				<AltitudeTape />
			</div>
		</div>

		<!-- product -->
		<div class="relative mt-14 sm:mt-16">
			<div class="relative lg:ml-40">
				<ManifestWindow />
			</div>
			<PhoneNextLoad class="absolute -bottom-20 -left-2 hidden lg:block xl:-left-8" />
		</div>
	</div>
</section>

<!-- ───────────────────────── Replaces ───────────────────────── -->
<section class="mx-auto max-w-6xl px-5 pt-28 pb-6 sm:px-8 lg:pt-44">
	<p class="max-w-4xl text-2xl leading-snug font-[520] tracking-tight text-pretty text-subtle sm:text-[2rem] sm:leading-[1.25]">
		<span class="text-fg">{brand.name} replaces</span> the whiteboard, the tandem spreadsheet, the box of paper waivers,
		the pay sheet on the fridge <span class="text-fg">and the logbook at the bottom of your kit bag.</span>
	</p>
</section>

<!-- ───────────────────────── Dropzones ───────────────────────── -->
<section id="dropzones" class="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
	<div class="grid gap-6 lg:grid-cols-2 lg:items-end">
		<div>
			{@render eyebrow('For dropzones')}
			<h2 class="mt-4 text-3xl font-[580] tracking-[-0.025em] text-balance sm:text-5xl">Everything manifest touches, on one screen.</h2>
		</div>
		<p class="text-lg leading-relaxed text-muted lg:pb-1.5">
			It's built around the load board, because that's where the day actually happens. Owners, manifest, instructors,
			packers and pilots each get the parts they need.
		</p>
	</div>

	<div class="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
		<!-- Hangar display -->
		<article class="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface md:col-span-4">
			<div class="p-6 pb-0 sm:p-8 sm:pb-0">
				<h3 class="text-lg font-semibold tracking-tight">Loads, slots and call timers</h3>
				<p class="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
					Build the day's loads, drop jumpers into slots and set the call. The hangar TV and every jumper's phone
					follow the board, so nobody has to shout across the packing mat.
				</p>
			</div>
			<div class="mt-8 flex flex-1 flex-col px-6 sm:px-8" aria-hidden="true">
				<div class="flex-1 rounded-t-xl border border-b-0 border-[#1b2742] bg-[#050a15] p-5 text-white">
					<div class="flex items-center justify-between gap-4 font-mono text-[11px] tracking-[0.16em] text-white/50 uppercase">
						<span>Hangar display</span><span class="hidden sm:inline">Jump run 240° · 9 kt</span>
					</div>
					<div class="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
						{#each display as l (l.n)}
							<div class="rounded-lg border p-2.5 sm:p-3.5 {l.hot ? 'border-[#1e6bff] bg-[#1e6bff]/15' : 'border-white/10 bg-white/[0.03]'}">
								<p class="text-xs text-white/60">Load {l.n}</p>
								<p class="mt-1 font-mono text-xl leading-none font-semibold tabular-nums sm:text-3xl {l.hot ? 'text-[#8eb5ff]' : ''}">{l.t}</p>
								<p class="mt-2 text-xs {l.hot ? 'text-[#bcd3ff]' : 'text-white/50'}">{l.s}</p>
							</div>
						{/each}
					</div>
					<div class="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3.5">
						<p class="font-mono text-[11px] tracking-[0.16em] text-white/50 uppercase">Load 7 · on board</p>
						<ul class="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-white/80 sm:grid-cols-4">
							{#each onboard as name, i (name)}
								<li class="flex gap-2 truncate"><span class="w-4 shrink-0 text-right font-mono text-white/35 tabular-nums">{i + 1}</span>{name}</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		</article>

		<!-- Tandems -->
		<article class="rounded-2xl border border-border bg-surface p-6 sm:p-8 md:col-span-2">
			<h3 class="text-lg font-semibold tracking-tight">Tandems that arrive ready</h3>
			<p class="mt-2 text-[15px] leading-relaxed text-muted">
				Customers pick a slot, pay a deposit and sign the waiver on their phone. You get the booking, the payment and a
				signed PDF.
			</p>
			<div class="mt-6"><BookingMock /></div>
		</article>

		<!-- Wallets -->
		<article class="rounded-2xl border border-border bg-surface p-6 sm:p-8 md:col-span-2">
			<h3 class="text-lg font-semibold tracking-tight">Wallets and a pricelist</h3>
			<p class="mt-2 text-[15px] leading-relaxed text-muted">
				Jumpers top up once and slots are charged when the load goes. You choose the currency.
			</p>
			<div class="mt-6 rounded-xl border border-border bg-bg/60 text-[12px]" aria-hidden="true">
				<div class="flex items-baseline justify-between border-b border-border px-3.5 py-3">
					<span class="text-muted">Naledi M. · balance</span>
					<span class="font-mono text-base font-semibold tabular-nums">R1 240</span>
				</div>
				{#each ledger as row (row.what)}
					<div class="flex justify-between px-3.5 py-2">
						<span class="text-muted">{row.what}</span>
						<span class="font-mono tabular-nums {row.tone}">{row.amt}</span>
					</div>
				{/each}
			</div>
		</article>

		<!-- Staff & pay -->
		<article class="rounded-2xl border border-border bg-surface p-6 sm:p-8 md:col-span-2">
			<h3 class="text-lg font-semibold tracking-tight">Staff and pay</h3>
			<p class="mt-2 text-[15px] leading-relaxed text-muted">
				Set a rate per role and the week's pay adds itself up from the loads.
			</p>
			<div class="mt-6 divide-y divide-border rounded-xl border border-border bg-bg/60 text-[12px]" aria-hidden="true">
				{#each pay as p (p.who)}
					<div class="flex items-center justify-between gap-3 px-3.5 py-2.5">
						<div class="min-w-0">
							<p class="truncate font-medium">{p.who}</p>
							<p class="text-muted">{p.role} · {p.jumps} jumps</p>
						</div>
						<span class="font-mono font-semibold tabular-nums">{p.amt}</span>
					</div>
				{/each}
			</div>
		</article>

		<!-- Gear -->
		<article class="rounded-2xl border border-border bg-surface p-6 sm:p-8 md:col-span-2">
			<h3 class="text-lg font-semibold tracking-tight">Gear that reminds you</h3>
			<p class="mt-2 text-[15px] leading-relaxed text-muted">
				Student, tandem and rental rigs with repack and AAD dates. You hear about it before it lapses.
			</p>
			<div class="mt-6 divide-y divide-border rounded-xl border border-border bg-bg/60 text-[12px]" aria-hidden="true">
				{#each gear as g (g.rig)}
					<div class="flex items-center justify-between gap-3 px-3.5 py-2.5">
						<div class="min-w-0">
							<p class="truncate font-medium">{g.rig}</p>
							<p class="text-muted">{g.what}</p>
						</div>
						<span class="rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap {g.tone}">{g.when}</span>
					</div>
				{/each}
			</div>
		</article>

		<!-- Reports -->
		<article class="grid gap-8 rounded-2xl border border-border bg-surface p-6 sm:p-8 md:col-span-6 md:grid-cols-[1fr_2fr] md:items-end">
			<div>
				<h3 class="text-lg font-semibold tracking-tight">Reports you'll actually open</h3>
				<p class="mt-2 text-[15px] leading-relaxed text-muted">
					Jumps, slots sold, takings and aircraft use by day, month or season. Export to CSV for the accountant.
				</p>
			</div>
			<div aria-hidden="true">
				<div class="flex items-center justify-between text-[12px] text-muted">
					<span>Slots sold · last 14 days</span><span class="font-mono tabular-nums">801</span>
				</div>
				<div class="mt-3 flex h-28 items-end gap-1.5 border-b border-border">
					{#each bars as b, i (i)}
						<div
							class="flex-1 rounded-t-[3px] {i === bars.length - 1
								? 'bg-primary'
								: i % 7 === 5 || i % 7 === 6
									? 'bg-primary/45'
									: 'bg-border-strong'}"
							style="height:{b}%"
						></div>
					{/each}
				</div>
				<p class="mt-2 text-[11px] text-subtle">Weekends in blue. Today on the right.</p>
			</div>
		</article>
	</div>

	<p class="mt-8 text-[15px] text-muted">
		Also in the box: check-in, aircraft and pilots, a waiver builder, student progression and teams.
		<a href="/features" class="font-medium text-primary hover:underline">See every feature</a>
	</p>
</section>

<!-- ───────────────────────── Jumpers ───────────────────────── -->
<section id="jumpers" class="relative scroll-mt-20 border-y border-border bg-surface/50">
	<div class="mx-auto grid max-w-6xl items-center gap-16 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_1fr]">
		<div class="relative order-2 mx-auto flex justify-center lg:order-1">
			<div class="absolute inset-0 m-auto size-80 rounded-full bg-primary/20 blur-[90px]" aria-hidden="true"></div>
			<PhoneLogbook class="relative sm:w-[18.5rem] lg:w-[19.5rem]" />
			<div
				class="absolute -bottom-6 left-1/2 w-52 -translate-x-1/2 rounded-xl sm:top-[62%] sm:bottom-auto sm:-left-36 sm:translate-x-0 border border-border bg-elevated p-3 shadow-xl shadow-black/15 dark:shadow-black/40"
				aria-hidden="true"
			>
				<div class="flex items-center gap-2.5">
					<span class="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
						<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
					</span>
					<div class="min-w-0 text-[12px]">
						<p class="font-medium">Signed by Johan Botha</p>
						<p class="text-muted">Coach rating · just now</p>
					</div>
				</div>
			</div>
		</div>

		<div class="order-1 lg:order-2">
			{@render eyebrow('For jumpers')}
			<h2 class="mt-4 text-3xl font-[580] tracking-[-0.025em] text-balance sm:text-5xl">Your logbook fills itself in.</h2>
			<p class="mt-5 text-lg leading-relaxed text-muted">
				Jumper accounts are free. Jump at a dropzone that runs {brand.name} and the jump lands in your logbook with the
				aircraft, altitude and load already filled in. Your coach scans a QR code to sign it off.
			</p>
			<ol class="mt-10 space-y-6">
				{#each jumperPoints as p, i (p.title)}
					<li class="grid grid-cols-[2rem_1fr] gap-x-3">
						<span class="pt-0.5 font-mono text-xs text-subtle tabular-nums">0{i + 1}</span>
						<div>
							<h3 class="font-medium">{p.title}</h3>
							<p class="mt-1 text-[15px] leading-relaxed text-muted">{p.body}</p>
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</div>
</section>

<!-- ───────────────────────── Hosted vs self-hosted ───────────────────────── -->
<section id="self-host" class="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
	<div class="max-w-3xl">
		{@render eyebrow('Hosted or self-hosted')}
		<h2 class="mt-4 text-3xl font-[580] tracking-[-0.025em] text-balance sm:text-5xl">Use ours, or run it in the manifest office.</h2>
		<p class="mt-5 text-lg leading-relaxed text-muted">
			Same app either way. Go hosted to be live this afternoon. Self-host if you want the data on a machine you own.
		</p>
	</div>

	<div class="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
		<article class="flex flex-col rounded-2xl border border-border bg-surface p-6 sm:p-8">
			<p class="font-mono text-xs tracking-[0.16em] text-muted uppercase">Hosted</p>
			<h3 class="mt-3 text-2xl font-semibold tracking-tight">We run it.</h3>
			<ul class="mt-6 space-y-3 text-[15px]">
				{#each hostedPoints as item (item)}
					<li class="flex gap-3">{@render check()}<span class="text-muted">{item}</span></li>
				{/each}
			</ul>
			<div class="mt-6 grid flex-1 place-items-center rounded-xl border border-dashed border-border-strong p-6 text-center" aria-hidden="true">
				<div>
					<p class="font-mono text-[13px] text-muted">https://{brand.domain}/dz/<span class="text-fg">your-dropzone</span></p>
					<p class="mt-2 text-[12px] text-subtle">Your public page, booking link and hangar display</p>
				</div>
			</div>
			<div class="pt-8">
				<a href="/signup" class="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg transition-colors hover:bg-brand-600">Start free</a>
			</div>
		</article>

		<article class="flex flex-col rounded-2xl border border-border bg-surface p-6 sm:p-8">
			<p class="font-mono text-xs tracking-[0.16em] text-muted uppercase">Self-hosted</p>
			<h3 class="mt-3 text-2xl font-semibold tracking-tight">You run it.</h3>
			<ul class="mt-6 space-y-3 text-[15px]">
				{#each selfPoints as item (item)}
					<li class="flex gap-3">{@render check()}<span class="text-muted">{item}</span></li>
				{/each}
			</ul>
			<div class="mt-6 flex-1 rounded-xl border border-[#1b2742] bg-[#050a15] p-4 font-mono text-[13px] leading-relaxed text-white/85">
				<p><span class="text-[#598cff]" aria-hidden="true">$</span> docker compose up -d</p>
				<p class="text-emerald-300">✓ migrations applied</p>
				<p class="text-emerald-300">✓ listening on http://0.0.0.0:3000</p>
			</div>
			<div class="pt-8">
				<a href="/self-host" class="inline-flex h-11 items-center gap-2 rounded-xl border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-surface-2">Read the self-host guide</a>
			</div>
		</article>
	</div>

	<!-- federation -->
	<div class="mt-4 grid items-center gap-8 rounded-2xl border border-border bg-surface/50 p-6 sm:p-8 lg:grid-cols-[1fr_1.25fr]">
		<div>
			<h3 class="text-lg font-semibold tracking-tight">Self-hosted doesn't mean cut off.</h3>
			<p class="mt-2 text-[15px] leading-relaxed text-muted">
				Jumpers link their {brand.name} account to your server once. After that, every jump completed at your DZ is sent
				to their logbook, signed and in order. If the line is down, jumps wait in a queue.
			</p>
		</div>
		<div class="flex flex-col items-stretch gap-2 text-[12px] sm:flex-row sm:items-center sm:gap-3" aria-hidden="true">
			{#each syncNodes as node, i (node.k)}
				{#if i > 0}
					<div class="sync-line relative mx-auto h-5 w-px sm:mx-0 sm:h-px sm:min-w-6 sm:flex-1"></div>
				{/if}
				<div class="min-w-0 rounded-xl border bg-surface px-3 py-2.5 {i === 1 ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'}">
					<p class="font-medium whitespace-nowrap">{node.k}</p>
					<p class="truncate font-mono text-[11px] text-muted">{node.v}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ───────────────────────── Import ───────────────────────── -->
<section id="import" class="scroll-mt-20 border-y border-border bg-surface/50">
	<div class="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.1fr]">
		<div>
			{@render eyebrow('Switching from Jump Master?')}
			<h2 class="mt-4 text-3xl font-[580] tracking-[-0.025em] text-balance sm:text-5xl">Import in one click.</h2>
			<p class="mt-5 text-lg leading-relaxed text-muted">
				Sign in with your Jump Master details and {brand.name} reads your jumps, gear and ratings, shows you a preview,
				then brings them across. Run it twice and nothing is doubled.
			</p>
			<p class="mt-4 text-[15px] leading-relaxed text-muted">
				Dropzones can move their jumpers, pricelist, aircraft and load history the same way. Keeping a logbook in a
				spreadsheet? Upload the CSV.
			</p>
		</div>
		<ImportMock />
	</div>
</section>

<!-- ───────────────────────── Pricing ───────────────────────── -->
<section id="pricing" class="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
	<div class="max-w-3xl">
		{@render eyebrow('Pricing')}
		<h2 class="mt-4 text-3xl font-[580] tracking-[-0.025em] text-balance sm:text-5xl">Free for dropzones. Free to self-host.</h2>
	</div>
	<div class="mt-12 grid grid-cols-1 overflow-hidden rounded-2xl border border-border md:grid-cols-3">
		{#each plans as plan, i (plan.who)}
			<div
				class="flex flex-col p-6 sm:p-8 {i > 0 ? 'border-t border-border md:border-t-0 md:border-l' : ''} {plan.main
					? 'bg-primary/[0.06]'
					: 'bg-surface'}"
			>
				<h3 class="font-medium {plan.main ? 'text-primary' : ''}">{plan.who}</h3>
				<p class="mt-4 flex items-baseline gap-2">
					<span class="text-4xl font-[580] tracking-tight">{plan.price}</span>
					<span class="text-sm text-muted">{plan.note}</span>
				</p>
				<p class="mt-4 text-[15px] leading-relaxed text-muted">{plan.body}</p>
				<div class="mt-auto pt-8">
					<a
						href={plan.href}
						class="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors {plan.main
							? 'bg-primary text-primary-fg hover:bg-brand-600'
							: 'border border-border-strong hover:bg-surface-2'}">{plan.cta}</a
					>
				</div>
			</div>
		{/each}
	</div>
</section>

<!-- ───────────────────────── FAQ ───────────────────────── -->
<section id="faq" class="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-8 sm:pb-28">
	<div class="grid gap-10 lg:grid-cols-[1fr_2fr]">
		<div>
			{@render eyebrow('FAQ')}
			<h2 class="mt-4 text-3xl font-[580] tracking-[-0.025em] sm:text-4xl">Questions from the hangar.</h2>
			<p class="mt-4 text-muted">
				Something else? <a href="mailto:{brand.supportEmail}" class="font-medium text-primary hover:underline">{brand.supportEmail}</a>
			</p>
		</div>
		<div class="divide-y divide-border border-y border-border">
			{#each faqs as f (f.q)}
				<details class="group">
					<summary class="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-medium [&::-webkit-details-marker]:hidden">
						{f.q}
						<span class="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted transition-transform group-open:rotate-45" aria-hidden="true">
							<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
						</span>
					</summary>
					<p class="-mt-1 max-w-2xl pr-10 pb-5 leading-relaxed text-muted">{f.a}</p>
				</details>
			{/each}
		</div>
	</div>
</section>

<!-- ───────────────────────── CTA ───────────────────────── -->
<section class="relative isolate overflow-hidden border-t border-border">
	<div class="hero-glow pointer-events-none absolute -bottom-96 left-1/2 -z-10 h-[40rem] w-[80rem] -translate-x-1/2" aria-hidden="true"></div>
	<div class="mx-auto grid max-w-6xl items-center gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_22rem]">
		<div>
		<h2 class="max-w-3xl text-4xl font-[580] tracking-[-0.03em] text-balance sm:text-6xl">Set it up before the first load.</h2>
		<p class="mt-5 max-w-xl text-lg text-pretty text-muted">Bring your pricelist and aircraft. Your jumpers can sign up on the day.</p>
		<div class="mt-9 flex flex-col gap-3 sm:flex-row">
			<a
				href={data.user ? '/app' : '/signup'}
				class="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-fg transition-colors hover:bg-brand-600"
			>
				{data.user ? 'Open the app' : 'Start free'}
				{@render arrow()}
			</a>
			<a href="/features" class="inline-flex h-12 items-center justify-center rounded-xl border border-border-strong px-6 font-medium transition-colors hover:bg-surface-2">See all features</a>
		</div>
		</div>
		<div class="canopy hidden text-primary lg:block"><Canopy /></div>
	</div>
</section>

<style>
	.hero-glow {
		background: radial-gradient(closest-side, rgb(30 107 255 / 0.14), transparent);
	}
	:global(.dark) .hero-glow {
		background: radial-gradient(closest-side, rgb(30 107 255 / 0.3), transparent);
	}
	.canopy {
		transform-origin: 50% 0%;
		animation: sway 9s ease-in-out infinite;
	}
	@keyframes sway {
		0%,
		100% {
			transform: rotate(-2deg) translateY(0);
		}
		50% {
			transform: rotate(2deg) translateY(6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.canopy {
			animation: none;
		}
	}
	.sync-line {
		background: repeating-linear-gradient(180deg, var(--color-primary) 0 4px, transparent 4px 9px);
		opacity: 0.9;
	}
	@media (min-width: 40rem) {
		.canopy {
		transform-origin: 50% 0%;
		animation: sway 9s ease-in-out infinite;
	}
	@keyframes sway {
		0%,
		100% {
			transform: rotate(-2deg) translateY(0);
		}
		50% {
			transform: rotate(2deg) translateY(6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.canopy {
			animation: none;
		}
	}
	.sync-line {
			background: repeating-linear-gradient(90deg, var(--color-primary) 0 4px, transparent 4px 9px);
		}
	}
</style>
