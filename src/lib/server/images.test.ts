import { describe, expect, test } from 'bun:test';
import { looksLikeHeic, readImageUpload, sniffImage, stripImageMetadata } from './images.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const WEBP = ascii('RIFF\0\0\0\0WEBPVP8 ');
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypheic'), 0, 0, 0, 0]);

describe('sniffImage', () => {
	test('detects png, jpeg, webp and heic by magic bytes', () => {
		expect(sniffImage(PNG)).toBe('image/png');
		expect(sniffImage(JPG)).toBe('image/jpeg');
		expect(sniffImage(WEBP)).toBe('image/webp');
		expect(sniffImage(HEIC)).toBe('image/heic');
		expect(sniffImage(ascii('<svg xmlns='))).toBeNull();
		expect(sniffImage(new Uint8Array())).toBeNull();
	});
	test('looksLikeHeic by name or type', () => {
		expect(looksLikeHeic('IMG_0001.HEIC', '')).toBe(true);
		expect(looksLikeHeic('a.jpg', 'image/heif')).toBe(true);
		expect(looksLikeHeic('a.jpg', 'image/jpeg')).toBe(false);
	});
});

describe('readImageUpload', () => {
	const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });
	test('returns the sniffed mime, not the declared one', async () => {
		const r = await readImageUpload(file(PNG, 'me.jpg', 'image/jpeg'), { maxBytes: 1024 });
		expect(r.mime).toBe('image/png');
	});
	test('rejects HEIC (by name and by content) with a helpful message', async () => {
		await expect(readImageUpload(file(HEIC, 'IMG.heic', 'image/heic'), { maxBytes: 1024 })).rejects.toThrow(/HEIC/);
		await expect(readImageUpload(file(HEIC, 'photo.jpg', 'image/jpeg'), { maxBytes: 1024 })).rejects.toThrow(/HEIC/);
	});
	test('rejects non-images, empty and oversized files', async () => {
		await expect(readImageUpload(file(ascii('<svg/>'), 'x.png', 'image/png'), { maxBytes: 1024 })).rejects.toThrow(/PNG, JPG or WebP/);
		await expect(readImageUpload(null, { maxBytes: 1024 })).rejects.toThrow(/Choose/);
		await expect(readImageUpload(file(new Uint8Array(2048).fill(0xff), 'big.jpg', 'image/jpeg'), { maxBytes: 1024 })).rejects.toThrow(/or smaller/);
	});
});

describe('stripImageMetadata', () => {
	const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
	// Little-endian EXIF with Orientation = 6 and a fake GPS blob
	const exifLE = [...ascii('Exif\0\0'), 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, ...ascii('GPS 51.5N 0.1W secret')];
	const jpeg = new Uint8Array([
		0xff, 0xd8,
		...seg(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
		...seg(0xe1, exifLE),
		...seg(0xed, [...ascii('Photoshop 3.0 IPTC')]),
		...seg(0xfe, [...ascii('comment')]),
		...seg(0xdb, new Array(65).fill(1)),
		...seg(0xda, [1, 2, 3]),
		9, 9, 9, 0xff, 0xd9
	]);
	test('JPEG: drops EXIF/IPTC/comments, keeps image segments and orientation only', () => {
		const out = stripImageMetadata(jpeg, 'image/jpeg');
		const text = String.fromCharCode(...out);
		expect(text).not.toContain('GPS');
		expect(text).not.toContain('IPTC');
		expect(text).not.toContain('comment');
		expect(text).toContain('JFIF');
		expect(out.length).toBeLessThan(jpeg.length);
		// minimal APP1 (big-endian) right after SOI with Orientation 6
		expect([...out.subarray(2, 4)]).toEqual([0xff, 0xe1]);
		expect(text).toContain('Exif');
		expect(out[2 + 4 + 6 + 8 + 2 + 9]).toBe(6);
		// image data preserved
		expect([...out.subarray(out.length - 5)]).toEqual([9, 9, 9, 0xff, 0xd9]);
	});
	test('PNG: drops text/time/exif chunks', () => {
		const chunk = (type: string, body: number[]) => [0, 0, body.length >> 8, body.length & 255, ...ascii(type), ...body, 0, 0, 0, 0];
		const png = new Uint8Array([...PNG.subarray(0, 8), ...chunk('IHDR', new Array(13).fill(0)), ...chunk('tEXt', [...ascii('Author\0Me')]), ...chunk('IDAT', [1, 2]), ...chunk('IEND', [])]);
		const out = stripImageMetadata(png, 'image/png');
		expect(String.fromCharCode(...out)).not.toContain('Author');
		expect(String.fromCharCode(...out)).toContain('IDAT');
		expect(out.length).toBe(png.length - 12 - 9);
	});
	test('malformed or other types are returned unchanged', () => {
		expect(stripImageMetadata(WEBP, 'image/webp')).toBe(WEBP);
		const bad = new Uint8Array([0xff, 0xd8, 0x00, 0x11]);
		expect(stripImageMetadata(bad, 'image/jpeg')).toBe(bad);
	});
});
