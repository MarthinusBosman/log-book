import { eq, inArray, isNotNull, and } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, logbookJumps, type LogbookJump } from '../db/schema.ts';
import { listFollowedDropzones } from '../domain/dropzone-admin.ts';
import { requestMemberships } from '../request-cache.ts';
import { listUserRigs } from '../domain/gear.ts';
import { DomainError } from '../domain/errors.ts';
import { assertJumpDateInRange, type JumpInput, type JumpFilters } from '../domain/logbook.ts';
import { isIsoDate } from '../domain/time.ts';
import { JUMP_TYPES, type JumpType } from '../../domain/constants.ts';
import { int, opt, seconds, str } from './forms.ts';

/** Dropzones a jumper can pick for a jump: memberships, follows and any DZ already in their logbook. */
export async function dropzoneOptions(locals: Pick<App.Locals, 'db' | 'cache'>, userId: string) {
	const db = locals.db;
	// Memberships come from the per-request cache (the /app layout already read them on page loads).
	const [members, follows, used] = await Promise.all([
		requestMemberships(locals, userId),
		listFollowedDropzones(db, userId),
		db.selectDistinct({ id: logbookJumps.dropzoneId }).from(logbookJumps).where(and(eq(logbookJumps.userId, userId), isNotNull(logbookJumps.dropzoneId)))
	]);
	const map = new Map<string, string>();
	for (const m of members) map.set(m.dropzone.id, m.dropzone.name);
	for (const f of follows) map.set(f.dropzone.id, f.dropzone.name);
	const missing = used.map((u) => u.id!).filter((id) => !map.has(id));
	if (missing.length) {
		for (const d of await db.select({ id: dropzones.id, name: dropzones.name }).from(dropzones).where(inArray(dropzones.id, missing))) map.set(d.id, d.name);
	}
	return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function rigOptions(db: Database, userId: string) {
	return (await listUserRigs(db, userId)).map((r) => ({ id: r.id, name: r.name || r.container || 'Rig', active: r.active }));
}

/** Parse the jump form. `dropzoneId` = '' means free-text location. */
export function parseJumpForm(form: FormData, allowedDzIds: Set<string>, now = Date.now()): JumpInput {
	// Every field problem at once (keyed by input name), so the form can mark each field
	// instead of the jumper fixing one message per submit.
	const fields: Record<string, string> = {};
	const bad = (name: string, message: string) => (fields[name] ??= message);
	const jumpDate = str(form, 'jumpDate');
	if (!isIsoDate(jumpDate)) bad('jumpDate', 'Please set the date for this jump');
	else {
		try {
			assertJumpDateInRange(jumpDate, now);
		} catch (e) {
			bad('jumpDate', (e as Error).message);
		}
	}
	const dz = str(form, 'dropzoneId');
	if (dz && !allowedDzIds.has(dz)) bad('dropzoneId', 'Choose one of your dropzones or type a location');
	if (!dz && !opt(form, 'location')) bad('location', 'Choose a dropzone or type a location');
	const jumpType = str(form, 'jumpType');
	if (jumpType && !JUMP_TYPES.includes(jumpType as JumpType)) bad('jumpType', 'Unknown jump type');
	const n = int(form, 'jumpNumber');
	const alt = int(form, 'altitudeFt');
	const ff = seconds(form, 'freefallSeconds');
	if (Number.isNaN(n as number) || (n !== null && n < 1)) bad('jumpNumber', 'Jump number must be a positive whole number');
	if (Number.isNaN(alt as number)) bad('altitudeFt', 'Altitude must be a number (feet)');
	else if (alt !== null && alt < 0) bad('altitudeFt', "Altitude can't be negative");
	else if (alt !== null && alt > 40000) bad('altitudeFt', 'Altitude looks too high (feet, max 40 000)');
	if (Number.isNaN(ff as number)) bad('freefallSeconds', 'Freefall time must be seconds or mm:ss');
	else if (ff !== null && ff > 600) bad('freefallSeconds', 'Freefall time looks too long (max 10 minutes)');
	const problems = Object.values(fields);
	if (problems.length) {
		throw new DomainError('invalid', problems.length === 1 ? problems[0] : `Please fix the ${problems.length} highlighted fields`, { fields });
	}
	return {
		jumpNumber: n ?? undefined,
		jumpDate,
		dropzoneId: dz || null,
		location: dz ? null : opt(form, 'location'),
		aircraft: opt(form, 'aircraft'),
		altitudeFt: alt,
		freefallSeconds: ff,
		jumpType: (jumpType || null) as JumpType | null,
		description: opt(form, 'description'),
		rigId: opt(form, 'rigId')
	};
}

/**
 * The submitted jump form as form values, so a failed no-JS post re-renders
 * what the jumper typed instead of the original values. Numbers that don't
 * parse are kept as typed text.
 */
export function jumpFormEcho(form: FormData) {
	const raw = (k: string) => {
		const v = form.get(k);
		return typeof v === 'string' ? v.slice(0, 4000) : '';
	};
	const num = (k: string) => {
		const v = raw(k).trim();
		if (!v) return null;
		return /^\d+$/.test(v) ? Number(v) : v;
	};
	return {
		jumpNumber: num('jumpNumber') ?? '',
		jumpDate: raw('jumpDate'),
		dropzoneId: raw('dropzoneId'),
		location: raw('location') || null,
		aircraft: raw('aircraft') || null,
		altitudeFt: num('altitudeFt'),
		freefallSeconds: num('freefallSeconds'),
		jumpType: raw('jumpType') || null,
		description: raw('description') || null,
		rigId: raw('rigId') || null
	};
}

/** Logbook list filters from the query string (also used by CSV export / print). */
export function filtersFromUrl(url: URL): JumpFilters & { year?: string } {
	const p = url.searchParams;
	const f: JumpFilters & { year?: string } = {};
	const q = p.get('q')?.trim();
	if (q) f.q = q.slice(0, 80);
	const type = p.get('type');
	if (type && JUMP_TYPES.includes(type as JumpType)) f.jumpType = type;
	const place = p.get('place');
	if (place?.startsWith('dz:')) f.dropzoneId = place.slice(3);
	else if (place?.startsWith('loc:')) f.location = place.slice(4);
	const year = p.get('year');
	if (year && /^\d{4}$/.test(year)) {
		f.year = year;
		f.from = `${year}-01-01`;
		f.to = `${year}-12-31`;
	}
	return f;
}

export type JumpRow = ReturnType<typeof jumpRow>;
export function jumpRow(j: LogbookJump, dzNames: Map<string, string>) {
	return {
		id: j.id,
		jumpNumber: j.jumpNumber,
		jumpDate: j.jumpDate,
		place: (j.dropzoneId ? dzNames.get(j.dropzoneId) : null) ?? j.location ?? null,
		aircraft: j.aircraft,
		altitudeFt: j.altitudeFt,
		freefallSeconds: j.freefallSeconds,
		jumpType: j.jumpType,
		description: j.description,
		verified: j.verified,
		source: j.source,
		signerName: j.signerName,
		signerLicence: j.signerLicence,
		signedAt: j.signedAt?.getTime() ?? null,
		/** Drawn signature image (served by /app/logbook/signature/<id> to the jumper and the signer). */
		signatureUrl: j.signedAt && j.signatureFileId ? `/app/logbook/signature/${j.signatureFileId}` : null
	};
}

export async function dzNameMap(db: Database, jumps: LogbookJump[]) {
	const ids = [...new Set(jumps.map((j) => j.dropzoneId).filter((x): x is string => !!x))];
	if (!ids.length) return new Map<string, string>();
	const rows = await db.select({ id: dropzones.id, name: dropzones.name }).from(dropzones).where(inArray(dropzones.id, ids));
	return new Map(rows.map((r) => [r.id, r.name]));
}

/** Name + timezone of each dropzone the jumps were made at (exports print sign-off days in the DZ's local calendar). */
export async function dzInfoMap(db: Database, jumps: LogbookJump[]) {
	const ids = [...new Set(jumps.map((j) => j.dropzoneId).filter((x): x is string => !!x))];
	if (!ids.length) return new Map<string, { name: string; timezone: string }>();
	const rows = await db.select({ id: dropzones.id, name: dropzones.name, timezone: dropzones.timezone }).from(dropzones).where(inArray(dropzones.id, ids));
	return new Map(rows.map((r) => [r.id, { name: r.name, timezone: r.timezone }]));
}
