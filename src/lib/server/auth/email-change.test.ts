import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { emailChangeTokens, users } from '../db/schema.ts';
import { freshDb, makeUser } from '../domain/testing.ts';
import { deleteAccount } from '../domain/account.ts';
import { MemoryStorage } from '../storage/memory.ts';
import { hashPassword } from './password.ts';
import { authenticate, findUserByEmail } from './users.ts';
import { cancelEmailChange, confirmEmailChange, EMAIL_CHANGE_LIFETIME_MS, peekEmailChange, pendingEmailChange, requestEmailChange } from './email-change.ts';

let db: Database;
const PW = 'blue-skies-123';
const T0 = Date.parse('2026-11-14T08:00:00Z');

async function userWithPassword(email = 'old@example.com') {
	return makeUser(db, { email, passwordHash: await hashPassword(PW) });
}

beforeEach(() => {
	db = freshDb();
});

describe('email change', () => {
	test('request → confirm switches the sign-in email; the link is single-use', async () => {
		const u = await userWithPassword();
		const req = await requestEmailChange(db, { userId: u.id, newEmail: ' New@Example.com ', password: PW, now: T0 });
		expect(req.newEmail).toBe('new@example.com');
		expect(await pendingEmailChange(db, u.id, T0)).toMatchObject({ newEmail: 'new@example.com' });
		expect(await peekEmailChange(db, req.token, T0)).toEqual({ newEmail: 'new@example.com' });
		// Not changed until confirmed.
		expect((await findUserByEmail(db, 'old@example.com'))?.id).toBe(u.id);

		const done = await confirmEmailChange(db, req.token, T0 + 60_000);
		expect(done).toMatchObject({ userId: u.id, oldEmail: 'old@example.com', newEmail: 'new@example.com' });
		expect(await findUserByEmail(db, 'old@example.com')).toBeUndefined();
		expect((await authenticate(db, 'new@example.com', PW))?.id).toBe(u.id);
		expect(await pendingEmailChange(db, u.id, T0 + 60_000)).toBeNull();
		await expect(confirmEmailChange(db, req.token, T0 + 120_000)).rejects.toThrow(/invalid or has expired/);
		expect(await peekEmailChange(db, req.token, T0 + 120_000)).toBeNull();
	});

	test('wrong password, same address, bad or placeholder address and taken address are refused', async () => {
		const u = await userWithPassword();
		await makeUser(db, { email: 'taken@example.com' });
		const ask = (newEmail: string, password = PW) => requestEmailChange(db, { userId: u.id, newEmail, password, now: T0 });
		await expect(ask('new@example.com', 'wrong-password')).rejects.toThrow(/current password is incorrect/);
		await expect(ask('OLD@example.com')).rejects.toThrow(/already your email/);
		await expect(ask('not-an-email')).rejects.toThrow(/valid email/);
		await expect(ask('x@deleted.invalid')).rejects.toThrow(/valid email/);
		await expect(ask('taken@example.com')).rejects.toThrow(/already exists/);
		expect(await db.select().from(emailChangeTokens)).toHaveLength(0);
	});

	test('a new request replaces the old link; cancel removes it; links expire after an hour', async () => {
		const u = await userWithPassword();
		const first = await requestEmailChange(db, { userId: u.id, newEmail: 'a@example.com', password: PW, now: T0 });
		const second = await requestEmailChange(db, { userId: u.id, newEmail: 'b@example.com', password: PW, now: T0 });
		await expect(confirmEmailChange(db, first.token, T0)).rejects.toThrow(/invalid or has expired/);
		expect(await pendingEmailChange(db, u.id, T0)).toMatchObject({ newEmail: 'b@example.com' });
		await expect(confirmEmailChange(db, second.token, T0 + EMAIL_CHANGE_LIFETIME_MS + 1)).rejects.toThrow(/invalid or has expired/);
		expect(await pendingEmailChange(db, u.id, T0 + EMAIL_CHANGE_LIFETIME_MS + 1)).toBeNull();

		const third = await requestEmailChange(db, { userId: u.id, newEmail: 'c@example.com', password: PW, now: T0 });
		await cancelEmailChange(db, u.id);
		await expect(confirmEmailChange(db, third.token, T0)).rejects.toThrow(/invalid or has expired/);
	});

	test('address taken between request and confirm: nothing changes, link is dropped', async () => {
		const u = await userWithPassword();
		const req = await requestEmailChange(db, { userId: u.id, newEmail: 'new@example.com', password: PW, now: T0 });
		await makeUser(db, { email: 'new@example.com' });
		await expect(confirmEmailChange(db, req.token, T0)).rejects.toThrow(/already exists/);
		expect((await db.select({ email: users.email }).from(users).where(eq(users.id, u.id)))[0].email).toBe('old@example.com');
		expect(await pendingEmailChange(db, u.id, T0)).toBeNull();
	});

	test('accounts without a password (signed in via a linked account) need no password', async () => {
		const u = await makeUser(db, { email: 'linked@example.com', passwordHash: null });
		const req = await requestEmailChange(db, { userId: u.id, newEmail: 'linked2@example.com', password: '', now: T0 });
		expect((await confirmEmailChange(db, req.token, T0)).newEmail).toBe('linked2@example.com');
	});

	test('deleting the account drops a pending change', async () => {
		const u = await userWithPassword();
		const req = await requestEmailChange(db, { userId: u.id, newEmail: 'new@example.com', password: PW });
		await deleteAccount(db, new MemoryStorage(), u.id);
		expect(await db.select().from(emailChangeTokens)).toHaveLength(0);
		await expect(confirmEmailChange(db, req.token)).rejects.toThrow(/invalid or has expired/);
	});
});
