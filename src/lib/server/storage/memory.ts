import { assertSafeKey, toBytes, type Storage } from './types.ts';

/** In-memory storage for tests. */
export class MemoryStorage implements Storage {
	readonly kind = 'memory' as const;
	private blobs = new Map<string, { data: Uint8Array; contentType: string }>();
	async put(key: string, data: Uint8Array | ArrayBuffer, opts: { contentType: string }) {
		assertSafeKey(key);
		this.blobs.set(key, { data: toBytes(data), contentType: opts.contentType });
		this.uploaded.set(key, new Date());
	}
	async get(key: string) {
		return this.blobs.get(key) ?? null;
	}
	async delete(key: string) {
		this.blobs.delete(key);
	}
	async exists(key: string) {
		return this.blobs.has(key);
	}
	/** Test hook: when objects were stored (for the orphan sweep). */
	uploaded = new Map<string, Date>();
	async list() {
		return { objects: [...this.blobs.keys()].map((key) => ({ key, uploaded: this.uploaded.get(key) ?? null })), cursor: null };
	}
	/** Total stored bytes (tests / measurements). */
	get bytes() {
		return [...this.blobs.values()].reduce((n, b) => n + b.data.byteLength, 0);
	}
}
