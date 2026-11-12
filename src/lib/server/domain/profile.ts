import { and, eq, like, ne, or } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { sessions, userRatings, users, type User, type UserRating } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../auth/password.ts';
import { ASSOCIATIONS, type RatingBody } from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';
import { dobProblem, isIsoDate } from './time.ts';

export type ProfilePatch = Partial<
	Pick<
		User,
		| 'name'
		| 'phone'
		| 'address'
		| 'dob'
		| 'emergencyName'
		| 'emergencyPhone'
		| 'marketingOptIn'
		| 'avatarFileId'
		| 'avatar'
		| 'association'
		| 'associationNumber'
		| 'associationExpiry'
		| 'licence'
		| 'declaredJumpCount'
		| 'weightKg'
		| 'loadingWeightKg'
	>
>;

/** Update profile + credentials ("Credentials updated successfully"). */
export async function updateProfile(db: Database, userId: string, patch: ProfilePatch, now = Date.now()): Promise<User> {
	if (patch.name !== undefined && !patch.name.trim()) throw new DomainError('invalid', 'Full name is required');
	const dobError = patch.dob != null ? dobProblem(patch.dob, now) : null;
	if (dobError) throw new DomainError('invalid', dobError);
	if (patch.associationExpiry != null && !isIsoDate(patch.associationExpiry)) throw new DomainError('invalid', 'Membership expiry must be a valid date');
	if (patch.association != null && !ASSOCIATIONS.includes(patch.association)) throw new DomainError('invalid', 'Unknown association');
	for (const k of ['weightKg', 'loadingWeightKg'] as const) {
		const v = patch[k];
		if (v != null && (v <= 0 || v > 300)) throw new DomainError('invalid', 'Weight must be between 0 and 300 kg');
	}
	if (patch.declaredJumpCount != null && (!Number.isInteger(patch.declaredJumpCount) || patch.declaredJumpCount < 0)) {
		throw new DomainError('invalid', 'Number of jumps must be ≥ 0');
	}
	return assertFound((await db.update(users).set({ ...patch, updatedAt: new Date(now) }).where(eq(users.id, userId)).returning())[0], 'User');
}

export type MembershipState = { status: 'none' | 'valid' | 'expiring' | 'expired'; expiry: string | null; daysLeft: number | null };

/** Pure: association membership status on a date (expiring = within 30 days). */
export function membershipStatus(user: Pick<User, 'association' | 'associationExpiry'>, today: string): MembershipState {
	if (!user.association || !user.associationExpiry) return { status: 'none', expiry: user.associationExpiry ?? null, daysLeft: null };
	const daysLeft = Math.round((Date.parse(`${user.associationExpiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
	return { status: daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'valid', expiry: user.associationExpiry, daysLeft };
}

export async function listRatings(db: Database, userId: string): Promise<UserRating[]> {
	return db.select().from(userRatings).where(eq(userRatings.userId, userId)).orderBy(userRatings.body, userRatings.rating);
}

/** Replace all ratings of one body (e.g. after a PASA/USPA lookup). */
export async function setRatings(
	db: Database,
	userId: string,
	body: RatingBody,
	ratings: { rating: string; value?: string | null; expiresOn?: string | null }[],
	opts: { verified?: boolean; now?: number } = {}
): Promise<void> {
	const now = opts.now ?? Date.now();
	await db.delete(userRatings).where(and(eq(userRatings.userId, userId), eq(userRatings.body, body)));
	for (const r of ratings) {
		if (r.expiresOn && !isIsoDate(r.expiresOn)) throw new DomainError('invalid', 'Rating expiry must be YYYY-MM-DD');
		await db
			.insert(userRatings)
			.values({
				id: newId(),
				userId,
				body,
				rating: r.rating,
				value: r.value ?? null,
				expiresOn: r.expiresOn ?? null,
				verifiedAt: opts.verified ? new Date(now) : null
			})
			.onConflictDoNothing();
	}
}

/** Self-declared rating (unverified). Upserts on (body, rating) without touching verified ratings. */
export async function addRating(
	db: Database,
	userId: string,
	input: { body: RatingBody; rating: string; expiresOn?: string | null; value?: string | null }
): Promise<UserRating> {
	const rating = input.rating.trim();
	if (!rating) throw new DomainError('invalid', 'Rating name is required');
	if (rating.length > 60) throw new DomainError('invalid', 'Rating name is too long');
	if (input.expiresOn && !isIsoDate(input.expiresOn)) throw new DomainError('invalid', 'Rating expiry must be YYYY-MM-DD');
	const existing = (
		await db
			.select()
			.from(userRatings)
			.where(and(eq(userRatings.userId, userId), eq(userRatings.body, input.body), eq(userRatings.rating, rating)))
			.limit(1)
	)[0];
	if (existing?.verifiedAt) throw new DomainError('conflict', 'This rating was verified with your association and can’t be edited here');
	if (existing) {
		return (
			await db
				.update(userRatings)
				.set({ expiresOn: input.expiresOn ?? null, value: input.value ?? existing.value })
				.where(eq(userRatings.id, existing.id))
				.returning()
		)[0];
	}
	return (
		await db
			.insert(userRatings)
			.values({ id: newId(), userId, body: input.body, rating, value: input.value ?? null, expiresOn: input.expiresOn ?? null, verifiedAt: null })
			.returning()
	)[0];
}

/** Remove one of the user's own unverified ratings. */
export async function removeRating(db: Database, userId: string, ratingId: string): Promise<void> {
	const r = assertFound(
		(await db.select().from(userRatings).where(and(eq(userRatings.id, ratingId), eq(userRatings.userId, userId))).limit(1))[0],
		'Rating'
	);
	if (r.verifiedAt) throw new DomainError('conflict', 'Verified ratings are managed by your association');
	await db.delete(userRatings).where(eq(userRatings.id, r.id));
}

/** Search users by name/email (staff pickers, team manager). */
export async function searchUsers(db: Database, q: string, limit = 20) {
	const term = `%${q.trim()}%`;
	return db
		.select({ id: users.id, name: users.name, avatar: users.avatar, email: users.email, licence: users.licence })
		.from(users)
		.where(or(like(users.name, term), like(users.email, term)))
		.orderBy(users.name)
		.limit(limit);
}

/**
 * Change password after checking the current one. Signs out every other session
 * (`keepSessionId` stays valid). Throws `invalid` with a user-facing message.
 */
export async function changePassword(
	db: Database,
	input: { userId: string; current: string; next: string; keepSessionId?: string | null; now?: number }
): Promise<void> {
	const user = assertFound((await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0], 'User');
	if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.current)).valid) {
		throw new DomainError('invalid', 'Your current password is incorrect');
	}
	const weak = validatePasswordStrength(input.next);
	if (weak) throw new DomainError('invalid', weak);
	if (input.next === input.current) throw new DomainError('invalid', 'Choose a password you haven’t used here before');
	await db
		.update(users)
		.set({ passwordHash: await hashPassword(input.next), updatedAt: new Date(input.now ?? Date.now()) })
		.where(eq(users.id, user.id));
	await db
		.delete(sessions)
		.where(and(eq(sessions.userId, user.id), input.keepSessionId ? ne(sessions.id, input.keepSessionId) : undefined));
}
