/**
 * Password hashing that runs everywhere (Cloudflare Workers, Bun, Node, browsers):
 * WebCrypto PBKDF2-HMAC-SHA256 with a random 16-byte salt.
 *
 * Stored format (versioned so we can migrate algorithms later):
 *   pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
 *
 * Note: Cloudflare Workers caps PBKDF2 at 100 000 iterations, so that is our ceiling.
 */
import { decodeBase64, encodeBase64 } from '@oslojs/encoding';

const ALGORITHM = 'pbkdf2-sha256';
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password.normalize('NFKC')),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		KEY_BITS
	);
	return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, PBKDF2_ITERATIONS);
	return `${ALGORITHM}$${PBKDF2_ITERATIONS}$${encodeBase64(salt)}$${encodeBase64(hash)}`;
}

export type VerifyResult = { valid: boolean; needsRehash: boolean };

export async function verifyPassword(stored: string, password: string): Promise<VerifyResult> {
	const parts = stored.split('$');
	if (parts.length !== 4 || parts[0] !== ALGORITHM) return { valid: false, needsRehash: false };
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) {
		return { valid: false, needsRehash: false };
	}
	let salt: Uint8Array, expected: Uint8Array;
	try {
		salt = decodeBase64(parts[2]);
		expected = decodeBase64(parts[3]);
	} catch {
		return { valid: false, needsRehash: false };
	}
	const actual = await derive(password, salt, iterations);
	const valid = timingSafeEqual(actual, expected);
	return { valid, needsRehash: valid && iterations < PBKDF2_ITERATIONS };
}

/** Returns an error message, or null if the password is acceptable. */
export function validatePasswordStrength(password: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH)
		return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
	if (password.length > PASSWORD_MAX_LENGTH)
		return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
	return null;
}
