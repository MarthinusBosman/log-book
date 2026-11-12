import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { fileBlobs } from '../db/schema.ts';
import { assertSafeKey, toBytes, type Storage } from './types.ts';

/** Part size: well under D1's ~2 MB row/value limit, and one bound BLOB per statement. */
export const DB_BLOB_PART_BYTES = 512 * 1024;

/**
 * Files stored inside the SQL database (`file_blobs`, chunked into ≤512 KB parts).
 * Default on Cloudflare (D1, no R2 needed); opt-in on the bun target with STORAGE_DRIVER=db.
 *
 * Writes go one part per statement (no giant batch): keys are unique per upload, so a failed
 * write is simply cleaned up. Reads fetch parts one at a time to keep each D1 response small.
 */
export class DbStorage implements Storage {
	readonly kind = 'db' as const;
	constructor(
		private readonly db: Database,
		private readonly partBytes = DB_BLOB_PART_BYTES
	) {}

	async put(key: string, data: Uint8Array | ArrayBuffer, opts: { contentType: string }) {
		assertSafeKey(key);
		const bytes = toBytes(data);
		await this.delete(key);
		const parts = Math.max(1, Math.ceil(bytes.byteLength / this.partBytes));
		try {
			for (let part = 0; part < parts; part++) {
				const chunk = bytes.slice(part * this.partBytes, (part + 1) * this.partBytes);
				await this.db.insert(fileBlobs).values({ key, part, bytes: chunk, contentType: part === 0 ? opts.contentType : null });
			}
		} catch (e) {
			await this.delete(key).catch(() => {});
			throw e;
		}
	}

	async get(key: string) {
		assertSafeKey(key);
		const head = (
			await this.db
				.select({ part: fileBlobs.part, contentType: fileBlobs.contentType })
				.from(fileBlobs)
				.where(eq(fileBlobs.key, key))
				.orderBy(asc(fileBlobs.part))
		) as { part: number; contentType: string | null }[];
		if (head.length === 0 || head[0].part !== 0) return null;
		const chunks: Uint8Array[] = [];
		for (const { part } of head) {
			const row = (
				await this.db
					.select({ bytes: fileBlobs.bytes })
					.from(fileBlobs)
					.where(and(eq(fileBlobs.key, key), eq(fileBlobs.part, part)))
					.limit(1)
			)[0];
			if (!row) return null; // deleted concurrently
			chunks.push(row.bytes);
		}
		const total = chunks.reduce((n, c) => n + c.byteLength, 0);
		const out = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			out.set(c, off);
			off += c.byteLength;
		}
		return { data: out, contentType: head[0].contentType };
	}

	async delete(key: string) {
		assertSafeKey(key);
		await this.db.delete(fileBlobs).where(eq(fileBlobs.key, key));
	}

	async exists(key: string) {
		assertSafeKey(key);
		const row = await this.db
			.select({ part: fileBlobs.part })
			.from(fileBlobs)
			.where(and(eq(fileBlobs.key, key), eq(fileBlobs.part, 0)))
			.limit(1);
		return row.length > 0;
	}
}
