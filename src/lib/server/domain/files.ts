import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { files, type FilePurpose, type FileRow } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { Storage } from '../storage/types.ts';
import { DomainError } from './errors.ts';

const EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'application/pdf': 'pdf',
	'application/json': 'json',
	'text/csv': 'csv'
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Images (photos, avatars, signatures) are capped lower than documents. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Per-purpose caps (storage is metered). With JavaScript the browser already shrinks images far
 * below these (avatar 256 px WebP ≈ 10–40 KB, logo 512 px, DZ photo 1600 px ≈ 150–300 KB); the
 * caps bound what a no-JS upload of an original photo may store.
 */
export const PURPOSE_MAX_BYTES: Partial<Record<FilePurpose, number>> = {
	avatar: 1.5 * 1024 * 1024,
	dz_logo: 1024 * 1024,
	dz_photo: 3 * 1024 * 1024,
	signature: 200 * 1024
};

/** Upload size limit for a mime type (images 5 MB, PDFs/imports 10 MB), tightened per purpose. */
export function maxBytesFor(mime: string, purpose?: FilePurpose): number {
	const base = mime.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_UPLOAD_BYTES;
	const p = purpose ? PURPOSE_MAX_BYTES[purpose] : undefined;
	return p ? Math.min(base, p) : base;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Store a blob and record its metadata. Returns the `files` row (reference it by id).
 * Content-addressed: the object key is `<purpose>/<sha256>.<ext>`, so re-uploading identical bytes
 * (same photo twice, a repeated import) stores nothing new — only another metadata row.
 */
export async function saveFile(
	db: Database,
	storage: Storage,
	input: { data: Uint8Array | ArrayBuffer; mime: string; purpose: FilePurpose; ownerUserId?: string | null; dropzoneId?: string | null }
): Promise<FileRow> {
	const ext = EXT[input.mime];
	if (!ext) throw new DomainError('invalid', `Unsupported file type ${input.mime}`);
	const size = input.data.byteLength;
	if (size === 0) throw new DomainError('invalid', 'File is empty');
	const max = maxBytesFor(input.mime, input.purpose);
	if (size > max) throw new DomainError('invalid', `File is too large (max ${Math.round((max / 1024 / 1024) * 10) / 10} MB)`);
	const bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
	const sha = await sha256Hex(bytes);
	const id = newId();
	const key = `${input.purpose}/${sha}.${ext}`;
	const shared = (await db.select({ id: files.id }).from(files).where(eq(files.key, key)).limit(1))[0];
	if (!shared || !(await storage.exists(key))) await storage.put(key, bytes, { contentType: input.mime });
	return (
		await db
			.insert(files)
			.values({ id, key, mime: input.mime, size, sha256: sha, purpose: input.purpose, ownerUserId: input.ownerUserId ?? null, dropzoneId: input.dropzoneId ?? null })
			.returning()
	)[0];
}

export async function getFile(db: Database, id: string): Promise<FileRow | undefined> {
	return (await db.select().from(files).where(eq(files.id, id)).limit(1))[0];
}

export async function readFileBlob(db: Database, storage: Storage, id: string) {
	const row = await getFile(db, id);
	if (!row) return null;
	const blob = await storage.get(row.key);
	return blob ? { row, data: blob.data } : null;
}

/** Delete a file row; the stored object goes too once no other row shares its (content) key. */
export async function deleteFile(db: Database, storage: Storage, id: string): Promise<void> {
	const row = await getFile(db, id);
	if (!row) return;
	await db.delete(files).where(eq(files.id, id));
	const stillUsed = (await db.select({ id: files.id }).from(files).where(eq(files.key, row.key)).limit(1))[0];
	if (!stillUsed) await storage.delete(row.key);
}

/** Decode a `data:image/png;base64,...` URL (signature pads) into bytes + mime. */
export function decodeDataUrl(dataUrl: string): { data: Uint8Array; mime: string } {
	const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
	if (!m) throw new DomainError('invalid', 'Signature is empty.');
	const bin = atob(m[2]);
	const data = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
	return { data, mime: m[1].toLowerCase() };
}
