import { describe, expect, test } from 'bun:test';
import { inArray, sql } from 'drizzle-orm';
import { freshDb, makeDropzone, makeUser } from './domain/testing.ts';
import { fileBlobs, files, indemnitySignatures, passwordResetTokens, sessions } from './db/schema.ts';
import { runHousekeeping, sweepFiles } from './housekeeping.ts';
import { MemoryStorage } from './storage/memory.ts';
import { saveFile } from './domain/files.ts';
import { addJump, deleteJump, signJump, updateJump } from './domain/logbook.ts';
import { eq } from 'drizzle-orm';
import { confirmOnlinePayment, createOnlineTopUp, expireAbandonedCheckouts, getPayment } from './domain/online-payments.ts';
import { requestTopUp } from './domain/payments.ts';
import { getAccount } from './domain/wallet.ts';

const NOW = Date.parse('2026-11-14T08:00:00Z');
const H = 3_600_000;
const DAY_H = 24 * H;

describe('runHousekeeping', () => {
	test('removes expired sessions, stale reset tokens and orphaned blob chunks only', async () => {
		const db = freshDb();
		const u = await makeUser(db);
		await db.insert(sessions).values([
			{ id: 'expired', userId: u.id, expiresAt: new Date(NOW - 1) },
			{ id: 'live', userId: u.id, expiresAt: new Date(NOW + H) }
		]);
		await db.insert(passwordResetTokens).values([
			{ id: 'old', userId: u.id, expiresAt: new Date(NOW - 25 * H) },
			{ id: 'used-old', userId: u.id, expiresAt: new Date(NOW + H), usedAt: new Date(NOW - 25 * H) },
			{ id: 'fresh', userId: u.id, expiresAt: new Date(NOW + H) }
		]);
		await db.insert(files).values({ id: 'f1', key: 'avatar/kept.jpg', mime: 'image/jpeg', size: 1, purpose: 'avatar' });
		const b = new Uint8Array([1]);
		await db.insert(fileBlobs).values([
			{ key: 'avatar/kept.jpg', part: 0, bytes: b, createdAt: new Date(NOW - 5 * H) },
			{ key: 'avatar/orphan.jpg', part: 0, bytes: b, createdAt: new Date(NOW - 2 * H) },
			{ key: 'avatar/orphan.jpg', part: 1, bytes: b, createdAt: new Date(NOW - 2 * H) },
			{ key: 'avatar/uploading.jpg', part: 0, bytes: b, createdAt: new Date(NOW - 60_000) }
		]);

		const r = await runHousekeeping(db, NOW);
		expect(r).toEqual({ sessions: 1, resetTokens: 2, orphanBlobs: 2, abandonedCheckouts: 0 });

		const ids = (rows: { id: string }[]) => rows.map((x) => x.id).sort();
		expect(ids(await db.select({ id: sessions.id }).from(sessions))).toEqual(['live']);
		expect(ids(await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens))).toEqual(['fresh']);
		const keys = (await db.all(sql`select distinct key from file_blobs order by key`)) as { key: string }[];
		expect(keys.map((k) => k.key)).toEqual(['avatar/kept.jpg', 'avatar/uploading.jpg']);

		expect(await runHousekeeping(db, NOW)).toEqual({ sessions: 0, resetTokens: 0, orphanBlobs: 0, abandonedCheckouts: 0 });
	});

	test('expires online checkouts left pending for 48 h; pay-at-manifest requests stay; a late success still credits', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db, { walletEnabled: true });
		const u = await makeUser(db);
		const start = (provider: 'paystack' | 'manual', ageH: number) =>
			provider === 'manual'
				? requestTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 50_000, provider, now: NOW - ageH * H })
				: createOnlineTopUp(db, { userId: u.id, dropzoneId: dz.id, amountMinor: 50_000, provider, returnTo: '/app/wallet/x', now: NOW - ageH * H });
		const old = await start('paystack', 49);
		const recent = await start('paystack', 47);
		const manual = await start('manual', 100);

		expect((await runHousekeeping(db, NOW)).abandonedCheckouts).toBe(1);
		const status = async (id: string) => (await getPayment(db, id))!;
		expect((await status(old.id)).status).toBe('cancelled');
		expect((await status(old.id)).metadata).toMatchObject({ returnTo: '/app/wallet/x', failureReason: 'expired: checkout not completed' });
		expect((await status(recent.id)).status).toBe('pending');
		expect((await status(manual.id)).status).toBe('pending');
		expect(await expireAbandonedCheckouts(db, NOW)).toBe(0);

		// The provider's (retried) webhook for the expired checkout still applies the money.
		const r = await confirmOnlinePayment(db, { paymentId: old.id, provider: 'paystack', outcome: 'succeeded', providerTxId: 'ps_late', amountMinor: 50_000, currency: 'ZAR', now: NOW });
		expect(r.applied).toBe(true);
		expect((await status(old.id)).status).toBe('succeeded');
		expect((await getAccount(db, u.id, dz.id))!.availableMinor).toBe(50_000);
	});
});

describe('sweepFiles', () => {
	test('deletes stale staged imports, legacy stored PDFs and unreferenced objects; keeps the rest', async () => {
		const db = freshDb();
		const storage = new MemoryStorage();
		const u = await makeUser(db);
		const keep = await saveFile(db, storage, { data: new Uint8Array([1, 2, 3]), mime: 'image/webp', purpose: 'avatar', ownerUserId: u.id });
		const imp = await saveFile(db, storage, { data: new TextEncoder().encode('{}'), mime: 'application/json', purpose: 'import', ownerUserId: u.id });
		const fresh = await saveFile(db, storage, { data: new TextEncoder().encode('{"a":1}'), mime: 'application/json', purpose: 'import', ownerUserId: u.id });
		await db.update(files).set({ createdAt: new Date(NOW - 25 * H) }).where(eq(files.id, imp.id));
		await db.update(files).set({ createdAt: new Date(NOW - H) }).where(eq(files.id, fresh.id));
		const pdf = await saveFile(db, storage, { data: new TextEncoder().encode('%PDF-1.4'), mime: 'application/pdf', purpose: 'tandem_pdf' });
		await storage.put('avatar/orphan.webp', new Uint8Array([9]), { contentType: 'image/webp' });
		storage.uploaded.set('avatar/orphan.webp', new Date(NOW - 2 * H));
		for (const k of [keep.key, imp.key, fresh.key, pdf.key]) storage.uploaded.set(k, new Date(NOW - 2 * H));

		const r = await sweepFiles(db, storage, NOW);
		expect(r).toEqual({ staleImports: 1, legacyPdfs: 1, orphanSignatures: 0, orphanObjects: 1 });
		expect(await storage.exists(keep.key)).toBe(true);
		expect(await storage.exists(fresh.key)).toBe(true);
		expect(await storage.exists(imp.key)).toBe(false);
		expect(await storage.exists(pdf.key)).toBe(false);
		expect(await storage.exists('avatar/orphan.webp')).toBe(false);
		expect(await sweepFiles(db, storage, NOW)).toEqual({ staleImports: 0, legacyPdfs: 0, orphanSignatures: 0, orphanObjects: 0 });
	});

	test('drops signature images no jump or waiver references (cleared sign-off, deleted jump); keeps referenced and fresh ones', async () => {
		const db = freshDb();
		const storage = new MemoryStorage();
		const { dz } = await makeDropzone(db);
		const jumper = await makeUser(db);
		const signer = await makeUser(db, { licence: 'D-1' });
		const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]);
		const sig = (n: number) => saveFile(db, storage, { data: png(n), mime: 'image/png', purpose: 'signature', ownerUserId: signer.id });

		// Signed jump (kept), sign-off cleared by a fact edit (orphan), jump deleted (orphan).
		const kept = await sig(1);
		const j1 = await addJump(db, jumper.id, { jumpDate: '2026-11-01' });
		await signJump(db, { jumpId: j1.id, signerUserId: signer.id, signatureFileId: kept.id, now: NOW - 3 * DAY_H });
		const cleared = await sig(2);
		const j2 = await addJump(db, jumper.id, { jumpDate: '2026-11-02' });
		await signJump(db, { jumpId: j2.id, signerUserId: signer.id, signatureFileId: cleared.id, now: NOW - 3 * DAY_H });
		await updateJump(db, jumper.id, j2.id, { altitudeFt: 4000 });
		const gone = await sig(3);
		const j3 = await addJump(db, jumper.id, { jumpDate: '2026-11-03' });
		await signJump(db, { jumpId: j3.id, signerUserId: signer.id, signatureFileId: gone.id, now: NOW - 3 * DAY_H });
		await deleteJump(db, jumper.id, j3.id);

		// Waiver: main + guardian columns, and a section signature only referenced in the snapshot JSON.
		const main = await sig(4);
		const guardian = await sig(5);
		const section = await sig(6);
		await db.insert(indemnitySignatures).values({
			id: 'w1',
			dropzoneId: dz.id,
			audience: 'sport',
			userId: jumper.id,
			signerName: 'J',
			signatureFileId: main.id,
			guardianSignatureFileId: guardian.id,
			snapshot: { dropzoneName: dz.name, audience: 'sport', sections: [{ title: 'Witness', content: '', type: 'signature' }], answers: [{ signatureFileId: section.id }] },
			signedAt: new Date(NOW - 3 * DAY_H)
		});
		// Same bytes as a referenced one (content-addressed key): the row goes, the object stays.
		const dupe = await sig(1);
		// Unreferenced but fresh (an in-flight submit): kept.
		const fresh = await sig(7);

		const old = [kept, cleared, gone, main, guardian, section, dupe].map((f) => f.id);
		await db.update(files).set({ createdAt: new Date(NOW - 2 * DAY_H) }).where(inArray(files.id, old));
		await db.update(files).set({ createdAt: new Date(NOW - H) }).where(eq(files.id, fresh.id));

		const r = await sweepFiles(db, storage, NOW);
		expect(r.orphanSignatures).toBe(3);
		const left = (await db.select({ id: files.id }).from(files)).map((f) => f.id).sort();
		expect(left).toEqual([kept.id, main.id, guardian.id, section.id, fresh.id].sort());
		expect(await storage.exists(kept.key)).toBe(true);
		expect(await storage.exists(cleared.key)).toBe(false);
		expect(await storage.exists(gone.key)).toBe(false);
		expect((await sweepFiles(db, storage, NOW)).orphanSignatures).toBe(0);
	});
});
