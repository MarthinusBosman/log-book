import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db';
import { passwordResetTokens, users, type User } from '../db/schema';
import { isPlaceholderEmail } from '../email/types.ts';
import { hashPassword, validatePasswordStrength, verifyPassword } from './password';
import { invalidateAllUserSessions } from './session';
import { generateToken, hashToken, newId } from './token';

export const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
	if (!email || email.length > 254 || !EMAIL_RE.test(email)) return 'Enter a valid email address.';
	// Our own placeholders (deleted accounts, imported people) end in `.invalid`: never a real address.
	if (isPlaceholderEmail(email)) return 'Enter a valid email address.';
	return null;
}

export class AuthError extends Error {
	constructor(
		message: string,
		readonly field?: string
	) {
		super(message);
	}
}

/** Live accounts only: a deleted account's tombstone can't sign in or reset its password. */
export async function findUserByEmail(db: Database, email: string): Promise<User | undefined> {
	const rows = await db
		.select()
		.from(users)
		.where(and(eq(users.email, normalizeEmail(email)), isNull(users.deletedAt)))
		.limit(1);
	return rows[0];
}

export async function createUser(
	db: Database,
	input: { email: string; name: string; password: string; phone?: string | null }
): Promise<User> {
	const email = normalizeEmail(input.email);
	const name = input.name.trim();
	const emailErr = validateEmail(email);
	if (emailErr) throw new AuthError(emailErr, 'email');
	if (!name || name.length > 120) throw new AuthError('Enter your name.', 'name');
	const pwErr = validatePasswordStrength(input.password);
	if (pwErr) throw new AuthError(pwErr, 'password');
	if (await findUserByEmail(db, email)) {
		throw new AuthError('An account with this email already exists.', 'email');
	}
	const rows = await db
		.insert(users)
		.values({
			id: newId(),
			email,
			name,
			phone: input.phone?.trim() || null,
			passwordHash: await hashPassword(input.password),
			createdAt: new Date()
		})
		.returning();
	return rows[0];
}

// Pre-computed dummy hash so unknown emails take as long as wrong passwords.
let dummyHash: Promise<string> | undefined;

/** Returns the user on success, or null. Constant-ish time for unknown emails. */
export async function authenticate(
	db: Database,
	email: string,
	password: string
): Promise<User | null> {
	const user = await findUserByEmail(db, email);
	if (!user?.passwordHash) {
		await verifyPassword(await (dummyHash ??= hashPassword('dummy-password')), password);
		return null;
	}
	const { valid, needsRehash } = await verifyPassword(user.passwordHash, password);
	if (!valid) return null;
	if (needsRehash) {
		await db
			.update(users)
			.set({ passwordHash: await hashPassword(password) })
			.where(eq(users.id, user.id));
	}
	return user;
}

/** Creates a single-use reset token. Returns the raw token (to email) — only its hash is stored. */
export async function createPasswordResetToken(
	db: Database,
	userId: string,
	now = Date.now()
): Promise<string> {
	await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
	const token = generateToken(32);
	await db.insert(passwordResetTokens).values({
		id: hashToken(token),
		userId,
		expiresAt: new Date(now + RESET_TOKEN_LIFETIME_MS),
		createdAt: new Date(now)
	});
	return token;
}

/** Consumes a reset token, sets the new password and signs out all sessions. */
export async function resetPassword(
	db: Database,
	token: string,
	newPassword: string,
	now = Date.now()
): Promise<string> {
	const pwErr = validatePasswordStrength(newPassword);
	if (pwErr) throw new AuthError(pwErr, 'password');
	const id = hashToken(token);
	const rows = await db
		.select()
		.from(passwordResetTokens)
		.where(
			and(
				eq(passwordResetTokens.id, id),
				isNull(passwordResetTokens.usedAt),
				gt(passwordResetTokens.expiresAt, new Date(now))
			)
		)
		.limit(1);
	const row = rows[0];
	if (!row) throw new AuthError('This reset link is invalid or has expired.');
	await db
		.update(passwordResetTokens)
		.set({ usedAt: new Date(now) })
		.where(eq(passwordResetTokens.id, id));
	await db
		.update(users)
		.set({ passwordHash: await hashPassword(newPassword) })
		.where(eq(users.id, row.userId));
	await invalidateAllUserSessions(db, row.userId);
	return row.userId;
}
