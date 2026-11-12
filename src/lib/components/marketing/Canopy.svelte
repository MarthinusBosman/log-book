<script lang="ts">
	/** Line drawing of a ram-air canopy under a jumper, front view. Decorative. */
	const q = (t: number, a: number, c: number, b: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b;
	const top = (t: number) => ({ x: q(t, 40, 200, 360), y: q(t, 92, 18, 92) });
	const bottom = (t: number) => ({ x: q(t, 44, 200, 356), y: q(t, 128, 62, 128) });
	const cells = 9;
	const ribs = Array.from({ length: cells + 1 }, (_, i) => i / cells);
	// lines go to two riser points (left/right) at the jumper's shoulders
	const riserL = { x: 188, y: 300 };
	const riserR = { x: 212, y: 300 };
</script>

<svg viewBox="0 0 400 380" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M40 92 Q200 18 360 92 L356 128 Q200 62 44 128 Z" stroke-width="1.5" />
	{#each ribs.slice(1, -1) as t (t)}
		{@const a = top(t)}
		{@const b = bottom(t)}
		<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke-width="1" stroke-opacity="0.6" />
	{/each}
	{#each ribs as t (t)}
		{@const b = bottom(t)}
		{@const r = t < 0.5 ? riserL : riserR}
		<line x1={b.x} y1={b.y} x2={r.x} y2={r.y} stroke-width="0.75" stroke-opacity="0.45" />
	{/each}
	<!-- jumper: head + harness, no limbs -->
	<circle cx="200" cy="294" r="6" fill="currentColor" stroke="none" />
	<rect x="193" y="303" width="14" height="24" rx="6" fill="currentColor" fill-opacity="0.85" stroke="none" />
</svg>
