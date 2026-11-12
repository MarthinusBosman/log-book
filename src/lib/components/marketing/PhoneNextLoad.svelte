<script lang="ts">
	/** Jumper's phone on the hero: their next load and the jump that just landed in the logbook. */
	import PhoneFrame from './PhoneFrame.svelte';
	let { class: className }: { class?: string } = $props();
</script>

<PhoneFrame class={className}>
	<p class="text-[11px] text-muted">Skydive Robertson</p>
	<p class="text-lg font-semibold tracking-tight">Morning, Naledi</p>

	<div class="mt-3 rounded-2xl bg-primary p-3.5 text-white shadow-lg shadow-primary/30">
		<div class="flex items-center justify-between text-[11px] font-medium text-white/75">
			<span>You're on</span><span class="font-mono">Slot 2</span>
		</div>
		<p class="mt-0.5 text-xl font-semibold tracking-tight">Load 7</p>
		<div class="mt-2 flex items-end justify-between">
			<p class="text-[11px] text-white/80">Caravan · 13 500 ft<br />4-way with Kim, Ruan, Jo</p>
			<p class="font-mono text-2xl leading-none font-semibold tabular-nums">12<span class="text-xs">m</span></p>
		</div>
	</div>

	<div class="mt-3 grid grid-cols-2 gap-2 text-[11px]">
		<div class="rounded-xl border border-border bg-surface p-2.5">
			<p class="text-muted">Wallet</p>
			<p class="mt-0.5 font-mono text-sm font-semibold tabular-nums">R1 240</p>
		</div>
		<div class="rounded-xl border border-border bg-surface p-2.5">
			<p class="text-muted">Reserve</p>
			<p class="mt-0.5 text-sm font-semibold">142 days</p>
		</div>
	</div>

	<p class="mt-4 mb-2 text-[11px] font-medium tracking-wider text-subtle uppercase">Logbook</p>
	<div class="rounded-xl border border-border bg-surface p-3">
		<div class="flex items-center justify-between">
			<p class="text-sm font-semibold">Jump 411</p>
			<span class="rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Signed</span>
		</div>
		<p class="mt-1 text-[11px] text-muted">Load 3 · 13 500 ft · 58 s · 4-way FS</p>
	</div>
</PhoneFrame>
