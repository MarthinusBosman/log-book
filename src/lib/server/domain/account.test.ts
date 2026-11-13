import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { DAY, NOW, freshDb, makeDropzone, makeMember, makeUser } from './testing.ts';
import {
	checkins,
	dropzoneMemberRoles,
	dropzoneMembers,
	feedbackSubmissions,
	files,
	indemnitySignatures,
	ledgerEntries,
	linkedAccounts,
	logbookJumps,
	notifications,
	payments,
	rigs,
	sessions,
	slots,
	teams,
	userBuddies,
	userRatings,
	users,
	walletAccounts
} from '../db/schema.ts';
import { MemoryStorage } from '../storage/memory.ts';
import { saveFile } from './files.ts';
import { addJump, signJump } from './logbook.ts';
import { grantRole } from './permissions.ts';
import { createLoads, addSlot, completeLoad } from './loads.ts';
import { topUp } from './wallet.ts';
import { signIndemnity, listSignatures } from './indemnity.ts';
import { requestTopUp } from './payments.ts';
import { checkIn } from './checkins.ts';
import { createRig } from './gear.ts';
import { addBuddy, createTeam } from './teams.ts';
import { notify } from './notifications.ts';
import { isDomainError } from './errors.ts';
import { searchUsers } from './profile.ts';
import { DELETED_USER_NAME, accountDeletionPreview, blockedMessage, deleteAccount, deletedEmail } from './account.ts';
import { createUser, findUserByEmail, validateEmail } from '../auth/users.ts';

const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]);

describe('account deletion', () => {
	test('the only owner of a dropzone is blocked; a co-owner is not', async () => {
		const db = freshDb();
		const storage = new MemoryStorage();
		const { dz, owner } = await makeDropzone(db);
		const p = await accountDeletionPreview(db, owner.id);
		expect(p.blocked).toBe(true);
		expect(p.soleOwnerOf.map((d) => d.id)).toEqual([dz.id]);
		expect(blockedMessage(p)).toContain('only owner');
		const err = await deleteAccount(db, storage, owner.id).catch((e) => e);
		expect(isDomainError(err, 'conflict')).toBe(true);
		expect((await db.select().from(users).where(eq(users.id, owner.id)))[0].deletedAt).toBeNull();

		await grantRole(db, { dropzoneId: dz.id, userId: (await makeUser(db)).id, role: 'owner' });
		expect((await accountDeletionPreview(db, owner.id)).blocked).toBe(false);
		await deleteAccount(db, storage, owner.id, { now: NOW });
		expect(await db.select().from(dropzoneMemberRoles).where(eq(dropzoneMemberRoles.userId, owner.id))).toHaveLength(0);
	});

	test('blocked while manifested on a load that has not completed', async () => {
		const db = freshDb();
		const { dz, owner } = await makeDropzone(db);
		const jumper = await makeMember(db, dz.id, ['jumper']);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 10, createdBy: owner.id, now: NOW });
		await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' }, { skipWallet: true, now: NOW });
		const p = await accountDeletionPreview(db, jumper.id);
		expect(p.activeLoads).toEqual([{ dropzoneName: dz.name, day: DAY, loadNumber: 1 }]);
		expect(blockedMessage(p)).toContain('load 1');
		await completeLoad(db, load.id, { now: NOW });
		expect((await accountDeletionPreview(db, jumper.id)).blocked).toBe(false);
	});

	test('removes personal data, keeps dropzone records on an anonymous tombstone, frees the email', async () => {
		const db = freshDb();
		const storage = new MemoryStorage();
		const { dz, owner } = await makeDropzone(db, { walletEnabled: true });
		const u = await makeMember(db, dz.id, ['jumper', 'coach'], {
			name: 'Dana Delete',
			phone: '082 000 0000',
			licence: 'C-123',
			emergencyName: 'Mom',
			dob: '1990-01-01',
			passwordHash: 'x'
		});
		const instructor = await makeUser(db, { name: 'Ivan Instructor', licence: 'D-1' });
		const other = await makeUser(db, { name: 'Olga Other' });

		// Personal: avatar, rating, rig, buddy, personal team, notification, session, link, logbook.
		const avatar = await saveFile(db, storage, { data: png(1), mime: 'image/png', purpose: 'avatar', ownerUserId: u.id });
		await db.update(users).set({ avatarFileId: avatar.id, avatar: `/app/profile/avatar/${avatar.id}` }).where(eq(users.id, u.id));
		await db.insert(userRatings).values({ id: 'r1', userId: u.id, body: 'pasa', rating: 'Coach' });
		await createRig(db, { userId: u.id }, { name: 'My rig', reserveRepackedOn: DAY }, NOW);
		await addBuddy(db, u.id, other.id);
		await addBuddy(db, other.id, u.id);
		const personalTeam = await createTeam(db, { userId: u.id }, { name: 'Dana 4-way', memberIds: [other.id] });
		const dzTeam = await createTeam(db, { dropzoneId: dz.id }, { name: 'DZ team', coachUserId: u.id, memberIds: [u.id, other.id] });
		await db.insert(sessions).values({ id: 's1', userId: u.id, expiresAt: new Date(NOW + 1e9) });
		await db.insert(linkedAccounts).values({ id: 'l1', userId: u.id, issuer: 'instance:x', subject: u.id, linkedAt: new Date(NOW) });
		await notify(db, { userIds: [u.id], type: 'friend_add', payload: {} });
		await db.insert(feedbackSubmissions).values({ id: 'fb1', userId: u.id, reporterRef: 'abcdef012345', githubIssueNumber: 7, githubIssueUrl: 'https://github.com/o/r/issues/7' });
		await db.insert(feedbackSubmissions).values({ id: 'fb2', userId: other.id, reporterRef: '0123456789ab' });
		await notify(db, { userIds: [other.id], type: 'friend_add', actorUserId: u.id, payload: {} });

		// Her own jump, signed by the instructor (signature file owned by the signer).
		const ownJump = await addJump(db, u.id, { jumpDate: DAY });
		const ownJumpSig = await saveFile(db, storage, { data: png(2), mime: 'image/png', purpose: 'signature', ownerUserId: instructor.id });
		await signJump(db, { jumpId: ownJump.id, signerUserId: instructor.id, signatureFileId: ownJumpSig.id });
		// A sign-off SHE gave on someone else's jump: stays in their logbook.
		const othersJump = await addJump(db, other.id, { jumpDate: DAY });
		const givenSig = await saveFile(db, storage, { data: png(3), mime: 'image/png', purpose: 'signature', ownerUserId: u.id });
		await signJump(db, { jumpId: othersJump.id, signerUserId: u.id, signatureFileId: givenSig.id });

		// Dropzone records: waiver with signature, wallet + ledger, completed load slot, check-in.
		const waiverSig = await saveFile(db, storage, { data: png(4), mime: 'image/png', purpose: 'signature', ownerUserId: u.id, dropzoneId: dz.id });
		await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: u.id, signerName: 'Dana Delete', signatureFileId: waiverSig.id });
		await topUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 10, createdBy: owner.id, now: NOW });
		await addSlot(db, load.id, { userId: u.id, jumpType: 'belly' }, { now: NOW });
		await completeLoad(db, load.id, { now: NOW });
		await checkIn(db, { dropzoneId: dz.id, userId: u.id, now: NOW });
		const pendingTopUp = await requestTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 5000, provider: 'manual', now: NOW });
		const pendingOnline = await requestTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 7000, provider: 'payfast', now: NOW });

		// Shared content-addressed key: another user uploaded identical avatar bytes.
		const otherAvatar = await saveFile(db, storage, { data: png(1), mime: 'image/png', purpose: 'avatar', ownerUserId: other.id });
		expect(otherAvatar.key).toBe(avatar.key);

		const preview = await accountDeletionPreview(db, u.id);
		expect(preview.blocked).toBe(false);
		expect(preview.wallets).toHaveLength(1);
		expect(preview.wallets[0].availableMinor).toBe(100000 - 40000);
		expect(preview.retained.waivers).toBe(1);
		expect(preview.retained.slots).toBe(1);
		expect(preview.retained.ledgerEntries).toBeGreaterThan(0);
		expect(preview.hasPassword).toBe(true);

		const res = await deleteAccount(db, storage, u.id, { now: NOW });
		// avatar + own-jump signature deleted; given sign-off + waiver signature kept.
		expect(res.deletedFiles).toBe(2);

		const tomb = (await db.select().from(users).where(eq(users.id, u.id)))[0];
		expect(tomb).toMatchObject({
			name: DELETED_USER_NAME,
			email: deletedEmail(u.id),
			phone: null,
			licence: null,
			emergencyName: null,
			dob: null,
			passwordHash: null,
			avatar: null,
			avatarFileId: null
		});
		expect(tomb.deletedAt?.getTime()).toBe(NOW);

		// Personal data gone.
		for (const [t, col] of [
			[sessions, sessions.userId],
			[userRatings, userRatings.userId],
			[rigs, rigs.userId],
			[logbookJumps, logbookJumps.userId],
			[linkedAccounts, linkedAccounts.userId],
			[notifications, notifications.userId],
			[feedbackSubmissions, feedbackSubmissions.userId],
			[dropzoneMembers, dropzoneMembers.userId]
		] as const)
			expect(await db.select().from(t).where(eq(col, u.id))).toHaveLength(0);
		expect(await db.select().from(userBuddies).where(eq(userBuddies.buddyId, u.id))).toHaveLength(0);
		expect(await db.select().from(teams).where(eq(teams.id, personalTeam.id))).toHaveLength(0);
		expect(await db.select().from(feedbackSubmissions).where(eq(feedbackSubmissions.userId, other.id))).toHaveLength(1);
		expect((await db.select().from(teams).where(eq(teams.id, dzTeam.id)))[0].coachUserId).toBeNull();
		expect((await db.select().from(notifications).where(eq(notifications.userId, other.id)))[0].actorUserId).toBeNull();

		// Files: avatar row gone but the shared object stays for the other user; own-jump signature gone.
		expect(await db.select().from(files).where(eq(files.id, avatar.id))).toHaveLength(0);
		expect(await storage.exists(avatar.key)).toBe(true);
		expect(await db.select().from(files).where(eq(files.id, ownJumpSig.id))).toHaveLength(0);
		expect(await storage.exists(ownJumpSig.key)).toBe(false);
		// Kept, detached from the account.
		for (const f of [givenSig, waiverSig]) {
			const row = (await db.select().from(files).where(eq(files.id, f.id)))[0];
			expect(row.ownerUserId).toBeNull();
			expect(await storage.exists(f.key)).toBe(true);
		}
		const given = (await db.select().from(logbookJumps).where(eq(logbookJumps.id, othersJump.id)))[0];
		expect(given).toMatchObject({ signerUserId: null, signerName: 'Dana Delete', signatureFileId: givenSig.id });

		// Dropzone records retained (pointing at the tombstone).
		expect(await db.select().from(indemnitySignatures).where(eq(indemnitySignatures.userId, u.id))).toHaveLength(1);
		expect((await db.select().from(walletAccounts).where(eq(walletAccounts.userId, u.id)))[0].availableMinor).toBe(60000);
		expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, u.id))).length).toBeGreaterThan(0);
		expect((await db.select().from(slots).where(eq(slots.userId, u.id)))[0].displayName).toBe('Dana Delete');
		const ci = await db.select().from(checkins).where(eq(checkins.userId, u.id));
		expect(ci).toHaveLength(1);
		expect(ci[0].checkedOutAt).not.toBeNull();
		// Pay-at-manifest request cancelled (can't be collected any more); online checkout untouched.
		expect((await db.select().from(payments).where(eq(payments.id, pendingTopUp.id)))[0].status).toBe('cancelled');
		expect((await db.select().from(payments).where(eq(payments.id, pendingOnline.id)))[0].status).toBe('pending');
		// Staff see the waiver without the placeholder address.
		const [signed] = await listSignatures(db, dz.id, { userId: u.id });
		expect(signed).toMatchObject({ signerName: 'Dana Delete', email: null, accountDeleted: true });

		// The tombstone can't be found by email (sign-in, password reset) nor invited.
		expect(await findUserByEmail(db, deletedEmail(u.id))).toBeUndefined();
		expect(validateEmail(deletedEmail(u.id))).not.toBeNull();

		// Gone from search, can't be deleted twice, and the email can sign up again.
		expect(await searchUsers(db, 'Deleted')).toHaveLength(0);
		expect(isDomainError(await deleteAccount(db, storage, u.id).catch((e) => e), 'not_found')).toBe(true);
		const again = await createUser(db, { email: u.email, name: 'Dana Again', password: 'blue-skies-123' });
		expect(again.id).not.toBe(u.id);
	});

	test('the stored object goes when no other row shares its key', async () => {
		const db = freshDb();
		const storage = new MemoryStorage();
		const u = await makeUser(db);
		const avatar = await saveFile(db, storage, { data: png(9), mime: 'image/png', purpose: 'avatar', ownerUserId: u.id });
		await db.update(users).set({ avatarFileId: avatar.id }).where(eq(users.id, u.id));
		const res = await deleteAccount(db, storage, u.id, { now: NOW });
		expect(res).toEqual({ deletedFiles: 1, deletedObjects: 1, retainedFiles: 0 });
		expect(await storage.exists(avatar.key)).toBe(false);
	});
});
