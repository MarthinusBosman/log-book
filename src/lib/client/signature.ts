/**
 * Signature export: crop the drawing to its ink bounds (plus a small margin) and scale it down to
 * fit `maxW × maxH`, as a transparent PNG (pdf-lib embeds PNG/JPEG only). A full-width pad export
 * is ~15–40 KB; a trimmed one is typically 3–8 KB.
 */
export function trimmedSignaturePng(src: HTMLCanvasElement, opts: { maxW?: number; maxH?: number; pad?: number } = {}): string {
	const { maxW = 500, maxH = 160, pad = 4 } = opts;
	const ctx = src.getContext('2d');
	if (!ctx || !src.width || !src.height) return src.toDataURL('image/png');
	const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height);
	let minX = width,
		minY = height,
		maxX = -1,
		maxY = -1;
	for (let y = 0; y < height; y++) {
		const row = y * width * 4;
		for (let x = 0; x < width; x++) {
			if (data[row + x * 4 + 3] > 8) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return '';
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(width - 1, maxX + pad);
	maxY = Math.min(height - 1, maxY + pad);
	const w = maxX - minX + 1;
	const h = maxY - minY + 1;
	const scale = Math.min(1, maxW / w, maxH / h);
	const out = document.createElement('canvas');
	out.width = Math.max(1, Math.round(w * scale));
	out.height = Math.max(1, Math.round(h * scale));
	const o = out.getContext('2d')!;
	o.imageSmoothingQuality = 'high';
	o.drawImage(src, minX, minY, w, h, 0, 0, out.width, out.height);
	return out.toDataURL('image/png');
}
