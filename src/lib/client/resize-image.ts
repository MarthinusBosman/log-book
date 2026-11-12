/**
 * Client-side image re-encoding before upload (avatars, logos, dropzone photos). Storage is metered,
 * so every image is re-encoded in the browser:
 *  - downscaled to `maxSize` on the longest edge,
 *  - encoded as WebP (or JPEG where the browser can't encode WebP; PNG for logos without WebP),
 *  - quality stepped down until it fits `targetBytes`,
 *  - and, because it's redrawn on a canvas, stripped of EXIF/GPS and other metadata
 *    (orientation is applied first).
 *
 * Best effort: any failure (old browser, decode error) returns the original file and the server
 * still validates type and size.
 */
export type ResizeOptions = {
	/** Longest edge in px. */
	maxSize: number;
	/** Try to land under this many bytes by lowering quality (never below `minQuality`). */
	targetBytes?: number;
	/** Starting quality 0–1 (default 0.82). */
	quality?: number;
	minQuality?: number;
	/** Keep transparency (logos): WebP, else PNG. Photos: WebP, else JPEG on a white background. */
	alpha?: boolean;
	/** Force PNG (logos: the PDF renderer can only embed PNG/JPEG). */
	png?: boolean;
};

/** iPhone HEIC/HEIF by name or type (only Safari can decode these). */
export function isHeic(file: File): boolean {
	return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
			return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
		} catch {
			/* fall through to <img> */
		}
	}
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
	} finally {
		URL.revokeObjectURL(url);
	}
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
	new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));

const EXT: Record<string, string> = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };

export async function downscaleImage(file: File, opts: ResizeOptions): Promise<File> {
	const { maxSize, targetBytes, quality = 0.82, minQuality = 0.5, alpha = false, png = false } = opts;
	if (!file.type.startsWith('image/') && !isHeic(file)) return file;
	if (typeof document === 'undefined') return file;
	try {
		const img = await decode(file);
		try {
			const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
			const w = Math.max(1, Math.round(img.width * scale));
			const h = Math.max(1, Math.round(img.height * scale));
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) return file;
			const draw = (opaque: boolean) => {
				ctx.clearRect(0, 0, w, h);
				if (opaque) {
					ctx.fillStyle = '#fff'; // JPEG has no alpha: flatten transparent images onto white
					ctx.fillRect(0, 0, w, h);
				}
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(img.source, 0, 0, w, h);
			};
			draw(!alpha && !png);
			let blob = png ? null : await toBlob(canvas, 'image/webp', quality);
			let type = 'image/webp';
			if (png) {
				type = 'image/png';
				blob = await toBlob(canvas, type, 1);
			} else if (!blob || blob.type !== 'image/webp') {
				// No WebP encoder (older Safari): JPEG for photos, PNG for logos.
				type = alpha ? 'image/png' : 'image/jpeg';
				if (type === 'image/jpeg') draw(true);
				blob = await toBlob(canvas, type, quality);
			}
			if (!blob) return file;
			if (targetBytes && type !== 'image/png') {
				for (let q = quality - 0.08; blob.size > targetBytes && q >= minQuality; q -= 0.08) {
					const smaller = await toBlob(canvas, type, q);
					if (!smaller) break;
					blob = smaller;
				}
			}
			const name = file.name.replace(/\.[^.]+$/, '') + EXT[type];
			return new File([blob], name, { type, lastModified: Date.now() });
		} finally {
			img.close();
		}
	} catch {
		return file;
	}
}

/** Re-encode the file selected in `input` in place (so a normal form submit sends the small one). */
export async function downscaleInput(input: HTMLInputElement, opts: ResizeOptions): Promise<File | null> {
	const file = input.files?.[0];
	if (!file) return null;
	const small = await downscaleImage(file, opts);
	if (small !== file && typeof DataTransfer !== 'undefined') {
		try {
			const dt = new DataTransfer();
			dt.items.add(small);
			input.files = dt.files;
		} catch {
			return file;
		}
	}
	return input.files?.[0] ?? file;
}

/** Sizes per image kind (keep in step with PURPOSE_MAX_BYTES on the server). */
export const IMAGE_PRESETS = {
	avatar: { maxSize: 256, targetBytes: 40 * 1024 },
	// PNG so waiver/tandem PDFs (pdf-lib: PNG/JPEG only) can embed the same file.
	logo: { maxSize: 512, alpha: true, png: true },
	dzPhoto: { maxSize: 1600, targetBytes: 300 * 1024 }
} satisfies Record<string, ResizeOptions>;
