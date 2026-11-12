import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';

/** Random, URL/cookie-safe token (default 160 bits). */
export function generateToken(bytes = 20): string {
	return encodeBase32LowerCaseNoPadding(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Tokens are stored hashed: a DB leak doesn't leak usable sessions/reset links. */
export function hashToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/** Short, sortable-ish, collision-safe text id for primary keys. */
export function newId(): string {
	return crypto.randomUUID();
}
