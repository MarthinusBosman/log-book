<script lang="ts">
	/** Logbook entry with a QR code the instructor scans to sign the jump off. */
	import PhoneFrame from './PhoneFrame.svelte';
	let { class: className }: { class?: string } = $props();

	// Deterministic fake QR: finder squares + a seeded pattern. Purely decorative.
	const N = 21;
	let seed = 7;
	const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
	const finder = (x: number, y: number) =>
		[
			[0, 0],
			[N - 7, 0],
			[0, N - 7]
		].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
	const cells: { x: number; y: number }[] = [];
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!finder(x, y) && rnd() > 0.52) cells.push({ x, y });
	const cellPath = cells.map((c) => `M${c.x} ${c.y}h1v1h-1z`).join('');
	const finders = [
		[0, 0],
		[N - 7, 0],
		[0, N - 7]
	];

	const rows = [
		['Dropzone', 'Skydive Robertson'],
		['Aircraft', 'Caravan ZS-SKY'],
		['Exit', '13 500 ft'],
		['Freefall', '58 s'],
		['Jump', '4-way FS · Coach']
	];
</script>

<PhoneFrame class={className}>
	<div class="flex items-center justify-between">
		<p class="text-[11px] text-muted">Logbook</p>
		<p class="text-[11px] text-muted">14 Nov 2026</p>
	</div>
	<p class="text-lg font-semibold tracking-tight">Jump 412</p>

	<dl class="mt-3 divide-y divide-border rounded-xl border border-border bg-surface text-[12px]">
		{#each rows as [k, v] (k)}
			<div class="flex justify-between gap-3 px-3 py-2">
				<dt class="text-muted">{k}</dt>
				<dd class="font-medium">{v}</dd>
			</div>
		{/each}
	</dl>

	<div class="mt-3 rounded-xl border border-border bg-surface p-3 text-center">
		<svg viewBox="-1 -1 {N + 2} {N + 2}" class="mx-auto size-28 rounded-md bg-white p-1 text-[#0b1220]" shape-rendering="crispEdges">
			{#each finders as [fx, fy] (`${fx}-${fy}`)}
				<rect x={fx + 0.5} y={fy + 0.5} width="6" height="6" fill="none" stroke="currentColor" />
				<rect x={fx + 2} y={fy + 2} width="3" height="3" fill="currentColor" />
			{/each}
			<path d={cellPath} fill="currentColor" />
		</svg>
		<p class="mt-2 text-[11px] font-medium">Show this to your coach</p>
		<p class="text-[10px] text-muted">They scan it and sign with their rating</p>
	</div>
</PhoneFrame>
