/**
 * Self-service email change (Profile → Security). The user asks for a new address with their
 * current password; we mail a single-use link (1 hour) to the NEW address, and only following it
 * switches `users.email`. The old address gets a heads-up once it's done. One pending change per
 * user: a new request replaces the previous link. See DOMAIN.md → auth/email-change.ts.
 */
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { emailChangeTokens, users } from '../db/schema.ts';
import { DomainError } from '../domain/errors.ts';
import { verifyPassword } from './password.ts';
import { generateToken, hashToken } from './token.ts';
import { normalizeEmail, validateEmail } from './users.ts';

export const EMAIL_CHANGE_LIFETIME_MS = 60 * 60 * 1000;

const TAKEN = 'An account with this email already exists.';

async function addressTaken(db: Database, email: string, exceptUserId: string): Promise<boolean> {
	const rows = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.email, email), ne(users.id, exceptUserId)))
		.limit(1);
	return rows.length > 0;
}

/**
 * Starts a change: checks the password (when the account has one) and the address, replaces any
 * earlier pending link and returns the raw token to mail to `newEmail` (only its hash is stored).
 */
export async function requestEmailChange(
	db: Database,
	input: { userId: string; newEmail: string; password: string; now?: number }
): Promise<{ token: string; newEmail: string; name: string; expiresAt: Date }> {
	const now = input.now ?? Date.now();
	const user = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
	if (!user || user.deletedAt) throw new DomainError('not_found', 'Account not found');
	if (user.passwordHash && !(await verifyPassword(user.passwordHash, input.password)).valid) {
		throw new DomainError('invalid', 'Your current password is incorrect');
	}
	const newEmail = normalizeEmail(input.newEmail);
	const bad = validateEmail(newEmail);
	if (bad) throw new DomainError('invalid', bad);
	if (newEmail === user.email) throw new DomainError('invalid', 'That is already your email address');
	if (await addressTaken(db, newEmail, user.id)) throw new DomainError('conflict', TAKEN);

	await db.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, user.id));
	const token = generateToken(32);
	const expiresAt = new Date(now + EMAIL_CHANGE_LIFETIME_MS);
	await db.insert(emailChangeTokens).values({ id: hashToken(token), userId: user.id, newEmail, expiresAt, createdAt: new Date(now) });
	return { token, newEmail, name: user.name, expiresAt };
}

/** The open (unused, unexpired) change of a user, for the Security tab. */
export async function pendingEmailChange(db: Database, userId: string, now = Date.now()): Promise<{ newEmail: string; expiresAt: Date } | null> {
	const row = (
		await db
			.select({ newEmail: emailChangeTokens.newEmail, expiresAt: emailChangeTokens.expiresAt })
			.from(emailChangeTokens)
			.where(and(eq(emailChangeTokens.userId, userId), isNull(emailChangeTokens.usedAt), gt(emailChangeTokens.expiresAt, new Date(now))))
			.limit(1)
	)[0];
	return row ?? null;
}

export async function cancelEmailChange(db: Database, userId: string): Promise<void> {
	await db.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, userId));
}

async function openToken(db: Database, token: string, now: number) {
	if (!token) return undefined;
	return (
		await db
			.select({ id: emailChangeTokens.id, userId: emailChangeTokens.userId, newEmail: emailChangeTokens.newEmail, oldEmail: users.email, name: users.name, deletedAt: users.deletedAt })
			.from(emailChangeTokens)
			.innerJoin(users, eq(users.id, emailChangeTokens.userId))
			.where(and(eq(emailChangeTokens.id, hashToken(token)), isNull(emailChangeTokens.usedAt), gt(emailChangeTokens.expiresAt, new Date(now))))
			.limit(1)
	)[0];
}

const INVALID_LINK = 'This confirmation link is invalid or has expired. Ask for a new one under Profile → Security.';

/** What the confirmation page shows before the user presses Confirm (null = invalid link). */
export async function peekEmailChange(db: Database, token: string, now = Date.now()): Promise<{ newEmail: string } | null> {
	const row = await openToken(db, token, now);
	return row && !row.deletedAt ? { newEmail: row.newEmail } : null;
}

/** Applies the change (single use). Throws when the link is stale or the address got taken meanwhile. */
export async function confirmEmailChange(
	db: Database,
	token: string,
	now = Date.now()
): Promise<{ userId: string; name: string; oldEmail: string; newEmail: string }> {
	const row = await openToken(db, token, now);
	if (!row || row.deletedAt) throw new DomainError('invalid', INVALID_LINK);
	if (await addressTaken(db, row.newEmail, row.userId)) {
		await db.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, row.userId));
		throw new DomainError('conflict', `${TAKEN} Your email was not changed.`);
	}
	// Mark used first: a second click (or a scanner replaying the POST) finds no open token.
	await db.update(emailChangeTokens).set({ usedAt: new Date(now) }).where(and(eq(emailChangeTokens.id, row.id), isNull(emailChangeTokens.usedAt)));
	await db.update(users).set({ email: row.newEmail, updatedAt: new Date(now) }).where(eq(users.id, row.userId));
	await db.delete(emailChangeTokens).where(and(eq(emailChangeTokens.userId, row.userId), ne(emailChangeTokens.id, row.id)));
	return { userId: row.userId, name: row.name, oldEmail: row.oldEmail, newEmail: row.newEmail };
}
