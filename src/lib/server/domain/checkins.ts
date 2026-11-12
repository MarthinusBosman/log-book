import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { checkins, dropzones, users, type Checkin } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { DomainError, assertFound } from './errors.ts';
import { notify, notifyStatements } from './notifications.ts';
import { runAtomic } from './atomic.ts';
import { localDate } from './time.ts';

/**
 * Close check-ins left open from a previous day (in each DZ's timezone): nobody is "on site" from
 * yesterday. Called from the app's request path (not from the other services), so callers that pass
 * a fixed clock aren't affected. Returns how many were closed.
 */
export async function closeStaleCheckins(db: Database, scope: { dropzoneId?: string; userId?: string }, now = Date.now()): Promise<number> {
	if (!scope.dropzoneId && !scope.userId) return 0;
	const rows = await db
		.select({ id: checkins.id, day: checkins.day, tz: dropzones.timezone })
		.from(checkins)
		.innerJoin(dropzones, eq(dropzones.id, checkins.dropzoneId))
		.where(
			and(
				isNull(checkins.checkedOutAt),
				scope.dropzoneId ? eq(checkins.dropzoneId, scope.dropzoneId) : undefined,
				scope.userId ? eq(checkins.userId, scope.userId) : undefined
			)
		);
	const stale = rows.filter((r) => r.day < localDate(now, r.tz)).map((r) => r.id);
	// D1 binds at most 100 parameters per statement
	for (let i = 0; i < stale.length; i += 90) {
		await db.update(checkins).set({ checkedOutAt: new Date(now) }).where(inArray(checkins.id, stale.slice(i, i + 90)));
	}
	return stale.length;
}

export async function getOpenCheckin(db: Database, dropzoneId: string, userId: string): Promise<Checkin | undefined> {
	return (
		await db
			.select()
			.from(checkins)
			.where(and(eq(checkins.dropzoneId, dropzoneId), eq(checkins.userId, userId), isNull(checkins.checkedOutAt)))
			.limit(1)
	)[0];
}

export async function isCheckedIn(db: Database, dropzoneId: string, userId: string): Promise<boolean> {
	return !!(await getOpenCheckin(db, dropzoneId, userId));
}

/** The user's current open check-in at any dropzone (the original allows one at a time). */
export async function currentCheckin(db: Database, userId: string) {
	return (
		await db
			.select({ checkin: checkins, dropzone: { id: dropzones.id, name: dropzones.name, slug: dropzones.slug } })
			.from(checkins)
			.innerJoin(dropzones, eq(dropzones.id, checkins.dropzoneId))
			.where(and(eq(checkins.userId, userId), isNull(checkins.checkedOutAt)))
			.limit(1)
	)[0];
}

/**
 * Check a jumper in (self, or by staff when `by` differs). Idempotent: returns the open check-in.
 * Self check-in closes any open check-in at another dropzone. Weight defaults to loading weight.
 */
export async function checkIn(
	db: Database,
	input: { dropzoneId: string; userId: string; by?: string | null; weightKg?: number | null; gearRental?: boolean; rentalRigId?: string | null; note?: string | null; now?: number }
): Promise<Checkin> {
	const now = input.now ?? Date.now();
	const existing = await getOpenCheckin(db, input.dropzoneId, input.userId);
	const byStaff = !!input.by && input.by !== input.userId;
	if (existing) {
		if (byStaff && !existing.verified) {
			await db.update(checkins).set({ verified: true, checkedInBy: input.by }).where(eq(checkins.id, existing.id));
			return { ...existing, verified: true, checkedInBy: input.by ?? null };
		}
		return existing;
	}
	const dz = assertFound(
		(await db.select({ name: dropzones.name, tz: dropzones.timezone }).from(dropzones).where(eq(dropzones.id, input.dropzoneId)).limit(1))[0],
		'Dropzone'
	);
	const user = assertFound(
		(await db.select({ w: users.loadingWeightKg, w2: users.weightKg }).from(users).where(eq(users.id, input.userId)).limit(1))[0],
		'User'
	);
	// one open check-in per user: close others
	await db
		.update(checkins)
		.set({ checkedOutAt: new Date(now), checkedOutBy: input.by ?? input.userId })
		.where(and(eq(checkins.userId, input.userId), isNull(checkins.checkedOutAt)));
	const row = {
		id: newId(),
		dropzoneId: input.dropzoneId,
		userId: input.userId,
		day: localDate(now, dz.tz),
		checkedInAt: new Date(now),
		checkedInBy: input.by ?? null,
		weightKg: input.weightKg ?? user.w ?? user.w2 ?? null,
		gearRental: input.gearRental ?? false,
		rentalRigId: input.rentalRigId ?? null,
		verified: byStaff,
		note: input.note ?? null
	};
	await runAtomic(db, [
		db.insert(checkins).values(row),
		...(byStaff
			? notifyStatements(db, {
					userIds: [input.userId],
					type: 'checked_in',
					dropzoneId: input.dropzoneId,
					actorUserId: input.by,
					payload: { dropzoneName: dz.name },
					now
				})
			: [])
	]);
	return (await getOpenCheckin(db, input.dropzoneId, input.userId))!;
}

export async function updateCheckin(
	db: Database,
	checkinId: string,
	patch: { weightKg?: number | null; gearRental?: boolean; rentalRigId?: string | null; verified?: boolean; note?: string | null }
): Promise<void> {
	await db.update(checkins).set(patch).where(eq(checkins.id, checkinId));
}

export async function checkOut(
	db: Database,
	input: { dropzoneId: string; userId: string; by?: string | null; now?: number }
): Promise<boolean> {
	const now = input.now ?? Date.now();
	const open = await getOpenCheckin(db, input.dropzoneId, input.userId);
	if (!open) return false;
	await db
		.update(checkins)
		.set({ checkedOutAt: new Date(now), checkedOutBy: input.by ?? input.userId })
		.where(eq(checkins.id, open.id));
	if (input.by && input.by !== input.userId) {
		const dz = (await db.select({ name: dropzones.name }).from(dropzones).where(eq(dropzones.id, input.dropzoneId)).limit(1))[0];
		await notify(db, {
			userIds: [input.userId],
			type: 'checked_out',
			dropzoneId: input.dropzoneId,
			actorUserId: input.by,
			payload: { dropzoneName: dz?.name },
			now
		});
	}
	return true;
}

/** "Check everyone out". Returns how many were checked out. */
export async function checkOutAll(db: Database, dropzoneId: string, by: string, now = Date.now()): Promise<number> {
	const res = await db
		.update(checkins)
		.set({ checkedOutAt: new Date(now), checkedOutBy: by })
		.where(and(eq(checkins.dropzoneId, dropzoneId), isNull(checkins.checkedOutAt)))
		.returning({ id: checkins.id });
	return res.length;
}

/** Checked-in jumpers with the credential snapshot the manifest needs. */
export async function listCheckedIn(db: Database, dropzoneId: string) {
	return db
		.select({
			checkin: checkins,
			user: {
				id: users.id,
				name: users.name,
				email: users.email,
				licence: users.licence,
				association: users.association,
				associationNumber: users.associationNumber,
				associationExpiry: users.associationExpiry,
				avatarFileId: users.avatarFileId,
				avatar: users.avatar,
				loadingWeightKg: users.loadingWeightKg
			}
		})
		.from(checkins)
		.innerJoin(users, eq(users.id, checkins.userId))
		.where(and(eq(checkins.dropzoneId, dropzoneId), isNull(checkins.checkedOutAt)))
		.orderBy(users.name);
}

export function assertCheckedIn(ok: boolean): void {
	if (!ok) throw new DomainError('not_checked_in', 'Jumper is not checked in');
}
