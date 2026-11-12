<script lang="ts">
	/** Hero product shot, built from real markup: the manifest screen on a busy Saturday. */
	const nav = ['Manifest', 'Check-in', 'Tandems', 'Wallets', 'Pricelist', 'Staff & pay', 'Gear', 'Reports'];

	const loads = [
		{ n: 7, plane: 'Caravan ZS-SKY', call: '12', filled: 14, cap: 16, state: 'Call 12 min', active: true },
		{ n: 8, plane: 'Caravan ZS-SKY', call: '47', filled: 9, cap: 16, state: 'Filling' },
		{ n: 9, plane: 'King Air ZS-JMP', call: '65', filled: 4, cap: 14, state: 'Open' },
		{ n: 10, plane: 'Caravan ZS-SKY', call: '82', filled: 0, cap: 16, state: 'Open' }
	];

	type Pay = { label: string; tone: 'ok' | 'warn' | 'info' };
	const slots: { n: number; name: string; initials: string; hue: string; jump: string; alt: string; pay: Pay }[] = [
		{ n: 1, name: 'Ruan Steyn', initials: 'RS', hue: 'from-sky-400 to-indigo-500', jump: 'Wingsuit', alt: '13 500', pay: { label: 'Wallet R420', tone: 'ok' } },
		{ n: 2, name: 'Naledi Mokoena', initials: 'NM', hue: 'from-emerald-400 to-teal-600', jump: '4-way FS', alt: '13 500', pay: { label: 'Ticket', tone: 'ok' } },
		{ n: 3, name: 'Kim Naidoo', initials: 'KN', hue: 'from-fuchsia-400 to-purple-600', jump: '4-way FS', alt: '13 500', pay: { label: 'Wallet R380', tone: 'ok' } },
		{ n: 4, name: 'Pieter van Wyk', initials: 'PW', hue: 'from-amber-400 to-orange-600', jump: 'Tandem · TI', alt: '13 500', pay: { label: 'Staff', tone: 'info' } },
		{ n: 5, name: 'Sarah Jones', initials: 'SJ', hue: 'from-rose-400 to-pink-600', jump: 'Tandem · passenger', alt: '13 500', pay: { label: 'Booking T-1042', tone: 'ok' } },
		{ n: 6, name: 'Lebo Dlamini', initials: 'LD', hue: 'from-cyan-400 to-sky-600', jump: 'Video · outside', alt: '13 500', pay: { label: 'Staff', tone: 'info' } },
		{ n: 7, name: 'Aisha Patel', initials: 'AP', hue: 'from-lime-400 to-green-600', jump: 'AFF level 4', alt: '13 500', pay: { label: 'Owes R1 950', tone: 'warn' } }
	];

	const payTone = {
		ok: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300',
		warn: 'text-amber-700 bg-amber-500/12 dark:text-amber-300',
		info: 'text-muted bg-surface-2'
	};
</script>

<div
	class="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_40px_120px_-30px_rgb(4_12_32/0.55)] ring-1 ring-black/[0.02] dark:shadow-[0_40px_140px_-30px_rgb(30_107_255/0.35)]"
	aria-hidden="true"
>
	<!-- window bar -->
	<div class="flex h-11 items-center gap-3 border-b border-border bg-surface-2/60 px-4">
		<div class="flex gap-1.5">
			<span class="size-2.5 rounded-full bg-border-strong"></span>
			<span class="size-2.5 rounded-full bg-border-strong"></span>
			<span class="size-2.5 rounded-full bg-border-strong"></span>
		</div>
		<p class="ml-2 truncate text-xs font-medium">Skydive Robertson</p>
		<p class="hidden text-xs text-muted sm:block">Sat 14 Nov</p>
		<div class="ml-auto flex items-center gap-4 text-xs text-muted">
			<span class="hidden items-center gap-1.5 md:flex">
				<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
				9 kt SW
			</span>
			<span class="hidden font-mono md:inline">Jump run 240°</span>
			<span class="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-300">
				<span class="live-dot size-1.5 rounded-full bg-current"></span> Live
			</span>
		</div>
	</div>

	<div class="grid min-h-[25rem] grid-cols-1 md:grid-cols-[15rem_1fr] lg:grid-cols-[11rem_16rem_1fr]">
		<!-- app nav -->
		<nav class="hidden border-r border-border bg-surface-2/30 p-3 lg:block">
			<ul class="space-y-0.5 text-[13px]">
				{#each nav as item, i (item)}
					<li
						class="rounded-md px-2.5 py-1.5 {i === 0
							? 'bg-primary/10 font-medium text-primary'
							: 'text-muted'}"
					>
						{item}
					</li>
				{/each}
			</ul>
			<div class="mt-6 rounded-lg border border-dashed border-border-strong p-2.5 text-[11px] leading-snug text-muted">
				<span class="font-medium text-fg">Hangar TV</span><br />showing loads 7–10
			</div>
		</nav>

		<!-- loads -->
		<div class="hidden border-r border-border p-3 md:block">
			<div class="mb-2 flex items-center justify-between px-1">
				<p class="text-[11px] font-medium tracking-wider text-subtle uppercase">Today · 6 loads</p>
				<span class="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-fg">+ Load</span>
			</div>
			<ul class="space-y-2">
				{#each loads as l (l.n)}
					<li
						class="rounded-xl border p-3 {l.active
							? 'border-primary/50 bg-primary/[0.06] ring-1 ring-primary/20'
							: 'border-border'}"
					>
						<div class="flex items-center justify-between">
							<p class="text-sm font-semibold">Load {l.n}</p>
							<p class="font-mono text-sm tabular-nums {l.active ? 'text-primary' : 'text-muted'}">
								{l.call}<span class="text-[10px]">m</span>
							</p>
						</div>
						<p class="mt-0.5 text-[11px] text-muted">{l.plane}</p>
						<div class="mt-2.5 flex items-center gap-2">
							<div class="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
								<div class="h-full rounded-full {l.active ? 'bg-primary' : 'bg-border-strong'}" style="width:{(l.filled / l.cap) * 100}%"></div>
							</div>
							<span class="font-mono text-[10px] text-muted tabular-nums">{l.filled}/{l.cap}</span>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		<!-- load detail -->
		<div class="min-w-0 p-4 sm:p-5">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-[11px] font-medium tracking-wider text-subtle uppercase">Load 7 · Caravan ZS-SKY</p>
					<p class="mt-1 text-lg font-semibold tracking-tight">14 of 16 slots · 13 500 ft</p>
				</div>
				<div class="rounded-xl border border-primary/30 bg-primary/[0.07] px-3.5 py-2 text-right">
					<p class="text-[10px] font-medium tracking-wider text-primary uppercase">Call</p>
					<p class="font-mono text-2xl leading-none font-semibold text-primary tabular-nums">12:00</p>
				</div>
			</div>

			<div class="mt-4 overflow-hidden rounded-xl border border-border">
				<div class="grid grid-cols-[1.75rem_1fr_auto] gap-3 border-b border-border bg-surface-2/50 px-3 py-2 text-[11px] font-medium text-subtle uppercase sm:grid-cols-[1.75rem_1.3fr_1fr_4rem_auto]">
					<span>#</span><span>Jumper</span><span class="hidden sm:block">Jump</span><span class="hidden sm:block">Alt</span><span class="text-right">Paid</span>
				</div>
				<ul class="divide-y divide-border">
					{#each slots as s (s.n)}
						<li class="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 px-3 py-2 text-[13px] sm:grid-cols-[1.75rem_1.3fr_1fr_4rem_auto]">
							<span class="font-mono text-xs text-subtle tabular-nums">{s.n}</span>
							<span class="flex min-w-0 items-center gap-2">
								<span class="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br {s.hue} text-[9px] font-semibold text-white">{s.initials}</span>
								<span class="truncate font-medium">{s.name}</span>
							</span>
							<span class="hidden truncate text-muted sm:block">{s.jump}</span>
							<span class="hidden font-mono text-xs text-muted tabular-nums sm:block">{s.alt}</span>
							<span class="justify-self-end rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap {payTone[s.pay.tone]}">{s.pay.label}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.live-dot {
		animation: pulse 2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.live-dot {
			animation: none;
		}
	}
</style>
