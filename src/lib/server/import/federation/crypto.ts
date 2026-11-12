/** WebCrypto helpers for federation (Workers- and Bun-safe). */
const enc = new TextEncoder();
const dec = new TextDecoder();
export type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: Uint8Array | ArrayBuffer): string {
	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of u) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Bytes {
	const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
	const out = new Uint8Array(b.length);
	for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
	return out;
}

export function randomToken(bytes = 32): string {
	return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(data: string | Bytes): Promise<Bytes> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
}

export async function sha256b64(data: string): Promise<string> {
	return b64url(await sha256(data));
}

async function hmacKey(key: Bytes) {
	return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmac(key: Bytes, data: string): Promise<string> {
	return b64url(await crypto.subtle.sign('HMAC', await hmacKey(key), enc.encode(data)));
}

export async function hmacVerify(key: Bytes, data: string, sig: string): Promise<boolean> {
	try {
		return await crypto.subtle.verify('HMAC', await hmacKey(key), fromB64url(sig), enc.encode(data));
	} catch {
		return false;
	}
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

/** Compact signed token: `b64url(json).sig` (HMAC-SHA256). */
export async function signToken(key: Bytes, payload: Record<string, unknown>): Promise<string> {
	const body = b64url(enc.encode(JSON.stringify(payload)));
	return `${body}.${await hmac(key, body)}`;
}

/** Decode without verifying (to find which key to verify with). */
export function peekToken<T = Record<string, unknown>>(token: string): T | null {
	const [body] = token.split('.');
	try {
		return JSON.parse(dec.decode(fromB64url(body))) as T;
	} catch {
		return null;
	}
}

export async function verifyToken<T = Record<string, unknown>>(key: Bytes, token: string): Promise<T | null> {
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra !== undefined) return null;
	if (!(await hmacVerify(key, body, sig))) return null;
	return peekToken<T>(token);
}

async function aesKey(secret: Bytes) {
	return crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM with a 32-byte key; output `iv.ciphertext` (b64url). */
export async function encrypt(key: Bytes, plain: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), enc.encode(plain));
	return `${b64url(iv)}.${b64url(ct)}`;
}

export async function decrypt(key: Bytes, data: string): Promise<string | null> {
	const [iv, ct] = data.split('.');
	try {
		return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(key), fromB64url(ct)));
	} catch {
		return null;
	}
}

/** PKCE S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
	return b64url(await sha256(verifier));
}
