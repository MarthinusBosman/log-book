/**
 * Validation for user-uploaded images (profile pictures, dropzone logos). The browser's declared
 * mime type is only a hint: we sniff the magic bytes so a renamed file can't slip through, and
 * give a specific message for iPhone HEIC photos (browsers other than Safari can't show them).
 */
import { DomainError } from './domain/errors.ts';

export type SniffedImage = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic';

/** Detect PNG / JPEG / WebP / HEIC(F) from the first bytes. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
	const b = bytes;
	if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
	if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	// ISO-BMFF: size(4) 'ftyp' brand(4). HEIC/HEIF/AVIF-likes use these brands.
	if (b.length >= 12 && ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(8, 12))) return 'image/heic';
	return null;
}

const HEIC_MESSAGE =
	'iPhone HEIC photos can’t be used here. Pick the photo again in Safari, or export it as JPG (on iPhone: Settings → Camera → Formats → Most Compatible).';

export function looksLikeHeic(name: string, type: string): boolean {
	return /\.(heic|heif)$/i.test(name) || /image\/hei[cf]/i.test(type);
}

/**
 * Read and validate an uploaded image. Returns the bytes and the SNIFFED mime type.
 * Throws DomainError('invalid') with a friendly message otherwise.
 */
export async function readImageUpload(
	file: FormDataEntryValue | null,
	opts: { maxBytes: number; label?: string; allow?: SniffedImage[] }
): Promise<{ data: Uint8Array; mime: 'image/png' | 'image/jpeg' | 'image/webp' }> {
	const label = opts.label ?? 'Photo';
	if (!(file instanceof File) || file.size === 0) throw new DomainError('invalid', `Choose a ${label.toLowerCase()} to upload`);
	if (looksLikeHeic(file.name, file.type)) throw new DomainError('invalid', HEIC_MESSAGE);
	if (file.size > opts.maxBytes) {
		throw new DomainError('invalid', `${label} must be ${Math.round(opts.maxBytes / 1024 / 1024)} MB or smaller`);
	}
	const data = new Uint8Array(await file.arrayBuffer());
	const kind = sniffImage(data);
	if (kind === 'image/heic') throw new DomainError('invalid', HEIC_MESSAGE);
	const allow = opts.allow ?? ['image/png', 'image/jpeg', 'image/webp'];
	if (!kind || !allow.includes(kind)) throw new DomainError('invalid', 'Use a PNG, JPG or WebP image');
	return { data: stripImageMetadata(data, kind), mime: kind as 'image/png' | 'image/jpeg' | 'image/webp' };
}

// ── metadata stripping (no-JS uploads: the browser normally re-encodes and strips already) ──

/** Drop EXIF/XMP/IPTC/comments (JPEG) and text/time/EXIF chunks (PNG). WebP is left as is. */
export function stripImageMetadata(data: Uint8Array, mime: string): Uint8Array {
	try {
		if (mime === 'image/jpeg') return stripJpeg(data);
		if (mime === 'image/png') return stripPng(data);
	} catch {
		/* malformed: keep the original bytes (already type-checked) */
	}
	return data;
}

/** EXIF orientation (1–8) from a JPEG APP1 segment body, or 1. */
function exifOrientation(seg: Uint8Array): number {
	// seg = "Exif\0\0" + TIFF
	if (seg.length < 14 || String.fromCharCode(...seg.subarray(0, 4)) !== 'Exif') return 1;
	const t = seg.subarray(6);
	const le = t[0] === 0x49;
	const u16 = (o: number) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
	const u32 = (o: number) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16)) + t[o + 3] * 2 ** 24 : t[o] * 2 ** 24 + ((t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]));
	const ifd = u32(4);
	const n = u16(ifd);
	for (let i = 0; i < n; i++) {
		const e = ifd + 2 + i * 12;
		if (e + 12 > t.length) break;
		if (u16(e) === 0x0112) {
			const v = u16(e + 8);
			return v >= 1 && v <= 8 ? v : 1;
		}
	}
	return 1;
}

/** Minimal big-endian EXIF APP1 carrying only the orientation tag. */
function orientationApp1(o: number): Uint8Array {
	const body = [
		...[0x45, 0x78, 0x69, 0x66, 0, 0], // "Exif\0\0"
		...[0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8], // TIFF header, IFD0 at 8
		...[0, 1], // 1 entry
		...[0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0], // Orientation SHORT 1 = o
		...[0, 0, 0, 0] // next IFD
	];
	const len = body.length + 2;
	return new Uint8Array([0xff, 0xe1, len >> 8, len & 255, ...body]);
}

function stripJpeg(d: Uint8Array): Uint8Array {
	if (d[0] !== 0xff || d[1] !== 0xd8) return d;
	const keep: Uint8Array[] = [d.subarray(0, 2)];
	let orientation = 1;
	let scan = false;
	let i = 2;
	while (i + 4 <= d.length) {
		if (d[i] !== 0xff) return d; // not at a marker: give up safely
		const marker = d[i + 1];
		if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
			keep.push(d.subarray(i, i + 2));
			i += 2;
			continue;
		}
		const len = (d[i + 2] << 8) | d[i + 3];
		const end = i + 2 + len;
		if (end > d.length) return d;
		if (marker === 0xda) {
			// start of scan: the rest is image data
			keep.push(d.subarray(i));
			scan = true;
			break;
		}
		const isApp = marker >= 0xe1 && marker <= 0xef && marker !== 0xe2 && marker !== 0xee; // keep APP0 JFIF, APP2 ICC, APP14 Adobe
		if (marker === 0xe1) orientation = Math.max(orientation, exifOrientation(d.subarray(i + 4, end)));
		if (!isApp && marker !== 0xfe) keep.push(d.subarray(i, end));
		i = end;
	}
	if (!scan) return d;
	if (orientation !== 1) keep.splice(1, 0, orientationApp1(orientation));
	const total = keep.reduce((n, k) => n + k.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const k of keep) {
		out.set(k, off);
		off += k.length;
	}
	return out;
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(d: Uint8Array): Uint8Array {
	const keep: Uint8Array[] = [d.subarray(0, 8)];
	let i = 8;
	while (i + 12 <= d.length) {
		const len = ((d[i] << 24) >>> 0) + ((d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]);
		const type = String.fromCharCode(...d.subarray(i + 4, i + 8));
		const end = i + 12 + len;
		if (end > d.length) return d;
		if (!PNG_DROP.has(type)) keep.push(d.subarray(i, end));
		i = end;
		if (type === 'IEND') break;
	}
	const total = keep.reduce((n, k) => n + k.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const k of keep) {
		out.set(k, off);
		off += k.length;
	}
	return out;
}
