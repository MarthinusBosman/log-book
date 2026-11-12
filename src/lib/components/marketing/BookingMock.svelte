<script lang="ts">
	/** Tandem booking widget as the customer sees it on the dropzone's public page. */
	const days = [
		{ d: 'Fri', n: 13, off: true },
		{ d: 'Sat', n: 14, active: true },
		{ d: 'Sun', n: 15 },
		{ d: 'Sat', n: 21 }
	];
	const times = [
		{ t: '08:00', left: 0 },
		{ t: '10:00', left: 2, active: true },
		{ t: '12:00', left: 4 },
		{ t: '14:00', left: 1 }
	];
</script>

<div class="rounded-xl border border-border bg-bg/60 p-3.5 text-[12px]" aria-hidden="true">
	<p class="font-semibold">Book a tandem</p>
	<div class="mt-2.5 grid grid-cols-4 gap-1.5">
		{#each days as day (day.d + day.n)}
			<div
				class="rounded-lg border py-1.5 text-center {day.active
					? 'border-primary bg-primary text-primary-fg'
					: day.off
						? 'border-border text-subtle line-through'
						: 'border-border'}"
			>
				<p class="text-[10px] opacity-75">{day.d}</p>
				<p class="font-semibold tabular-nums">{day.n}</p>
			</div>
		{/each}
	</div>
	<div class="mt-2 grid grid-cols-4 gap-1.5">
		{#each times as s (s.t)}
			<div
				class="rounded-lg border px-1 py-1 text-center font-mono tabular-nums {s.active
					? 'border-primary text-primary ring-1 ring-primary'
					: s.left === 0
						? 'border-border text-subtle opacity-60'
						: 'border-border'}"
			>
				{s.t}
				<p class="font-sans text-[9px] text-muted">{s.left === 0 ? 'full' : `${s.left} left`}</p>
			</div>
		{/each}
	</div>
	<div class="mt-3 space-y-1.5 border-t border-border pt-3">
		<div class="flex justify-between"><span class="text-muted">Tandem + handcam video</span><span class="font-mono tabular-nums">R4 150</span></div>
		<div class="flex justify-between"><span class="text-muted">Deposit now (PayFast)</span><span class="font-mono font-semibold tabular-nums">R1 000</span></div>
	</div>
	<div class="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
		<svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4" /></svg>
		<span class="font-medium">Waiver signed · PDF on file</span>
	</div>
</div>
