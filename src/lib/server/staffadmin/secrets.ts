/**
 * Symmetric encryption for stored provider secrets (AES-256-GCM via WebCrypto — works on Bun and
 * Workers). Format: `v1:<iv b64>:<ciphertext b64>`. The key is SHA-256 of the `SECRETS_KEY` env var.
 */
const DEV_KEY = 'dev-only-insecure-secrets-key';
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(secret: string): Promise<CryptoKey> {
	const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret || DEV_KEY));
	return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function usingDevKey(secret: string | undefined): boolean {
	return !secret;
}

export async function encryptSecret(plain: string, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(secret), enc.encode(plain)));
	return `v1:${b64(iv)}:${b64(ct)}`;
}

/** Returns null when the value can't be decrypted (wrong key / corrupted). */
export async function decryptSecret(stored: string, secret: string): Promise<string | null> {
	const [v, iv, ct] = stored.split(':');
	if (v !== 'v1' || !iv || !ct) return null;
	try {
		const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await importKey(secret), unb64(ct));
		return dec.decode(out);
	} catch {
		return null;
	}
}

/** UI mask: keep the last 4 characters. */
export function maskSecret(plain: string | null | undefined): string | null {
	if (!plain) return null;
	if (plain.length <= 4) return '••••';
	return `${'•'.repeat(Math.min(12, plain.length - 4))}${plain.slice(-4)}`;
}
