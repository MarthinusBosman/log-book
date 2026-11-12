<script lang="ts">
	import { brand } from '#lib/brand.ts';
	import Seo from '#lib/components/marketing/Seo.svelte';

	type Group = { id: string; who: 'Dropzone' | 'Jumper' | 'Both'; title: string; intro: string; items: [string, string][] };

	const groups: Group[] = [
		{
			id: 'manifest',
			who: 'Dropzone',
			title: 'Manifest and loads',
			intro: 'The screen manifest lives on all day.',
			items: [
				['Loads per aircraft', 'Each load knows its plane, slot count, weight limit, exit altitude and pilot.'],
				['Slots and jump types', 'Fun jumps, tandems, AFF, coach, video and hop & pops, each priced from your pricelist.'],
				['Call timers', 'Set the call and everyone sees the countdown: the board, the hangar TV and the jumpers on the load.'],
				['Hangar display', 'A read-only board for any TV with a browser. Open the link and leave it running.'],
				['Check-in', 'Jumpers check in from their phone with exit weight and rental gear, so manifest knows who is on site.'],
				['Teams', 'Manifest a whole team onto one load in one go.']
			]
		},
		{
			id: 'tandems',
			who: 'Dropzone',
			title: 'Tandems and waivers',
			intro: 'From the first click on your website to the PDF in the file.',
			items: [
				['Online booking', 'A public booking page with your dates, time slots and how many places are left.'],
				['Deposits', 'Customers pay a deposit online through PayFast. Walk-ins and phone bookings work too.'],
				['Passenger registration', 'Passengers fill in their own details and weight from a link before the day.'],
				['Waiver builder', 'Write your indemnity in sections. Tandem passengers and sport jumpers sign on their phone.'],
				['Signed PDFs', 'Every signed waiver is stored with a PDF you can download or print.'],
				['Instructor and video', 'Assign a TI and a videographer to each tandem and put them on a load.']
			]
		},
		{
			id: 'money',
			who: 'Dropzone',
			title: 'Pricelist, wallets and payments',
			intro: 'Prices and balances in the currency you choose.',
			items: [
				['Pricelist', 'Slot prices per altitude and jump type, packing, rentals, tickets and packages.'],
				['Jumper wallets', 'Jumpers top up once and slots are charged when the load is completed.'],
				['Card top-ups', 'Online top-ups through PayFast, plus cash and EFT recorded at the counter.'],
				['Any currency', 'Rand, US dollar, euro, pound and more, set per dropzone.']
			]
		},
		{
			id: 'staff',
			who: 'Dropzone',
			title: 'Staff, aircraft and pay',
			intro: 'Who worked, what they are rated for and what they are owed.',
			items: [
				['Roles and ratings', 'Owner, manifest, TI, AFF instructor, coach, video, rigger, pilot. One person can hold several.'],
				['Pay rules', 'A rate per role and jump type. Pay for any period adds itself up from the loads.'],
				['Aircraft', 'Fleet with tail numbers, capacity, weight limits and a default pilot.'],
				['Permissions', 'Each role only sees the parts of the dropzone it needs.']
			]
		},
		{
			id: 'gear',
			who: 'Both',
			title: 'Gear',
			intro: 'Reserve and AAD dates nobody has to remember.',
			items: [
				['DZ rigs', 'Student, tandem and rental rigs, marked available, in use or grounded.'],
				['Repack and AAD dates', 'Reserve repack and AAD service due dates for every rig, with warnings before they lapse.'],
				["Members' gear", "See when members' personal reserves or AADs are about to run out, and tell them."],
				['Your own rig', 'Jumpers keep their container, canopies and dates on their phone, with wing loading.']
			]
		},
		{
			id: 'reports',
			who: 'Dropzone',
			title: 'Reports',
			intro: 'The numbers you need for the Monday meeting.',
			items: [
				['Slots and loads', 'Slots per day, week or month, and loads per aircraft.'],
				['Revenue', 'Takings by price item, tandems by status and wallet top-ups against charges.'],
				['Staff and pilot pay', 'Totals per person for any date range.'],
				['Export', 'CSV for the accountant, JSON for everything.']
			]
		},
		{
			id: 'jumpers',
			who: 'Jumper',
			title: 'For jumpers',
			intro: 'Free, and it works at every dropzone on the network.',
			items: [
				['Automatic logbook', 'Jumps you make at a dropzone on the network are logged with aircraft, altitude and load.'],
				['QR sign-offs', 'An instructor or licensed jumper scans your QR code and signs with their own account and licence.'],
				['Manual entries', 'Log jumps from anywhere else by hand, or import a CSV.'],
				['Self-manifest', 'Check in and take a slot on the next load from your phone.'],
				['Wallets', 'Your balance and tickets at each dropzone in one place.'],
				['Teams and jump buddies', 'Keep your teams together and manifest them as one.']
			]
		},
		{
			id: 'data',
			who: 'Both',
			title: 'Import, export and sync',
			intro: 'Your data comes in easily and leaves just as easily.',
			items: [
				['Jump Master import', 'Sign in with your Jump Master account to bring across your logbook, gear and ratings. Dropzones can bring jumpers, pricelist, aircraft and loads.'],
				['CSV import', 'Upload a logbook spreadsheet. Columns are matched for you and bad rows are reported, not fatal.'],
				['Export', 'Download your logbook as CSV or JSON, or a whole dropzone as JSON, whenever you like.'],
				['Linked accounts', `Jumpers at a self-hosted dropzone link their ${brand.name} account once, and jumps sync to their logbook.`]
			]
		}
	];
</script>

<Seo title="Features" description="Every {brand.name} feature for dropzones and jumpers: manifest, tandems, waivers, wallets, staff pay, gear, reports, logbooks and import." />

<section class="relative isolate border-b border-border">
	<div class="bg-chart absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true"></div>
	<div class="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
		<p class="font-mono text-xs font-medium tracking-[0.16em] text-primary uppercase">Features</p>
		<h1 class="mt-4 max-w-3xl text-4xl font-[580] tracking-[-0.03em] text-balance sm:text-6xl">
			Everything in the box, in plain words.
		</h1>
		<p class="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
			One app for the whole dropzone day, and a logbook that follows each jumper. Here is what it does today.
		</p>
	</div>
</section>

<div class="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[13rem_1fr]">
	<nav class="hidden lg:block" aria-label="Feature sections">
		<ul class="sticky top-24 space-y-1 border-l border-border text-sm">
			{#each groups as g (g.id)}
				<li><a href="#{g.id}" class="-ml-px block border-l border-transparent py-1.5 pl-4 text-muted transition-colors hover:border-fg hover:text-fg">{g.title}</a></li>
			{/each}
		</ul>
	</nav>

	<div class="space-y-20">
		{#each groups as g, i (g.id)}
			<section id={g.id} class="scroll-mt-24" aria-labelledby="{g.id}-h">
				<div class="flex items-baseline gap-4">
					<span class="font-mono text-xs text-subtle tabular-nums">{String(i + 1).padStart(2, '0')}</span>
					<div>
						<h2 id="{g.id}-h" class="text-2xl font-[580] tracking-[-0.02em] sm:text-3xl">{g.title}</h2>
						<p class="mt-2 text-muted">
							{g.intro}
							<span class="ml-1 rounded-full border border-border px-2 py-0.5 align-middle text-[11px] font-medium text-muted"
								>{g.who === 'Both' ? 'Dropzones + jumpers' : g.who === 'Jumper' ? 'Jumpers' : 'Dropzones'}</span
							>
						</p>
					</div>
				</div>
				<dl class="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
					{#each g.items as [term, desc] (term)}
						<div class="bg-surface p-5 sm:p-6">
							<dt class="font-medium">{term}</dt>
							<dd class="mt-1.5 text-[15px] leading-relaxed text-muted">{desc}</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
</div>

<section class="border-t border-border">
	<div class="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between">
		<h2 class="text-2xl font-[580] tracking-tight sm:text-3xl">Try it with your own loads.</h2>
		<div class="flex flex-col gap-3 sm:flex-row">
			<a href="/signup" class="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-medium text-white transition-colors hover:bg-brand-600">Start free</a>
			<a href="/self-host" class="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong px-5 font-medium transition-colors hover:bg-surface-2">Self-host it</a>
		</div>
	</div>
</section>
