import { and, asc, desc, eq, gte, like, lte, max, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, logbookJumps, userRatings, users, type LogbookJump } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { JumpType } from '../../domain/constants.ts';
import { chunkedInsert, runAtomic } from './atomic.ts';
import { DomainError, assertFound } from './errors.ts';
import { notify } from './notifications.ts';
import { DAY_MS, isIsoDate, localDate } from './time.ts';

/** Earliest plausible jump date (old paper logbooks still get typed in). */
export const MIN_JUMP_DATE = '1900-01-01';

const FIELD_LABELS = { altitudeFt: 'Altitude', freefallSeconds: 'Freefall time' } as const;

export type JumpInput = {
	jumpNumber?: number;
	jumpDate: string;
	dropzoneId?: string | null;
	location?: string | null;
	aircraft?: string | null;
	altitudeFt?: number | null;
	freefallSeconds?: number | null;
	jumpType?: JumpType | string | null;
	description?: string | null;
	rigId?: string | null;
};

/** Highest logged jump number (0 when none). */
export async function maxJumpNumber(db: Database, userId: string): Promise<number> {
	const rows = await db.select({ n: max(logbookJumps.jumpNumber) }).from(logbookJumps).where(eq(logbookJumps.userId, userId));
	return Number(rows[0]?.n ?? 0);
}

/** Next jump number = max(highest logged, declared jump count) + 1. */
export async function nextJumpNumber(db: Database, userId: string): Promise<number> {
	// one statement: the declared count rides along as a scalar subquery
	const rows = await db
		.select({ n: max(logbookJumps.jumpNumber), d: declaredJumpCountSql(userId) })
		.from(logbookJumps)
		.where(eq(logbookJumps.userId, userId));
	return Math.max(Number(rows[0]?.n ?? 0), Number(rows[0]?.d ?? 0)) + 1;
}

/** `users.declared_jump_count` for one user as a scalar subquery (0 when the user is missing). */
function declaredJumpCountSql(userId: string) {
	return sql<number | null>`(select ${users.declaredJumpCount} from ${users} where ${users.id} = ${userId})`;
}

/** Jump dates typed into forms: not before MIN_JUMP_DATE, not in the future (one day of time-zone slack). */
export function assertJumpDateInRange(jumpDate: string, now = Date.now()) {
	if (jumpDate < MIN_JUMP_DATE) throw new DomainError('invalid', 'That jump date is too far in the past: check the year');
	if (jumpDate > localDate(now + DAY_MS)) throw new DomainError('invalid', 'That jump date is in the future');
}

function validate(input: Partial<JumpInput>) {
	if (input.jumpDate !== undefined) {
		if (!isIsoDate(input.jumpDate)) throw new DomainError('invalid', 'Please set the date for this jump');
		if (input.jumpDate < MIN_JUMP_DATE) throw new DomainError('invalid', 'That jump date is too far in the past: check the year');
	}
	if (input.jumpNumber !== undefined && (!Number.isInteger(input.jumpNumber) || input.jumpNumber < 1)) {
		throw new DomainError('invalid', 'Jump number must be a positive whole number');
	}
	for (const k of ['altitudeFt', 'freefallSeconds'] as const) {
		const v = input[k];
		if (v != null && (!Number.isFinite(v) || v < 0)) throw new DomainError('invalid', `${FIELD_LABELS[k]} can't be negative`);
	}
}

/** Manual logbook entry (number defaults to next). */
export async function addJump(db: Database, userId: string, input: JumpInput, now = Date.now()): Promise<LogbookJump> {
	validate(input);
	const jumpNumber = input.jumpNumber ?? (await nextJumpNumber(db, userId));
	const rows = await db
		.insert(logbookJumps)
		.values({
			id: newId(),
			userId,
			jumpNumber,
			jumpDate: input.jumpDate,
			dropzoneId: input.dropzoneId ?? null,
			location: input.location ?? null,
			aircraft: input.aircraft ?? null,
			altitudeFt: input.altitudeFt ?? null,
			freefallSeconds: input.freefallSeconds ?? null,
			jumpType: input.jumpType ?? null,
			description: input.description ?? null,
			rigId: input.rigId ?? null,
			source: 'manual',
			createdAt: new Date(now),
			updatedAt: new Date(now)
		})
		.returning();
	return rows[0];
}

export async function getJump(db: Database, jumpId: string): Promise<LogbookJump | undefined> {
	return (await db.select().from(logbookJumps).where(eq(logbookJumps.id, jumpId)).limit(1))[0];
}

/** Fields of a DZ-verified jump that the jumper may not change (keeps "Verified" meaningful). */
const VERIFIED_LOCKED = ['jumpDate', 'dropzoneId', 'aircraft', 'jumpNumber'] as const;

/** Edit own jump. Editing a signed jump's facts clears the signature. */
export async function updateJump(
	db: Database,
	userId: string,
	jumpId: string,
	patch: Partial<JumpInput>,
	now = Date.now()
): Promise<LogbookJump> {
	const jump = assertFound(await getJump(db, jumpId), 'Jump');
	if (jump.userId !== userId) throw new DomainError('forbidden', 'Not your jump');
	validate(patch);
	if (jump.verified) {
		for (const k of VERIFIED_LOCKED) {
			if (patch[k] !== undefined && patch[k] !== jump[k]) {
				throw new DomainError('invalid', `Cannot change ${k} of a dropzone-verified jump`);
			}
		}
	}
	const factsChanged = (['jumpDate', 'location', 'aircraft', 'altitudeFt', 'freefallSeconds', 'jumpType'] as const).some(
		(k) => patch[k] !== undefined && patch[k] !== jump[k]
	);
	// A sign-off vouches for the facts as they were: changing them clears it, including a sign-off
	// carried over from an import (signer name without `signedAt`).
	const clearSig =
		factsChanged && (jump.signedAt || jump.signerName || jump.signerLicence)
			? { signerUserId: null, signerName: null, signerLicence: null, signatureFileId: null, signedAt: null }
			: {};
	const rows = await db
		.update(logbookJumps)
		.set({ ...patch, ...clearSig, updatedAt: new Date(now) })
		.where(eq(logbookJumps.id, jumpId))
		.returning();
	return rows[0];
}

export async function deleteJump(db: Database, userId: string, jumpId: string): Promise<void> {
	const jump = assertFound(await getJump(db, jumpId), 'Jump');
	if (jump.userId !== userId) throw new DomainError('forbidden', 'Not your jump');
	await db.delete(logbookJumps).where(eq(logbookJumps.id, jumpId));
}

/**
 * Sign off another jumper's jump. The signer must not be the owner and must hold a licence
 * (users.licence) or at least one rating. Stores a snapshot of the signer's name + licence.
 * A signed jump stays signed: another signer gets `conflict`, the same signer gets the jump back
 * unchanged (no second notification). Editing jump facts clears the signature (`updateJump`).
 */
export async function signJump(
	db: Database,
	input: { jumpId: string; signerUserId: string; signatureFileId?: string | null; now?: number }
): Promise<LogbookJump> {
	const jump = assertFound(await getJump(db, input.jumpId), 'Jump');
	if (jump.userId === input.signerUserId) throw new DomainError('cannot_sign_own_jump', 'You cannot sign your own jump');
	if (jump.signedAt) {
		// A sign-off link stays valid for days: never let a second person replace the first signature.
		// The same signer submitting again (double tap, back + resubmit) is a no-op.
		if (jump.signerUserId === input.signerUserId) return jump;
		throw new DomainError('conflict', `This jump has already been signed by ${jump.signerName ?? 'someone else'}`);
	}
	const signer = assertFound(
		(await db.select().from(users).where(eq(users.id, input.signerUserId)).limit(1))[0],
		'Signer'
	);
	const ratings = await db
		.select({ id: userRatings.id })
		.from(userRatings)
		.where(eq(userRatings.userId, signer.id))
		.limit(1);
	if (!signer.licence?.trim() && ratings.length === 0) {
		throw new DomainError('signer_not_licensed', 'Only licensed jumpers can sign jumps');
	}
	const now = input.now ?? Date.now();
	const rows = await db
		.update(logbookJumps)
		.set({
			signerUserId: signer.id,
			signerName: signer.name,
			signerLicence: signer.licence ?? null,
			signatureFileId: input.signatureFileId ?? null,
			signedAt: new Date(now),
			updatedAt: new Date(now)
		})
		.where(eq(logbookJumps.id, jump.id))
		.returning();
	await notify(db, {
		userIds: [jump.userId],
		type: 'jump_signed',
		actorUserId: signer.id,
		dropzoneId: jump.dropzoneId,
		payload: { actorName: signer.name, jumpNumber: jump.jumpNumber },
		now
	});
	return rows[0];
}

export type JumpFilters = {
	from?: string;
	to?: string;
	/** Exact jump type code. */
	jumpType?: string;
	/** Linked dropzone id. */
	dropzoneId?: string;
	/** Free-text location (exact match, used for unlinked jumps). */
	location?: string;
	/** Search in description, location, aircraft and signer. */
	q?: string;
};

function jumpWhere(userId: string, f: JumpFilters): SQL | undefined {
	const q = f.q?.trim();
	return and(
		eq(logbookJumps.userId, userId),
		f.from ? gte(logbookJumps.jumpDate, f.from) : undefined,
		f.to ? lte(logbookJumps.jumpDate, f.to) : undefined,
		f.jumpType ? eq(logbookJumps.jumpType, f.jumpType) : undefined,
		f.dropzoneId ? eq(logbookJumps.dropzoneId, f.dropzoneId) : undefined,
		f.location ? eq(logbookJumps.location, f.location) : undefined,
		q
			? or(
					like(logbookJumps.description, `%${q}%`),
					like(logbookJumps.location, `%${q}%`),
					like(logbookJumps.aircraft, `%${q}%`),
					like(logbookJumps.signerName, `%${q}%`)
				)
			: undefined
	);
}

export async function listJumps(
	db: Database,
	userId: string,
	opts: JumpFilters & { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}
): Promise<LogbookJump[]> {
	return db
		.select()
		.from(logbookJumps)
		.where(jumpWhere(userId, opts))
		.orderBy(
			opts.order === 'asc' ? asc(logbookJumps.jumpNumber) : desc(logbookJumps.jumpNumber),
			desc(logbookJumps.createdAt)
		)
		.limit(opts.limit ?? 50)
		.offset(opts.offset ?? 0);
}

/** Number of jumps matching the filters (pagination) plus their freefall total. */
export async function countJumps(db: Database, userId: string, filters: JumpFilters = {}): Promise<{ count: number; freefallSeconds: number }> {
	const r = (
		await db
			.select({ n: sql<number>`count(*)`, ff: sql<number | null>`sum(${logbookJumps.freefallSeconds})` })
			.from(logbookJumps)
			.where(jumpWhere(userId, filters))
	)[0];
	return { count: Number(r?.n ?? 0), freefallSeconds: Number(r?.ff ?? 0) };
}

export type BreakdownRow = { key: string; label: string; jumps: number; freefallSeconds: number };
export type LogbookBreakdown = { byType: BreakdownRow[]; byDropzone: BreakdownRow[]; byYear: BreakdownRow[] };

/**
 * Totals grouped by jump type, dropzone (linked DZ name, else free-text location) and year.
 * Keys: jump type code ('' = unknown); `dz:<id>` / `loc:<text>`; 'YYYY'. Most jumps first (years newest first).
 */
export async function logbookBreakdown(db: Database, userId: string): Promise<LogbookBreakdown> {
	const ff = sql<number>`coalesce(sum(${logbookJumps.freefallSeconds}), 0)`;
	const n = sql<number>`count(*)`;
	const year = sql<string>`substr(${logbookJumps.jumpDate}, 1, 4)`;
	const [types, places, years] = await Promise.all([
		db.select({ k: logbookJumps.jumpType, n, ff }).from(logbookJumps).where(eq(logbookJumps.userId, userId)).groupBy(logbookJumps.jumpType),
		db
			.select({ dz: logbookJumps.dropzoneId, dzName: dropzones.name, loc: logbookJumps.location, n, ff })
			.from(logbookJumps)
			.leftJoin(dropzones, eq(dropzones.id, logbookJumps.dropzoneId))
			.where(eq(logbookJumps.userId, userId))
			.groupBy(logbookJumps.dropzoneId, logbookJumps.location),
		db.select({ y: year, n, ff }).from(logbookJumps).where(eq(logbookJumps.userId, userId)).groupBy(year)
	]);
	const byPlace = new Map<string, BreakdownRow>();
	for (const p of places) {
		const key = p.dz ? `dz:${p.dz}` : `loc:${p.loc ?? ''}`;
		const label = p.dzName ?? p.loc ?? 'Unknown';
		const row = byPlace.get(key) ?? { key, label, jumps: 0, freefallSeconds: 0 };
		row.jumps += Number(p.n);
		row.freefallSeconds += Number(p.ff);
		byPlace.set(key, row);
	}
	const sortDesc = (a: BreakdownRow, b: BreakdownRow) => b.jumps - a.jumps || a.label.localeCompare(b.label);
	return {
		byType: types
			.map((t) => ({ key: t.k ?? '', label: t.k ?? 'Unknown', jumps: Number(t.n), freefallSeconds: Number(t.ff) }))
			.sort(sortDesc),
		byDropzone: [...byPlace.values()].sort(sortDesc),
		byYear: years
			.map((y) => ({ key: y.y, label: y.y, jumps: Number(y.n), freefallSeconds: Number(y.ff) }))
			.sort((a, b) => b.key.localeCompare(a.key))
	};
}

export type LogbookTotals = {
	/** Jumps logged in this logbook. */
	logged: number;
	/** Current jump number (max(logged numbers, declared count)). */
	totalJumps: number;
	totalFreefallSeconds: number;
	signed: number;
	verified: number;
	lastJumpDate: string | null;
	last30Days: number;
	last12Months: number;
};

export async function logbookTotals(db: Database, userId: string, today: string): Promise<LogbookTotals> {
	const d30 = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
	const d365 = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
	const rows = await db
		.select({
			logged: sql<number>`count(*)`,
			maxNo: sql<number | null>`max(${logbookJumps.jumpNumber})`,
			ff: sql<number | null>`sum(${logbookJumps.freefallSeconds})`,
			signed: sql<number>`sum(case when ${logbookJumps.signedAt} is not null then 1 else 0 end)`,
			verified: sql<number>`sum(case when ${logbookJumps.verified} then 1 else 0 end)`,
			last: sql<string | null>`max(${logbookJumps.jumpDate})`,
			l30: sql<number>`sum(case when ${logbookJumps.jumpDate} > ${d30} then 1 else 0 end)`,
			l365: sql<number>`sum(case when ${logbookJumps.jumpDate} > ${d365} then 1 else 0 end)`,
			declared: declaredJumpCountSql(userId)
		})
		.from(logbookJumps)
		.where(eq(logbookJumps.userId, userId));
	const r = rows[0];
	const declared = Number(r?.declared ?? 0);
	return {
		logged: Number(r?.logged ?? 0),
		totalJumps: Math.max(Number(r?.maxNo ?? 0), declared),
		totalFreefallSeconds: Number(r?.ff ?? 0),
		signed: Number(r?.signed ?? 0),
		verified: Number(r?.verified ?? 0),
		lastJumpDate: r?.last ?? null,
		last30Days: Number(r?.l30 ?? 0),
		last12Months: Number(r?.l365 ?? 0)
	};
}

/** Idempotent bulk import (source='import', deduped on sourceRef). Returns inserted count. */
export async function importJumps(
	db: Database,
	userId: string,
	rows: (JumpInput & { jumpNumber: number; sourceRef: string; signerName?: string | null; signerLicence?: string | null })[],
	now = Date.now()
): Promise<number> {
	const before = (await db.select({ n: sql<number>`count(*)` }).from(logbookJumps).where(eq(logbookJumps.userId, userId)))[0];
	const values = rows.filter((r) => isIsoDate(r.jumpDate)).map((r) => ({
		id: newId(),
		userId,
		jumpNumber: r.jumpNumber,
		jumpDate: r.jumpDate,
		dropzoneId: r.dropzoneId ?? null,
		location: r.location ?? null,
		aircraft: r.aircraft ?? null,
		altitudeFt: r.altitudeFt ?? null,
		freefallSeconds: r.freefallSeconds ?? null,
		jumpType: r.jumpType ?? null,
		description: r.description ?? null,
		signerName: r.signerName ?? null,
		signerLicence: r.signerLicence ?? null,
		source: 'import' as const,
		sourceRef: r.sourceRef,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	}));
	await runAtomic(db, chunkedInsert(db, logbookJumps, values, { onConflictDoNothing: true }));
	const after = (await db.select({ n: sql<number>`count(*)` }).from(logbookJumps).where(eq(logbookJumps.userId, userId)))[0];
	return Number(after.n) - Number(before.n);
}
