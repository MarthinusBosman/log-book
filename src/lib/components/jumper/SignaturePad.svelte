<script lang="ts">
	import { trimmedSignaturePng } from '#lib/client/signature.ts';
	/** Minimal pointer-events signature pad → PNG data URL (optional; empty string when blank). */
	let { value = $bindable(''), label = 'Signature (optional)' }: { value?: string; label?: string } = $props();
	let canvas: HTMLCanvasElement;
	let drawing = false;
	let dirty = $state(false);

	function ctx() {
		const c = canvas.getContext('2d')!;
		c.lineWidth = 2.2;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.strokeStyle = '#111827';
		return c;
	}
	function pos(e: PointerEvent) {
		const r = canvas.getBoundingClientRect();
		return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height] as const;
	}
	function down(e: PointerEvent) {
		drawing = true;
		canvas.setPointerCapture(e.pointerId);
		const c = ctx();
		c.beginPath();
		c.moveTo(...pos(e));
	}
	function move(e: PointerEvent) {
		if (!drawing) return;
		const c = ctx();
		c.lineTo(...pos(e));
		c.stroke();
		dirty = true;
	}
	function up() {
		if (!drawing) return;
		drawing = false;
		value = dirty ? trimmedSignaturePng(canvas) : '';
	}
	function clear() {
		canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
		dirty = false;
		value = '';
	}
</script>

<div>
	<div class="mb-1.5 flex items-center justify-between">
		<span class="text-sm font-medium">{label}</span>
		{#if dirty}<button type="button" class="text-sm font-medium text-primary hover:underline" onclick={clear}>Clear</button>{/if}
	</div>
	<canvas
		bind:this={canvas}
		width="600"
		height="200"
		class="h-36 w-full touch-none rounded-xl border border-dashed border-border-strong bg-white"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointerleave={up}
		aria-label="Signature pad"
	></canvas>
</div>
