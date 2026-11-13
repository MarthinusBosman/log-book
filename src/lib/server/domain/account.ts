/**
 * Self-service account deletion (POPIA right to deletion), see DOMAIN.md → Account deletion.
 *
 * The `users` row is never deleted: wallet accounts and ledger entries (cascade), check-ins
 * (cascade) and other dropzone records point at it, and the dropzone must keep those. Instead the
 * row becomes an anonymous tombstone (`deletedAt`, placeholder name, unique placeholder email so
 * the real address can sign up again) and everything that is the user's alone is deleted.
 */
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	aircraft,
	checkins,
	dropzoneFollows,
	dropzoneMemberRoles,
	dropzoneMembers,
	dropzones,
	emailChangeTokens,
	federationOutbox,
	feedbackSubmissions,
	files,
	gearServiceEvents,
	importJobs,
	indemnitySignatures,
	ledgerEntries,
	linkedAccounts,
	loads,
	logbookJumps,
	membershipChecks,
	notifications,
	passwordResetTokens,
	payments,
	rigs,
	sessions,
	slots,
	tandemPassengers,
	teamMembers,
	teams,
	userBuddies,
	userRatings,
	users,
	walletAccounts
} from '../db/schema.ts';
import type { Storage } from '../storage/types.ts';
import { runAtomic, type Statement } from './atomic.ts';
import { DomainError } from './errors.ts';

export const DELETED_USER_NAME = 'Deleted user';
/** Placeholder address of a tombstone (`.invalid` can never receive mail, RFC 2606). */
export const deletedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;

/** Loads in these states are finished: being on one doesn't block deletion. */
const FINISHED_LOAD = ['completed', 'cancelled'] as const;
/** Chunk size for `IN (...)` lists (D1: max 100 bound parameters per statement). */
const CHUNK = 90;

export type DeletionPreview = {
	hasPassword: boolean;
	email: string;
	/** Dropzones where this user is the only owner: deletion is blocked. */
	soleOwnerOf: { id: string; name: string; slug: string }[];
	/** Manifested on a load that hasn't completed: deletion is blocked. */
	activeLoads: { dropzoneName: string; day: string; loadNumber: number }[];
	/** Non-zero wallet balances (warned about, money stays with the dropzone). */
	wallets: { dropzoneName: string; currency: string; availableMinor: number; pendingMinor: number }[];
	/** Dropzone records that are kept (detached from the account). */
	retained: { waivers: number; slots: number; ledgerEntries: number; checkins: number; payments: number };
	/** Accounts on other Log-Book instances linked to this one (federation). */
	linkedAccounts: number;
	blocked: boolean;
};

const count = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

export async function accountDeletionPreview(db: Database, userId: string): Promise<DeletionPreview> {
	const user = (await db.select({ email: users.email, passwordHash: users.passwordHash, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1))[0];
	if (!user || user.deletedAt) throw new DomainError('not_found', 'Account not found');

	const owned = await db
		.select({ id: dropzones.id, name: dropzones.name, slug: dropzones.slug })
		.from(dropzoneMemberRoles)
		.innerJoin(dropzones, eq(dropzones.id, dropzoneMemberRoles.dropzoneId))
		.where(and(eq(dropzoneMemberRoles.userId, userId), eq(dropzoneMemberRoles.role, 'owner')));
	const soleOwnerOf: DeletionPreview['soleOwnerOf'] = [];
	for (const dz of owned) {
		const others = await db
			.select({ n: sql<number>`count(*)` })
			.from(dropzoneMemberRoles)
			.where(and(eq(dropzoneMemberRoles.dropzoneId, dz.id), eq(dropzoneMemberRoles.role, 'owner'), ne(dropzoneMemberRoles.userId, userId)));
		if (count(others) === 0) soleOwnerOf.push(dz);
	}

	const [activeLoads, wallets, waivers, slotN, ledgerN, checkinN, paymentN, linkedN] = await Promise.all([
		db
			.select({ dropzoneName: dropzones.name, day: loads.day, loadNumber: loads.loadNumber })
			.from(slots)
			.innerJoin(loads, eq(loads.id, slots.loadId))
			.innerJoin(dropzones, eq(dropzones.id, loads.dropzoneId))
			.where(and(eq(slots.userId, userId), notInArray(loads.status, [...FINISHED_LOAD])))
			.orderBy(loads.day, loads.loadNumber),
		db
			.select({ dropzoneName: dropzones.name, currency: walletAccounts.currency, availableMinor: walletAccounts.availableMinor, pendingMinor: walletAccounts.pendingMinor })
			.from(walletAccounts)
			.innerJoin(dropzones, eq(dropzones.id, walletAccounts.dropzoneId))
			.where(and(eq(walletAccounts.userId, userId), or(ne(walletAccounts.availableMinor, 0), ne(walletAccounts.pendingMinor, 0)))),
		db.select({ n: sql<number>`count(*)` }).from(indemnitySignatures).where(eq(indemnitySignatures.userId, userId)),
		db.select({ n: sql<number>`count(*)` }).from(slots).where(eq(slots.userId, userId)),
		db.select({ n: sql<number>`count(*)` }).from(ledgerEntries).where(eq(ledgerEntries.userId, userId)),
		db.select({ n: sql<number>`count(*)` }).from(checkins).where(eq(checkins.userId, userId)),
		db.select({ n: sql<number>`count(*)` }).from(payments).where(eq(payments.userId, userId)),
		db.select({ n: sql<number>`count(*)` }).from(linkedAccounts).where(eq(linkedAccounts.userId, userId))
	]);

	return {
		hasPassword: !!user.passwordHash,
		email: user.email,
		soleOwnerOf,
		activeLoads,
		wallets,
		retained: { waivers: count(waivers), slots: count(slotN), ledgerEntries: count(ledgerN), checkins: count(checkinN), payments: count(paymentN) },
		linkedAccounts: count(linkedN),
		blocked: soleOwnerOf.length > 0 || activeLoads.length > 0
	};
}

/** Human message for a blocked deletion (null = not blocked). */
export function blockedMessage(p: Pick<DeletionPreview, 'soleOwnerOf' | 'activeLoads'>): string | null {
	if (p.soleOwnerOf.length) {
		const names = p.soleOwnerOf.map((d) => d.name).join(', ');
		return `You're the only owner of ${names}. Make someone else an owner (Settings → Members & roles) first, or ask us to close the dropzone.`;
	}
	if (p.activeLoads.length) {
		const l = p.activeLoads[0];
		return `You're manifested on load ${l.loadNumber} (${l.day}) at ${l.dropzoneName}, which hasn't completed. Leave the load or ask manifest to remove you first.`;
	}
	return null;
}

function chunks<T>(list: T[], size = CHUNK): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}

export type DeletionResult = { deletedFiles: number; deletedObjects: number; retainedFiles: number };

/**
 * Delete the account `userId`. Throws `conflict` when blocked (sole owner, active load).
 * Database writes are one atomic batch; stored objects are removed afterwards, only when no
 * remaining `files` row shares their content-addressed key.
 */
export async function deleteAccount(db: Database, storage: Storage, userId: string, opts: { now?: number } = {}): Promise<DeletionResult> {
	const now = new Date(opts.now ?? Date.now());
	const preview = await accountDeletionPreview(db, userId);
	const blocked = blockedMessage(preview);
	if (blocked) throw new DomainError('conflict', blocked);

	const me = (await db.select({ avatarFileId: users.avatarFileId }).from(users).where(eq(users.id, userId)).limit(1))[0];

	// ── Files: personal uploads + sign-off images on this user's own (deleted) jumps. ──
	const candidates = new Set<string>();
	if (me?.avatarFileId) candidates.add(me.avatarFileId);
	for (const f of await db
		.select({ id: files.id })
		.from(files)
		.where(and(eq(files.ownerUserId, userId), isNull(files.dropzoneId), inArray(files.purpose, ['avatar', 'signature', 'import', 'other']))))
		candidates.add(f.id);
	for (const j of await db.select({ f: logbookJumps.signatureFileId }).from(logbookJumps).where(eq(logbookJumps.userId, userId))) if (j.f) candidates.add(j.f);

	// Keep anything a retained record still points at: waivers (columns + section signatures in
	// the snapshot JSON), other people's logbooks (a sign-off this user gave), dropzone photo/logo,
	// stored tandem PDFs.
	const toDelete: { id: string; key: string }[] = [];
	for (const part of chunks([...candidates])) {
		toDelete.push(
			...(await db
				.select({ id: files.id, key: files.key })
				.from(files)
				.where(
					and(
						inArray(files.id, part),
						sql`not exists (select 1 from ${logbookJumps} where ${logbookJumps.signatureFileId} = ${files.id} and ${logbookJumps.userId} <> ${userId})`,
						sql`not exists (select 1 from ${indemnitySignatures} where ${indemnitySignatures.signatureFileId} = ${files.id} or ${indemnitySignatures.guardianSignatureFileId} = ${files.id} or ${indemnitySignatures.pdfFileId} = ${files.id} or instr(${indemnitySignatures.snapshot}, ${files.id}) > 0)`,
						sql`not exists (select 1 from ${dropzones} where ${dropzones.photoFileId} = ${files.id} or instr(${dropzones.settings}, ${files.id}) > 0)`,
						sql`not exists (select 1 from ${tandemPassengers} where ${tandemPassengers.pdfFileId} = ${files.id})`
					)
				))
		);
	}
	const deleteIds = toDelete.map((f) => f.id);

	const ownTeams = (await db.select({ id: teams.id }).from(teams).where(eq(teams.ownerUserId, userId))).map((t) => t.id);
	const ownRigs = (await db.select({ id: rigs.id }).from(rigs).where(eq(rigs.userId, userId))).map((r) => r.id);

	const stmts: Statement[] = [
		// Sign-in and links.
		db.delete(sessions).where(eq(sessions.userId, userId)),
		db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId)),
		db.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, userId)),
		db.delete(linkedAccounts).where(eq(linkedAccounts.userId, userId)),
		db.delete(federationOutbox).where(eq(federationOutbox.userId, userId)),
		// Personal data.
		db.delete(userRatings).where(eq(userRatings.userId, userId)),
		db.delete(membershipChecks).where(eq(membershipChecks.userId, userId)),
		db.update(membershipChecks).set({ reviewedBy: null }).where(eq(membershipChecks.reviewedBy, userId)),
		db.delete(userBuddies).where(or(eq(userBuddies.userId, userId), eq(userBuddies.buddyId, userId))),
		db.delete(notifications).where(eq(notifications.userId, userId)),
		db.update(notifications).set({ actorUserId: null }).where(eq(notifications.actorUserId, userId)),
		db.delete(importJobs).where(eq(importJobs.userId, userId)),
		// Unpaid pay-at-manifest top-up requests can no longer be collected (online checkouts stay
		// pending: if the provider confirms one later, the money is recorded and the DZ refunds it).
		db
			.update(payments)
			.set({ status: 'cancelled' })
			.where(and(eq(payments.userId, userId), eq(payments.purpose, 'wallet_topup'), eq(payments.status, 'pending'), eq(payments.provider, 'manual'))),
		// Feedback issues stay on GitHub (no name/email there); the link back to this account goes.
		db.delete(feedbackSubmissions).where(eq(feedbackSubmissions.userId, userId)),
		db.delete(logbookJumps).where(eq(logbookJumps.userId, userId)),
		// Sign-offs this user gave stay in the other jumper's logbook (signer name/licence snapshot).
		db.update(logbookJumps).set({ signerUserId: null }).where(eq(logbookJumps.signerUserId, userId)),
		...chunks(ownRigs).map((ids) => db.delete(gearServiceEvents).where(inArray(gearServiceEvents.rigId, ids))),
		db.delete(rigs).where(eq(rigs.userId, userId)),
		db.update(gearServiceEvents).set({ performedByUserId: null }).where(eq(gearServiceEvents.performedByUserId, userId)),
		// Teams: personal teams go; dropzone teams lose the member / coach / video link.
		...chunks(ownTeams).map((ids) => db.delete(teamMembers).where(inArray(teamMembers.teamId, ids))),
		db.delete(teams).where(eq(teams.ownerUserId, userId)),
		db.delete(teamMembers).where(eq(teamMembers.userId, userId)),
		db.update(teams).set({ coachUserId: null }).where(eq(teams.coachUserId, userId)),
		db.update(teams).set({ videoUserId: null }).where(eq(teams.videoUserId, userId)),
		// Dropzone membership ends; the dropzone's records (waivers, slots, ledger, check-ins,
		// payments, wallet accounts) stay, pointing at the anonymous tombstone below.
		db.delete(dropzoneMemberRoles).where(eq(dropzoneMemberRoles.userId, userId)),
		db.delete(dropzoneMembers).where(eq(dropzoneMembers.userId, userId)),
		db.delete(dropzoneFollows).where(eq(dropzoneFollows.userId, userId)),
		db.update(aircraft).set({ defaultPilotId: null }).where(eq(aircraft.defaultPilotId, userId)),
		db.update(checkins).set({ checkedOutAt: now }).where(and(eq(checkins.userId, userId), isNull(checkins.checkedOutAt))),
		// Files: drop personal ones, detach the rest (dropzone-owned uploads, waiver signatures).
		...chunks(deleteIds).map((ids) => db.delete(files).where(inArray(files.id, ids))),
		db.update(files).set({ ownerUserId: null }).where(eq(files.ownerUserId, userId)),
		// The tombstone.
		db
			.update(users)
			.set({
				email: deletedEmail(userId),
				name: DELETED_USER_NAME,
				phone: null,
				passwordHash: null,
				avatar: null,
				avatarFileId: null,
				globalId: null,
				emailVerifiedAt: null,
				address: null,
				dob: null,
				emergencyName: null,
				emergencyPhone: null,
				marketingOptIn: false,
				association: null,
				associationNumber: null,
				associationExpiry: null,
				associationVerifiedAt: null,
				licence: null,
				declaredJumpCount: 0,
				weightKg: null,
				loadingWeightKg: null,
				isSuperAdmin: false,
				sourceRef: null,
				updatedAt: now,
				deletedAt: now
			})
			.where(eq(users.id, userId))
	];
	await runAtomic(db, stmts);

	// Stored objects: content-addressed keys may be shared with rows we kept (or other users).
	let deletedObjects = 0;
	const keys = [...new Set(toDelete.map((f) => f.key))];
	const stillUsed = new Set<string>();
	for (const part of chunks(keys)) for (const r of await db.select({ key: files.key }).from(files).where(inArray(files.key, part))) stillUsed.add(r.key);
	for (const key of keys) {
		if (stillUsed.has(key)) continue;
		try {
			await storage.delete(key);
			deletedObjects++;
		} catch (e) {
			// The orphan-object sweep (housekeeping) removes it later.
			console.warn('[account] could not delete stored object', key, e);
		}
	}
	return { deletedFiles: deleteIds.length, deletedObjects, retainedFiles: candidates.size - deleteIds.length };
}
