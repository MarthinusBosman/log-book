/** Blob storage used for photos, signatures and PDFs. Metadata lives in the `files` table. */
export interface Storage {
	readonly kind: 'local' | 'r2' | 'memory' | 'db';
	put(key: string, data: Uint8Array | ArrayBuffer, opts: { contentType: string }): Promise<void>;
	/** null when missing. */
	get(key: string): Promise<{ data: Uint8Array; contentType: string | null } | null>;
	delete(key: string): Promise<void>;
	exists(key: string): Promise<boolean>;
	/**
	 * Page through stored objects (housekeeping's orphan sweep). Optional: the `db` driver doesn't
	 * need it (orphaned `file_blobs` rows are found with SQL).
	 */
	list?(cursor?: string | null): Promise<StoredObjectPage>;
}

export type StoredObjectPage = { objects: { key: string; uploaded: Date | null }[]; cursor: string | null };

/** Keys are `<purpose>/<id>.<ext>`; reject anything that could escape the storage root. */
export function assertSafeKey(key: string): void {
	if (!/^[a-z0-9_-]+(\/[A-Za-z0-9._-]+)+$/.test(key) || key.includes('..')) {
		throw new Error(`Invalid storage key: ${key}`);
	}
}

export function toBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
	return data instanceof Uint8Array ? data : new Uint8Array(data);
}
