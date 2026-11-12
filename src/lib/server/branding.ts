/** Per-dropzone branding (colour, logo, default theme) stored in `dropzones.settings.branding`. */
import { eq } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { dropzones, type Dropzone } from './db/schema.ts';
import type { Storage } from './storage/types.ts';
import { deleteFile, getFile, readFileBlob, saveFile } from './domain/files.ts';
import { getDropzone, updateDropzoneSettings } from './domain/dropzone-admin.ts';
import { DomainError } from './domain/errors.ts';
import { brandStyleTag, normalizeHex, readBranding, type DropzoneBranding, type ThemeChoice } from '../branding.ts';

export type BrandingView = {
	color: string | null;
	theme: ThemeChoice | null;
	/** Public, cache-busted URL of the logo (null = none). */
	logoUrl: string | null;
	/** `<style>` tag for `{@html}` in <svelte:head> ('' = default colours). */
	style: string;
};

export function logoUrl(slug: string, fileId: string | null): string | null {
	return fileId ? `/dz/${encodeURIComponent(slug)}/logo?v=${fileId}` : null;
}

export function brandingView(dz: Pick<Dropzone, 'slug' | 'settings'>): BrandingView {
	const b = readBranding(dz.settings);
	return { color: b.color, theme: b.theme, logoUrl: logoUrl(dz.slug, b.logoFileId), style: brandStyleTag(b.color) };
}

/** Branding of a dropzone by id (the app shell's active dropzone). */
export async function brandingFor(db: Database, dropzoneId: string | null | undefined): Promise<BrandingView | null> {
	if (!dropzoneId) return null;
	const dz = (await db.select({ slug: dropzones.slug, settings: dropzones.settings }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0];
	return dz ? brandingView(dz) : null;
}

async function patchBranding(db: Database, dropzoneId: string, patch: Partial<DropzoneBranding>) {
	const dz = await getDropzone(db, dropzoneId);
	const current = readBranding(dz.settings);
	const next = { ...current, ...patch };
	await updateDropzoneSettings(db, dropzoneId, { branding: next });
	return next;
}

/** Save colour + default theme. `color: null` = app default. */
export async function saveBrandingStyle(db: Database, dropzoneId: string, input: { color: string | null; theme: ThemeChoice | null }) {
	if (input.color !== null && !normalizeHex(input.color)) throw new DomainError('invalid', 'Enter a colour as a hex code like #FF6A00.');
	return patchBranding(db, dropzoneId, { color: input.color ? normalizeHex(input.color) : null, theme: input.theme });
}

/** Store a new logo (already validated image bytes) and delete the previous one. */
export async function setLogo(db: Database, storage: Storage, dropzoneId: string, image: { data: Uint8Array; mime: string }, by: string) {
	const dz = await getDropzone(db, dropzoneId);
	const old = readBranding(dz.settings).logoFileId;
	const row = await saveFile(db, storage, { data: image.data, mime: image.mime, purpose: 'dz_logo', ownerUserId: by, dropzoneId });
	await patchBranding(db, dropzoneId, { logoFileId: row.id });
	if (old) await deleteFile(db, storage, old).catch(() => {});
	return row;
}

export async function removeLogo(db: Database, storage: Storage, dropzoneId: string) {
	const dz = await getDropzone(db, dropzoneId);
	const old = readBranding(dz.settings).logoFileId;
	await patchBranding(db, dropzoneId, { logoFileId: null });
	if (old) await deleteFile(db, storage, old).catch(() => {});
}

/** Reset colour, theme and logo to the app defaults. */
export async function resetBranding(db: Database, storage: Storage, dropzoneId: string) {
	await removeLogo(db, storage, dropzoneId);
	await patchBranding(db, dropzoneId, { color: null, theme: null, logoFileId: null });
}

/** Logo bytes for PDFs / the public logo route (only files that really are this DZ's logo). */
export async function readLogo(db: Database, storage: Storage, dz: Pick<Dropzone, 'id' | 'settings'>) {
	const id = readBranding(dz.settings).logoFileId;
	if (!id) return null;
	const row = await getFile(db, id);
	if (!row || row.purpose !== 'dz_logo' || row.dropzoneId !== dz.id) return null;
	return readFileBlob(db, storage, id);
}
