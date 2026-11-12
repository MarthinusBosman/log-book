import { assertSafeKey, toBytes, type Storage, type StoredObjectPage } from './types.ts';

/** Minimal shape of an R2 bucket binding (avoids depending on workers-types here). */
export type R2BucketLike = {
	put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string }; sha256?: string }): Promise<unknown>;
	get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
	head(key: string): Promise<unknown | null>;
	delete(key: string | string[]): Promise<void>;
	list(opts?: { cursor?: string; limit?: number; prefix?: string }): Promise<{
		objects: { key: string; uploaded?: Date }[];
		truncated: boolean;
		cursor?: string;
	}>;
};

/**
 * Cloudflare R2 (binding `FILES`, bucket `log-book-files`; wrangler.jsonc). Default driver on
 * the Cloudflare target. Locally `wrangler dev` simulates the bucket in Miniflare (`--persist-to`).
 */
export class R2Storage implements Storage {
	readonly kind = 'r2' as const;
	constructor(private readonly bucket: R2BucketLike) {}
	async put(key: string, data: Uint8Array | ArrayBuffer, opts: { contentType: string }) {
		assertSafeKey(key);
		await this.bucket.put(key, toBytes(data), { httpMetadata: { contentType: opts.contentType } });
	}
	async get(key: string) {
		assertSafeKey(key);
		const obj = await this.bucket.get(key);
		if (!obj) return null;
		return { data: new Uint8Array(await obj.arrayBuffer()), contentType: obj.httpMetadata?.contentType ?? null };
	}
	async delete(key: string) {
		assertSafeKey(key);
		await this.bucket.delete(key);
	}
	async exists(key: string) {
		assertSafeKey(key);
		return (await this.bucket.head(key)) !== null;
	}
	async list(cursor?: string | null): Promise<StoredObjectPage> {
		const r = await this.bucket.list({ cursor: cursor ?? undefined, limit: 500 });
		return { objects: r.objects.map((o) => ({ key: o.key, uploaded: o.uploaded ?? null })), cursor: r.truncated ? (r.cursor ?? null) : null };
	}
}
