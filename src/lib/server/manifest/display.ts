/** Hangar display: data for /app/display and the public token-guarded /dz/[slug]/display. */
import { brandingView } from '../branding.ts';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, type Dropzone } from '../db/schema.ts';
import { updateDropzoneSettings } from '../domain/dropzone-admin.ts';
import { localDate } from '../domain/time.ts';
import { displayLoads } from './board.ts';

/** Settings key holding the public display token (dropzones.settings is free-form JSON). */
export const DISPLAY_TOKEN_KEY = 'displayToken';

export function displayTokenOf(dz: Pick<Dropzone, 'settings'>): string | null {
	const t = dz.settings?.[DISPLAY_TOKEN_KEY];
	return typeof t === 'string' && t.length >= 16 ? t : null;
}

/** URL-safe random token (Web Crypto: works on Workers and Bun). */
export function newDisplayToken(): string {
	const b = crypto.getRandomValues(new Uint8Array(18));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function setDisplayToken(db: Database, dzId: string, token: string | null): Promise<void> {
	await updateDropzoneSettings(db, dzId, { [DISPLAY_TOKEN_KEY]: token });
}

/** Constant-time string compare. */
export function sameToken(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

/** Resolve a public display request; null when the slug or token doesn't match. */
export async function publicDisplayDropzone(db: Database, slug: string, token: string | null): Promise<Dropzone | null> {
	if (!token) return null;
	const dz = (await db.select().from(dropzones).where(eq(dropzones.slug, slug)).limit(1))[0];
	if (!dz) return null;
	const expected = displayTokenOf(dz);
	return expected && sameToken(expected, token) ? dz : null;
}

export async function displayData(db: Database, dz: Dropzone, dayParam: string | null, now = Date.now()) {
	const today = localDate(now, dz.timezone);
	const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : today;
	const b = brandingView(dz);
	return {
		dz: { name: dz.name, slug: dz.slug, timezone: dz.timezone },
		brand: { style: b.style, logoUrl: b.logoUrl },
		day,
		today,
		serverNow: now,
		loads: await displayLoads(db, dz, day)
	};
}
