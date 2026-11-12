import { beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { freshDb, makeUser } from '../domain/testing.ts';
import { deleteFile, readFileBlob, saveFile } from '../domain/files.ts';
import { DbStorage, DB_BLOB_PART_BYTES } from './db.ts';
import { resolveStorageDriver } from './index.ts';

let db: Database;
let storage: DbStorage;
beforeEach(() => {
	db = freshDb();
	storage = new DbStorage(db);
});

function randomBytes(n: number): Uint8Array {
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
	return out;
}

async function partCount(key: string): Promise<number> {
	const rows = (await db.all(sql`select count(*) as n from file_blobs where key = ${key}`)) as { n: number }[];
	return rows[0].n;
}

describe('DbStorage', () => {
	test('put / get / exists / delete', async () => {
		const data = new TextEncoder().encode('hello blob');
		await storage.put('signature/a.png', data, { contentType: 'image/png' });
		expect(await storage.exists('signature/a.png')).toBe(true);
		const got = await storage.get('signature/a.png');
		expect(got?.contentType).toBe('image/png');
		expect<Uint8Array | undefined>(got?.data).toEqual(data);
		await storage.delete('signature/a.png');
		expect(await storage.exists('signature/a.png')).toBe(false);
		expect(await storage.get('signature/a.png')).toBeNull();
	});

	test('missing key → null; unsafe keys rejected', async () => {
		expect(await storage.get('avatar/missing.png')).toBeNull();
		await expect(storage.put('../etc/passwd', new Uint8Array([1]), { contentType: 'x' })).rejects.toThrow(/Invalid storage key/);
	});

	test('accepts ArrayBuffer input', async () => {
		const buf = new Uint8Array([1, 2, 3, 4]).buffer;
		await storage.put('other/b.pdf', buf, { contentType: 'application/pdf' });
		expect<Uint8Array | undefined>((await storage.get('other/b.pdf'))?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
	});

	test('large files are chunked into ≤512 KB parts and reassembled exactly', async () => {
		const size = 3 * DB_BLOB_PART_BYTES + 12345; // 4 parts
		const data = randomBytes(size);
		await storage.put('waiver/big.pdf', data, { contentType: 'application/pdf' });
		expect(await partCount('waiver/big.pdf')).toBe(4);
		const got = await storage.get('waiver/big.pdf');
		expect(got?.data.byteLength).toBe(size);
		expect<Uint8Array | undefined>(got?.data).toEqual(data);
	});

	test('exact multiple of the part size and overwrite with a smaller file', async () => {
		await storage.put('other/c.pdf', randomBytes(2 * DB_BLOB_PART_BYTES), { contentType: 'application/pdf' });
		expect(await partCount('other/c.pdf')).toBe(2);
		const small = randomBytes(10);
		await storage.put('other/c.pdf', small, { contentType: 'application/pdf' });
		expect(await partCount('other/c.pdf')).toBe(1);
		expect<Uint8Array | undefined>((await storage.get('other/c.pdf'))?.data).toEqual(small);
	});

	test('works behind saveFile/readFileBlob/deleteFile, with per-type size limits', async () => {
		const u = await makeUser(db);
		const pdf = randomBytes(DB_BLOB_PART_BYTES + 1);
		const row = await saveFile(db, storage, { data: pdf, mime: 'application/pdf', purpose: 'indemnity_pdf', ownerUserId: u.id });
		expect<Uint8Array | undefined>((await readFileBlob(db, storage, row.id))?.data).toEqual(pdf);
		await deleteFile(db, storage, row.id);
		expect(await partCount(row.key)).toBe(0);

		await expect(
			saveFile(db, storage, { data: new Uint8Array(5 * 1024 * 1024 + 1), mime: 'image/jpeg', purpose: 'other' })
		).rejects.toThrow(/too large \(max 5 MB\)/);
		await expect(
			saveFile(db, storage, { data: new Uint8Array(1.5 * 1024 * 1024 + 1), mime: 'image/jpeg', purpose: 'avatar' })
		).rejects.toThrow(/too large \(max 1.5 MB\)/);
		await expect(saveFile(db, storage, { data: new Uint8Array(200 * 1024 + 1), mime: 'image/png', purpose: 'signature' })).rejects.toThrow(/too large/);
		await expect(
			saveFile(db, storage, { data: new Uint8Array(10 * 1024 * 1024 + 1), mime: 'application/pdf', purpose: 'indemnity_pdf' })
		).rejects.toThrow(/too large \(max 10 MB\)/);
	});
});

describe('content-addressed dedupe', () => {
	test('identical bytes share one stored object; it is deleted with the last reference', async () => {
		const img = randomBytes(5000);
		const a = await saveFile(db, storage, { data: img, mime: 'image/webp', purpose: 'avatar' });
		const b = await saveFile(db, storage, { data: img, mime: 'image/webp', purpose: 'avatar' });
		expect(a.id).not.toBe(b.id);
		expect(a.key).toBe(b.key);
		expect(a.key).toMatch(/^avatar\/[0-9a-f]{64}\.webp$/);
		expect(a.sha256).toHaveLength(64);
		expect(await partCount(a.key)).toBe(1);
		await deleteFile(db, storage, a.id);
		expect(await partCount(a.key)).toBe(1); // b still uses it
		expect((await readFileBlob(db, storage, b.id))?.data).toEqual(img);
		await deleteFile(db, storage, b.id);
		expect(await partCount(a.key)).toBe(0);
	});
});

describe('resolveStorageDriver', () => {
	test('defaults per target and validates', () => {
		expect(resolveStorageDriver(undefined, 'bun')).toBe('disk');
		expect(resolveStorageDriver('', 'cloudflare')).toBe('r2');
		expect(resolveStorageDriver('DB', 'bun')).toBe('db');
		expect(resolveStorageDriver('d1', 'cloudflare')).toBe('db');
		expect(resolveStorageDriver('r2', 'cloudflare')).toBe('r2');
		expect(() => resolveStorageDriver('disk', 'cloudflare')).toThrow(/not available/);
		expect(() => resolveStorageDriver('s3', 'bun')).toThrow(/disk, db or r2/);
	});
});
