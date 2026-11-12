import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { freshDb, makeUser } from './domain/testing.ts';
import { fileBlobs, files, passwordResetTokens, sessions } from './db/schema.ts';
import { runHousekeeping, sweepFiles } from './housekeeping.ts';
import { MemoryStorage } from './storage/memory.ts';
import { saveFile } from './domain/files.ts';
import { eq } from 'drizzle-orm';

const NOW = Date.parse('2026-11-14T08:00:00Z');
const H = 3_600_000;

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
		expect(r).toEqual({ sessions: 1, resetTokens: 2, orphanBlobs: 2 });

		const ids = (rows: { id: string }[]) => rows.map((x) => x.id).sort();
		expect(ids(await db.select({ id: sessions.id }).from(sessions))).toEqual(['live']);
		expect(ids(await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens))).toEqual(['fresh']);
		const keys = (await db.all(sql`select distinct key from file_blobs order by key`)) as { key: string }[];
		expect(keys.map((k) => k.key)).toEqual(['avatar/kept.jpg', 'avatar/uploading.jpg']);

		expect(await runHousekeeping(db, NOW)).toEqual({ sessions: 0, resetTokens: 0, orphanBlobs: 0 });
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
		expect(r).toEqual({ staleImports: 1, legacyPdfs: 1, orphanObjects: 1 });
		expect(await storage.exists(keep.key)).toBe(true);
		expect(await storage.exists(fresh.key)).toBe(true);
		expect(await storage.exists(imp.key)).toBe(false);
		expect(await storage.exists(pdf.key)).toBe(false);
		expect(await storage.exists('avatar/orphan.webp')).toBe(false);
		expect(await sweepFiles(db, storage, NOW)).toEqual({ staleImports: 0, legacyPdfs: 0, orphanObjects: 0 });
	});
});
