/**
 * Crypto helpers for payment providers. WebCrypto + plain JS only, so they run unchanged on Bun and
 * Cloudflare Workers (no node:crypto). MD5 is hand-rolled because WebCrypto has no MD5 (PayFast
 * signatures need it).
 */
const enc = new TextEncoder();

// ── MD5 (RFC 1321) ─────────────────────────────────────────────────────────

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** Lower-case hex MD5 of the UTF-8 bytes of `input`. */
export function md5(input: string | Uint8Array): string {
	const msg = typeof input === 'string' ? enc.encode(input) : input;
	const bitLen = msg.length * 8;
	const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) * 64);
	padded.set(msg);
	padded[msg.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 8, bitLen >>> 0, true);
	view.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);

	let a0 = 0x67452301,
		b0 = 0xefcdab89,
		c0 = 0x98badcfe,
		d0 = 0x10325476;
	const M = new Uint32Array(16);
	for (let off = 0; off < padded.length; off += 64) {
		for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
		let A = a0,
			B = b0,
			C = c0,
			D = d0;
		for (let i = 0; i < 64; i++) {
			let F: number, g: number;
			if (i < 16) {
				F = (B & C) | (~B & D);
				g = i;
			} else if (i < 32) {
				F = (D & B) | (~D & C);
				g = (5 * i + 1) % 16;
			} else if (i < 48) {
				F = B ^ C ^ D;
				g = (3 * i + 5) % 16;
			} else {
				F = C ^ (B | ~D);
				g = (7 * i) % 16;
			}
			F = (F + A + K[i] + M[g]) >>> 0;
			A = D;
			D = C;
			C = B;
			B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
		}
		a0 = (a0 + A) >>> 0;
		b0 = (b0 + B) >>> 0;
		c0 = (c0 + C) >>> 0;
		d0 = (d0 + D) >>> 0;
	}
	const out = new DataView(new ArrayBuffer(16));
	[a0, b0, c0, d0].forEach((w, i) => out.setUint32(i * 4, w, true));
	return toHex(new Uint8Array(out.buffer));
}

// ── HMAC ───────────────────────────────────────────────────────────────────

export type HmacAlg = 'SHA-256' | 'SHA-512';

async function hmacRaw(alg: HmacAlg, key: string | Uint8Array, message: string): Promise<Uint8Array> {
	const keyBytes = typeof key === 'string' ? enc.encode(key) : key;
	const k = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: alg }, false, ['sign']);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

export async function hmacHex(alg: HmacAlg, key: string | Uint8Array, message: string): Promise<string> {
	return toHex(await hmacRaw(alg, key, message));
}

export async function hmacBase64(alg: HmacAlg, key: string | Uint8Array, message: string): Promise<string> {
	return toBase64(await hmacRaw(alg, key, message));
}

// ── encoding / comparison ──────────────────────────────────────────────────

export function toHex(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s;
}

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

/** Returns null for invalid base64. */
export function fromBase64(s: string): Uint8Array | null {
	try {
		return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * PHP `urlencode()`: like encodeURIComponent but spaces → '+', and `! ' ( ) * ~` are encoded too
 * (PHP only leaves `A-Z a-z 0-9 - _ .` alone). PayFast's servers compute signatures this way.
 */
export function phpUrlencode(s: string): string {
	return encodeURIComponent(s)
		.replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
		.replace(/%20/g, '+');
}
