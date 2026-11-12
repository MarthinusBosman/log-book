<script lang="ts">
	/**
	 * Signature pad: canvas + pointer events (mouse, pen, touch). Keeps the strokes so it can
	 * redraw crisply on resize, and writes a PNG data URL into a hidden input `name`.
	 * The pad is always "paper" (light) with dark ink so the PNG looks right on the PDF.
	 */
	import { onMount } from 'svelte';
	import { cn } from '#lib/ui/cn.ts';
	import { trimmedSignaturePng } from '#lib/client/signature.ts';

	type Point = { x: number; y: number; p: number };
	type Props = {
		name: string;
		label?: string;
		/** Shown under the line, e.g. the signer's name. */
		signer?: string;
		value?: string;
		disabled?: boolean;
		class?: string;
		onchange?: (dataUrl: string) => void;
	};
	let { name, label = 'Signature', signer, value = $bindable(''), disabled = false, class: className, onchange }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let wrap: HTMLDivElement | undefined = $state();
	let strokes: Point[][] = [];
	let current: Point[] | null = null;
	let empty = $state(true);
	const uid = $props.id();

	const INK = '#0b1220';

	function size() {
		if (!canvas || !wrap) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		const r = wrap.getBoundingClientRect();
		canvas.width = Math.round(r.width * dpr);
		canvas.height = Math.round(r.height * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		redraw();
	}

	function drawStroke(ctx: CanvasRenderingContext2D, pts: Point[]) {
		if (pts.length === 0) return;
		ctx.strokeStyle = INK;
		ctx.fillStyle = INK;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		if (pts.length === 1) {
			ctx.beginPath();
			ctx.arc(pts[0].x, pts[0].y, 1.4, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		for (let i = 1; i < pts.length; i++) {
			const a = pts[i - 1];
			const b = pts[i];
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			ctx.lineWidth = 1.2 + 1.6 * (b.p || 0.5);
			ctx.beginPath();
			const prevMid = i > 1 ? { x: (pts[i - 2].x + a.x) / 2, y: (pts[i - 2].y + a.y) / 2 } : a;
			ctx.moveTo(prevMid.x, prevMid.y);
			ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
			ctx.stroke();
		}
	}

	function redraw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d')!;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.restore();
		for (const s of strokes) drawStroke(ctx, s);
		if (current) drawStroke(ctx, current);
	}

	function point(e: PointerEvent): Point {
		const r = canvas!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5 };
	}

	function down(e: PointerEvent) {
		if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
		e.preventDefault();
		canvas!.setPointerCapture(e.pointerId);
		current = [point(e)];
		redraw();
	}
	function move(e: PointerEvent) {
		if (!current) return;
		e.preventDefault();
		const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
		for (const ev of events.length ? events : [e]) current.push(point(ev));
		redraw();
	}
	function up() {
		if (!current) return;
		strokes.push(current);
		current = null;
		empty = false;
		emit();
	}

	/** Export at a fixed, PDF-friendly size with transparent background. */
	function emit() {
		if (!canvas || !wrap) return;
		const r = wrap.getBoundingClientRect();
		const out = document.createElement('canvas');
		const scale = 2;
		out.width = Math.round(r.width * scale);
		out.height = Math.round(r.height * scale);
		const ctx = out.getContext('2d')!;
		ctx.scale(scale, scale);
		for (const s of strokes) drawStroke(ctx, s);
		// Crop to the ink and cap the size: storage is metered, the PDF box is 240×70 pt.
		value = trimmedSignaturePng(out);
		onchange?.(value);
	}

	export function clear() {
		strokes = [];
		current = null;
		empty = true;
		value = '';
		redraw();
		onchange?.('');
	}

	onMount(() => {
		size();
		const ro = new ResizeObserver(() => size());
		if (wrap) ro.observe(wrap);
		return () => ro.disconnect();
	});
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	<div class="flex items-center justify-between">
		<span id="{uid}-label" class="text-sm font-medium text-fg">{label}</span>
		<button
			type="button"
			class="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
			onclick={clear}
			disabled={empty || disabled}>Clear</button
		>
	</div>
	<div
		bind:this={wrap}
		class={cn(
			'relative h-40 w-full overflow-hidden rounded-xl border-2 border-dashed bg-white sm:h-44',
			empty ? 'border-border-strong' : 'border-primary/50',
			disabled && 'opacity-60'
		)}
	>
		<canvas
			bind:this={canvas}
			id="{uid}-canvas"
			class="absolute inset-0 size-full cursor-crosshair touch-none"
			aria-label="{label} — draw your signature"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onpointerleave={(e) => e.buttons === 0 && up()}
		></canvas>
		<div class="pointer-events-none absolute inset-x-5 bottom-9 border-b border-slate-300"></div>
		<span class="pointer-events-none absolute bottom-10 left-5 text-lg text-slate-300">×</span>
		{#if empty}
			<span class="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Sign here with your finger or mouse</span>
		{/if}
		{#if signer}
			<span class="pointer-events-none absolute bottom-2.5 left-5 text-xs font-medium text-slate-500">{signer}</span>
		{/if}
	</div>
	<noscript><p class="text-sm text-warning">Signing needs JavaScript — please enable it to sign.</p></noscript>
	<input type="hidden" {name} {value} />
</div>
