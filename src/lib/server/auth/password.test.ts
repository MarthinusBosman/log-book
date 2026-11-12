import { describe, expect, test } from 'bun:test';
import {
	hashPassword,
	PBKDF2_ITERATIONS,
	validatePasswordStrength,
	verifyPassword
} from './password';

describe('password hashing (PBKDF2-SHA256 via WebCrypto)', () => {
	test('hash has versioned format with >=100k iterations', async () => {
		const hash = await hashPassword('correct horse battery staple');
		const [alg, iter, salt, key] = hash.split('$');
		expect(alg).toBe('pbkdf2-sha256');
		expect(Number(iter)).toBe(PBKDF2_ITERATIONS);
		expect(Number(iter)).toBeGreaterThanOrEqual(100_000);
		expect(salt.length).toBeGreaterThan(0);
		expect(key.length).toBeGreaterThan(0);
	});

	test('verifies the correct password and rejects a wrong one', async () => {
		const hash = await hashPassword('s3cret-pass');
		expect(await verifyPassword(hash, 's3cret-pass')).toEqual({ valid: true, needsRehash: false });
		expect((await verifyPassword(hash, 's3cret-Pass')).valid).toBe(false);
		expect((await verifyPassword(hash, '')).valid).toBe(false);
	});

	test('uses a random salt (same password → different hashes)', async () => {
		const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
		expect(a).not.toBe(b);
		expect((await verifyPassword(a, 'same')).valid).toBe(true);
		expect((await verifyPassword(b, 'same')).valid).toBe(true);
	});

	test('normalizes unicode (NFKC) so equivalent inputs match', async () => {
		const hash = await hashPassword('caf\u00e9-pässword');
		expect((await verifyPassword(hash, 'cafe\u0301-pa\u0308ssword')).valid).toBe(true);
	});

	test('rejects malformed / unknown-algorithm hashes without throwing', async () => {
		for (const bad of ['', 'garbage', 'bcrypt$10$abc$def', 'pbkdf2-sha256$x$abc$def', 'pbkdf2-sha256$100000$!!$!!']) {
			expect((await verifyPassword(bad, 'pw')).valid).toBe(false);
		}
	});

	test('flags hashes with fewer iterations for rehash', async () => {
		// Build a legacy hash with 1000 iterations by hand.
		const { encodeBase64 } = await import('@oslojs/encoding');
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('legacy'), 'PBKDF2', false, ['deriveBits']);
		const bits = new Uint8Array(
			await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, key, 256)
		);
		const legacy = `pbkdf2-sha256$1000$${encodeBase64(salt)}$${encodeBase64(bits)}`;
		expect(await verifyPassword(legacy, 'legacy')).toEqual({ valid: true, needsRehash: true });
	});

	test('password strength rules', () => {
		expect(validatePasswordStrength('short')).not.toBeNull();
		expect(validatePasswordStrength('long-enough')).toBeNull();
		expect(validatePasswordStrength('x'.repeat(300))).not.toBeNull();
	});
});
