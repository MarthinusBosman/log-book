import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db';
import { openSqlite } from '../db/sqlite';
import { sessions, users } from '../db/schema';
import {
	createSession,
	generateSessionToken,
	invalidateAllUserSessions,
	invalidateSession,
	SESSION_LIFETIME_MS,
	validateSessionToken
} from './session';
import { hashToken } from './token';
import {
	authenticate,
	AuthError,
	createPasswordResetToken,
	createUser,
	INVITE_TOKEN_LIFETIME_MS,
	passwordResetTokenInfo,
	resetPassword,
	RESET_TOKEN_LIFETIME_MS
} from './users';

const DAY = 24 * 60 * 60 * 1000;
let db: Database;

beforeEach(() => {
	// Fresh in-memory DB with the real migrations — exercises the same SQL D1 gets.
	db = openSqlite({ path: ':memory:', migrationsFolder: 'drizzle' });
});

async function makeUser(email = 'jumper@example.com') {
	return createUser(db, { email, name: 'Test Jumper', password: 'blue-skies-123' });
}

describe('users', () => {
	test('createUser normalizes email and hashes password', async () => {
		const u = await createUser(db, { email: '  Jumper@Example.COM ', name: ' A ', password: 'blue-skies-123' });
		expect(u.email).toBe('jumper@example.com');
		expect(u.name).toBe('A');
		expect(u.passwordHash).toStartWith('pbkdf2-sha256$');
	});

	test('rejects duplicate email, bad email, weak password', async () => {
		await makeUser();
		await expect(makeUser('JUMPER@example.com')).rejects.toBeInstanceOf(AuthError);
		await expect(createUser(db, { email: 'nope', name: 'x', password: 'blue-skies-123' })).rejects.toThrow(/email/i);
		await expect(createUser(db, { email: 'a@b.co', name: 'x', password: 'short' })).rejects.toThrow(/at least/);
	});

	test('authenticate', async () => {
		await makeUser();
		expect((await authenticate(db, 'JUMPER@example.com', 'blue-skies-123'))?.email).toBe('jumper@example.com');
		expect(await authenticate(db, 'jumper@example.com', 'wrong-password')).toBeNull();
		expect(await authenticate(db, 'ghost@example.com', 'blue-skies-123')).toBeNull();
	});
});

describe('sessions', () => {
	test('token is stored hashed and validates to the user', async () => {
		const user = await makeUser();
		const token = generateSessionToken();
		const s = await createSession(db, token, user.id);
		expect(s.id).toBe(hashToken(token));
		expect(s.id).not.toBe(token);
		const r = await validateSessionToken(db, token);
		expect(r.user?.id).toBe(user.id);
		expect(r.session?.id).toBe(s.id);
	});

	test('unknown token is rejected', async () => {
		expect(await validateSessionToken(db, 'not-a-token')).toEqual({ session: null, user: null });
	});

	test('expired session is rejected and deleted', async () => {
		const user = await makeUser();
		const token = generateSessionToken();
		const t0 = Date.now();
		await createSession(db, token, user.id, {}, t0);
		const r = await validateSessionToken(db, token, t0 + SESSION_LIFETIME_MS + 1);
		expect(r.session).toBeNull();
		expect(await db.select().from(sessions)).toHaveLength(0);
	});

	test('sliding expiry: extends only within the renewal window', async () => {
		const user = await makeUser();
		const token = generateSessionToken();
		const t0 = Date.now();
		const s = await createSession(db, token, user.id, {}, t0);

		// Day 1: no renewal
		const r1 = await validateSessionToken(db, token, t0 + DAY);
		expect(r1.session?.expiresAt.getTime()).toBe(s.expiresAt.getTime());

		// Day 20: inside the last 15 days → renewed to now + 30d, persisted
		const t20 = t0 + 20 * DAY;
		const r2 = await validateSessionToken(db, token, t20);
		expect(r2.session?.expiresAt.getTime()).toBe(t20 + SESSION_LIFETIME_MS);
		const [row] = await db.select().from(sessions).where(eq(sessions.id, s.id));
		expect(row.expiresAt.getTime()).toBe(t20 + SESSION_LIFETIME_MS);

		// Day 45: still valid thanks to renewal (would have expired at day 30)
		expect((await validateSessionToken(db, token, t0 + 45 * DAY)).user?.id).toBe(user.id);
	});

	test('invalidate one / all sessions', async () => {
		const user = await makeUser();
		const [a, b] = [generateSessionToken(), generateSessionToken()];
		const sa = await createSession(db, a, user.id);
		await createSession(db, b, user.id);
		await invalidateSession(db, sa.id);
		expect((await validateSessionToken(db, a)).session).toBeNull();
		expect((await validateSessionToken(db, b)).session).not.toBeNull();
		await invalidateAllUserSessions(db, user.id);
		expect((await validateSessionToken(db, b)).session).toBeNull();
	});
});

describe('password reset', () => {
	test('reset token is single-use, changes password and signs out everywhere', async () => {
		const user = await makeUser();
		const sessionToken = generateSessionToken();
		await createSession(db, sessionToken, user.id);

		const token = await createPasswordResetToken(db, user.id);
		await resetPassword(db, token, 'new-password-456');

		expect(await authenticate(db, user.email, 'blue-skies-123')).toBeNull();
		expect((await authenticate(db, user.email, 'new-password-456'))?.id).toBe(user.id);
		expect((await validateSessionToken(db, sessionToken)).session).toBeNull();
		await expect(resetPassword(db, token, 'another-pass-789')).rejects.toThrow(/invalid or has expired/);
	});

	test('expired reset token is rejected', async () => {
		const user = await makeUser();
		const t0 = Date.now();
		const token = await createPasswordResetToken(db, user.id, t0);
		await expect(resetPassword(db, token, 'new-password-456', t0 + RESET_TOKEN_LIFETIME_MS + 1)).rejects.toThrow(
			/expired/
		);
	});

	test('passwordResetTokenInfo tells an invite (no password yet) from a reset, without using the link', async () => {
		const t0 = Date.now();
		const user = await makeUser();
		const resetToken = await createPasswordResetToken(db, user.id, t0);
		expect(await passwordResetTokenInfo(db, resetToken, t0)).toEqual({ firstPassword: false, email: user.email, name: user.name });

		const invitee = await makeUser('invitee@example.com');
		await db.update(users).set({ passwordHash: null }).where(eq(users.id, invitee.id));
		const invite = await createPasswordResetToken(db, invitee.id, t0, INVITE_TOKEN_LIFETIME_MS);
		expect(await passwordResetTokenInfo(db, invite, t0)).toEqual({ firstPassword: true, email: 'invitee@example.com', name: invitee.name });
		// Still usable after the check, and gone once used.
		await resetPassword(db, invite, 'first-password-1', t0);
		expect(await passwordResetTokenInfo(db, invite, t0)).toBeNull();
		expect(await passwordResetTokenInfo(db, 'not-a-token', t0)).toBeNull();
		expect(await passwordResetTokenInfo(db, '', t0)).toBeNull();
	});

	test('an invitee sets their name with the password; a bad name leaves the link unused', async () => {
		const t0 = Date.now();
		const invitee = await makeUser('pete.pilot@example.com');
		await db.update(users).set({ passwordHash: null, name: 'pete.pilot' }).where(eq(users.id, invitee.id));
		const invite = await createPasswordResetToken(db, invitee.id, t0, INVITE_TOKEN_LIFETIME_MS);
		await expect(resetPassword(db, invite, 'first-password-1', t0, { name: '   ' })).rejects.toThrow(/Enter your name/);
		await expect(resetPassword(db, invite, 'first-password-1', t0, { name: 'x'.repeat(121) })).rejects.toThrow(/Enter your name/);
		expect(await passwordResetTokenInfo(db, invite, t0)).not.toBeNull();
		await resetPassword(db, invite, 'first-password-1', t0, { name: '  Pete Pilot ' });
		const row = (await db.select().from(users).where(eq(users.id, invitee.id)))[0];
		expect(row.name).toBe('Pete Pilot');
		expect((await authenticate(db, invitee.email, 'first-password-1'))?.id).toBe(invitee.id);
	});

	test('invite links last 7 days, reset links an hour', async () => {
		const t0 = Date.now();
		const invitee = await makeUser('invitee@example.com');
		await db.update(users).set({ passwordHash: null }).where(eq(users.id, invitee.id));
		const invite = await createPasswordResetToken(db, invitee.id, t0, INVITE_TOKEN_LIFETIME_MS);
		// The next morning (well past the reset lifetime) the invite still works...
		expect(await passwordResetTokenInfo(db, invite, t0 + DAY)).not.toBeNull();
		expect(await passwordResetTokenInfo(db, invite, t0 + 7 * DAY + 1)).toBeNull();
		await resetPassword(db, invite, 'first-password-1', t0 + DAY);
		expect((await authenticate(db, invitee.email, 'first-password-1'))?.id).toBe(invitee.id);

		const user = await makeUser();
		const reset = await createPasswordResetToken(db, user.id, t0);
		expect(await passwordResetTokenInfo(db, reset, t0 + RESET_TOKEN_LIFETIME_MS + 1)).toBeNull();
	});
});
