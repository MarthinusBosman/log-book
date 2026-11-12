/** Public dropzone data (no login). Shared by /dz/[slug], /book and the confirmation page. */
import { error } from '@sveltejs/kit';
import type { Database } from '../db/index.ts';
import type { Dropzone } from '../db/schema.ts';
import { findDropzoneBySlug } from '../dropzones/index.ts';
import { availabilityRange } from '../domain/tandems.ts';
import { addDays, localDate } from '../domain/time.ts';

export async function publicDropzone(db: Database, slug: string): Promise<Dropzone> {
	const dz = await findDropzoneBySlug(db, slug);
	if (!dz) error(404, 'Dropzone not found');
	return dz;
}

/** Client-safe subset for public pages. */
export function publicDzView(dz: Dropzone) {
	return {
		id: dz.id,
		slug: dz.slug,
		name: dz.name,
		description: dz.description,
		hasPhoto: !!dz.photoFileId,
		openDays: dz.openDays,
		openTime: dz.openTime,
		closeTime: dz.closeTime,
		address: dz.address,
		lat: dz.lat,
		lng: dz.lng,
		contactEmail: dz.contactEmail,
		contactPhone: dz.contactPhone,
		country: dz.country,
		currency: dz.currency,
		timezone: dz.timezone
	};
}

export type PublicDz = ReturnType<typeof publicDzView>;

/** "HH:MM" now in the DZ timezone. */
export function nowTime(tz: string, now = Date.now()): string {
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
	} catch {
		return '00:00';
	}
}

/** Bookable days from today (DZ time) for `days` days: today's past times are dropped, full days omitted. */
export async function bookableDays(db: Database, dz: Pick<Dropzone, 'id' | 'timezone'>, days: number, now = Date.now()) {
	const today = localDate(now, dz.timezone);
	const avail = await availabilityRange(db, dz.id, today, addDays(today, days));
	const cutoff = nowTime(dz.timezone, now);
	const out: Record<string, { time: string; remaining: number }[]> = {};
	for (const [date, slots] of Object.entries(avail)) {
		const list = slots.filter((s) => date !== today || s.time > cutoff).map((s) => ({ time: s.time, remaining: s.remaining }));
		if (list.some((s) => s.remaining > 0)) out[date] = list;
	}
	return { today, days: out };
}
