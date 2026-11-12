import type { Storage, StoredObjectPage } from './types.ts';

/**
 * Write to `primary`, read from `primary` then `legacy`. Used on Cloudflare after moving uploads
 * from D1 (`db` driver) to R2: files stored before the switch stay readable and deletable in
 * place, new files go to R2. (Migrating old blobs is optional — they die off as files are replaced.)
 */
export class FallbackStorage implements Storage {
	readonly kind: Storage['kind'];
	constructor(
		private readonly primary: Storage,
		private readonly legacy: Storage
	) {
		this.kind = primary.kind;
	}
	put(key: string, data: Uint8Array | ArrayBuffer, opts: { contentType: string }) {
		return this.primary.put(key, data, opts);
	}
	async get(key: string) {
		return (await this.primary.get(key)) ?? (await this.legacy.get(key));
	}
	async delete(key: string) {
		await Promise.all([this.primary.delete(key), this.legacy.delete(key)]);
	}
	async exists(key: string) {
		return (await this.primary.exists(key)) || (await this.legacy.exists(key));
	}
	async list(cursor?: string | null): Promise<StoredObjectPage> {
		return this.primary.list ? this.primary.list(cursor) : { objects: [], cursor: null };
	}
}
