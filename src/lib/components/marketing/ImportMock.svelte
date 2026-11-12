<script lang="ts">
	/** "Switching from Jump Master?" — the import preview a jumper sees before confirming. */
	const steps = [
		{ label: 'Signed in to Jump Master', done: true },
		{ label: 'Read logbook, gear and ratings', done: true },
		{ label: 'Preview', current: true }
	];
	const counts = [
		{ n: '412', label: 'jumps' },
		{ n: '2', label: 'rigs' },
		{ n: '3', label: 'ratings' }
	];
	const sample = [
		{ n: 412, date: '14 Nov', dz: 'Skydive Robertson', type: '4-way FS' },
		{ n: 411, date: '14 Nov', dz: 'Skydive Robertson', type: '4-way FS' },
		{ n: 410, date: '8 Nov', dz: 'Skydive Pretoria', type: 'Freefly' }
	];
</script>

<div class="rounded-2xl border border-border bg-surface p-5 shadow-2xl shadow-black/10 dark:shadow-black/40" aria-hidden="true">
	<ol class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
		{#each steps as s, i (s.label)}
			<li class="flex items-center gap-2 {s.current ? 'font-medium text-fg' : 'text-muted'}">
				<span
					class="grid size-5 place-items-center rounded-full text-[10px] font-semibold {s.done
						? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
						: 'bg-primary text-primary-fg'}"
				>
					{#if s.done}
						<svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
					{:else}{i + 1}{/if}
				</span>
				{s.label}
			</li>
		{/each}
	</ol>

	<div class="mt-5 grid grid-cols-3 gap-2">
		{#each counts as c (c.label)}
			<div class="rounded-xl border border-border bg-bg/50 px-3 py-2.5">
				<p class="font-mono text-xl font-semibold tabular-nums">{c.n}</p>
				<p class="text-[12px] text-muted">{c.label}</p>
			</div>
		{/each}
	</div>

	<div class="mt-4 overflow-hidden rounded-xl border border-border text-[12px]">
		{#each sample as j (j.n)}
			<div class="grid grid-cols-[3rem_3.5rem_1fr_auto] gap-2 border-b border-border px-3 py-2 last:border-0">
				<span class="font-mono text-muted tabular-nums">#{j.n}</span>
				<span class="text-muted">{j.date}</span>
				<span class="truncate">{j.dz}</span>
				<span class="text-muted">{j.type}</span>
			</div>
		{/each}
		<div class="bg-surface-2/50 px-3 py-2 text-muted">+ 409 more · 0 duplicates</div>
	</div>

	<div class="mt-4 flex items-center justify-between gap-3">
		<p class="text-[12px] text-muted">Run it again later; nothing gets doubled.</p>
		<span class="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium whitespace-nowrap text-primary-fg">Import 412 jumps</span>
	</div>
</div>
