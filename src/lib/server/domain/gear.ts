import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, gearServiceEvents, rigs, users, type Rig } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { DEFAULT_REPACK_DAYS, type DueStatus, type GearServiceKind, type RigKind } from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';
import { notify } from './notifications.ts';
import { listUsersWithRole } from './permissions.ts';
import { addDays, daysBetween, isIsoDate, localDate } from './time.ts';

/** Country default reserve repack intervals (days). Extend as regulations are confirmed. */
export const COUNTRY_REPACK_DAYS: Record<string, number> = {
	ZA: 180,
	US: 180
};
export const DEFAULT_WARN_DAYS = 30;

/** Interval precedence: rig override → dropzone override → country default → 180. */
export function repackIntervalDays(opts: { rig?: Pick<Rig, 'repackIntervalDays'> | null; dropzoneDays?: number | null; country?: string | null }): number {
	return (
		opts.rig?.repackIntervalDays ??
		opts.dropzoneDays ??
		(opts.country ? COUNTRY_REPACK_DAYS[opts.country.toUpperCase()] : undefined) ??
		DEFAULT_REPACK_DAYS
	);
}

export type DueInfo = { dueOn: string | null; daysLeft: number | null; status: DueStatus };

/** Pure: status of a due date relative to today. */
export function dueStatus(dueOn: string | null | undefined, today: string, warnDays = DEFAULT_WARN_DAYS): DueInfo {
	if (!dueOn || !isIsoDate(dueOn)) return { dueOn: null, daysLeft: null, status: 'unknown' };
	const daysLeft = daysBetween(today, dueOn);
	return { dueOn, daysLeft, status: daysLeft < 0 ? 'overdue' : daysLeft <= warnDays ? 'due_soon' : 'ok' };
}

/** Pure: reserve repack due status. */
export function repackStatus(
	rig: Pick<Rig, 'reserveRepackedOn' | 'repackIntervalDays'>,
	opts: { today: string; intervalDays?: number; warnDays?: number }
): DueInfo {
	if (!rig.reserveRepackedOn) return { dueOn: null, daysLeft: null, status: 'unknown' };
	const interval = rig.repackIntervalDays ?? opts.intervalDays ?? DEFAULT_REPACK_DAYS;
	return dueStatus(addDays(rig.reserveRepackedOn, interval), opts.today, opts.warnDays);
}

/** Pure: AAD service status (service due or end-of-life, whichever is first). */
export function aadStatus(rig: Pick<Rig, 'aadServiceDueOn' | 'aadExpiresOn'>, opts: { today: string; warnDays?: number }): DueInfo {
	const dates = [rig.aadServiceDueOn, rig.aadExpiresOn].filter((d): d is string => !!d && isIsoDate(d)).sort();
	return dueStatus(dates[0], opts.today, opts.warnDays);
}

/** Pure: wing loading (lb/sqft) from exit weight (kg) and canopy size. */
export function wingLoading(exitWeightKg: number | null | undefined, canopySqft: number | null | undefined): number | null {
	if (!exitWeightKg || !canopySqft) return null;
	return Math.round(((exitWeightKg * 2.20462) / canopySqft) * 100) / 100;
}

export type RigInput = {
	kind?: RigKind;
	name?: string | null;
	container?: string | null;
	mainCanopy?: string | null;
	mainSizeSqft?: number | null;
	wingLoading?: number | null;
	reserveCanopy?: string | null;
	reserveSizeSqft?: number | null;
	reserveRepackedOn?: string | null;
	repackIntervalDays?: number | null;
	aad?: string | null;
	aadSerial?: string | null;
	aadServiceDueOn?: string | null;
	aadExpiresOn?: string | null;
	wingsuit?: string | null;
	notes?: string | null;
	active?: boolean;
};

const GEAR_DATE_LABELS = {
	reserveRepackedOn: 'Last repack date',
	aadServiceDueOn: 'Next AAD service date',
	aadExpiresOn: 'AAD end of life',
	performedOn: 'Service date',
	nextDueOn: 'Next due date'
} as const;
export type GearDateField = keyof typeof GEAR_DATE_LABELS;
/** Gear dates that record work already done can't be in the future. */
const PAST_ONLY = new Set<GearDateField>(['reserveRepackedOn', 'performedOn']);
/** Mangled years (0101, 2202) from a mistyped date input would make a rig look in date for centuries. */
const MIN_GEAR_DATE = '1900-01-01';
const MAX_DAYS_AHEAD = 30 * 366;

/** Why a typed gear date is implausible, or null when it's fine (one day of time-zone slack for past-only dates). */
export function gearDateProblem(field: GearDateField, date: string, now = Date.now()): string | null {
	const label = GEAR_DATE_LABELS[field];
	if (!isIsoDate(date)) return `${label} must be a valid date`;
	if (date < MIN_GEAR_DATE) return `${label} is too far in the past: check the year`;
	const today = localDate(now);
	if (PAST_ONLY.has(field) && date > addDays(today, 1)) return `${label} is in the future: check the year`;
	if (date > addDays(today, MAX_DAYS_AHEAD)) return `${label} is too far in the future: check the year`;
	return null;
}

function assertGearDate(field: GearDateField, date: string | null | undefined, now: number) {
	if (date == null) return;
	const problem = gearDateProblem(field, date, now);
	if (problem) throw new DomainError('invalid', problem);
}

function validateRig(input: RigInput, now: number) {
	for (const k of ['reserveRepackedOn', 'aadServiceDueOn', 'aadExpiresOn'] as const) assertGearDate(k, input[k], now);
}

/** Personal rig (owner = user) or DZ rig (owner = dropzone). Reserve repack date is required, as in the original. */
export async function createRig(
	db: Database,
	owner: { userId: string } | { dropzoneId: string },
	input: RigInput,
	now = Date.now()
): Promise<Rig> {
	validateRig(input, now);
	if (!input.reserveRepackedOn) throw new DomainError('invalid', 'Please set the reserve repack date');
	const isUser = 'userId' in owner;
	const rows = await db
		.insert(rigs)
		.values({
			...input,
			id: newId(),
			kind: input.kind ?? (isUser ? 'personal' : 'rental'),
			userId: isUser ? owner.userId : null,
			dropzoneId: isUser ? null : owner.dropzoneId,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		})
		.returning();
	return rows[0];
}

export async function updateRig(db: Database, rigId: string, patch: RigInput, now = Date.now()): Promise<Rig> {
	validateRig(patch, now);
	const rows = await db
		.update(rigs)
		.set({ ...patch, updatedAt: new Date(now) })
		.where(eq(rigs.id, rigId))
		.returning();
	return assertFound(rows[0], 'Rig');
}

export async function deleteRig(db: Database, rigId: string): Promise<void> {
	await db.delete(rigs).where(eq(rigs.id, rigId));
}

export async function getRig(db: Database, rigId: string): Promise<Rig | undefined> {
	return (await db.select().from(rigs).where(eq(rigs.id, rigId)).limit(1))[0];
}

export async function listUserRigs(db: Database, userId: string): Promise<Rig[]> {
	return db.select().from(rigs).where(eq(rigs.userId, userId)).orderBy(desc(rigs.createdAt));
}

export async function listDropzoneRigs(db: Database, dropzoneId: string): Promise<Rig[]> {
	return db.select().from(rigs).where(eq(rigs.dropzoneId, dropzoneId)).orderBy(rigs.name);
}

/**
 * Record a service event. A reserve repack moves `reserveRepackedOn`; an AAD service sets the next
 * AAD due date when `nextDueOn` is given.
 */
export async function recordService(
	db: Database,
	input: {
		rigId: string;
		kind: GearServiceKind;
		performedOn: string;
		performedByUserId?: string | null;
		performedByName?: string | null;
		riggerNumber?: string | null;
		notes?: string | null;
		nextDueOn?: string | null;
		now?: number;
	}
) {
	const now = input.now ?? Date.now();
	assertGearDate('performedOn', input.performedOn ?? '', now);
	assertGearDate('nextDueOn', input.nextDueOn, now);
	const rig = assertFound(await getRig(db, input.rigId), 'Rig');
	let byName = input.performedByName ?? null;
	if (!byName && input.performedByUserId) {
		byName = (await db.select({ n: users.name }).from(users).where(eq(users.id, input.performedByUserId)).limit(1))[0]?.n ?? null;
	}
	const ev = (
		await db
			.insert(gearServiceEvents)
			.values({
				id: newId(),
				rigId: rig.id,
				kind: input.kind,
				performedOn: input.performedOn,
				performedByUserId: input.performedByUserId ?? null,
				performedByName: byName,
				riggerNumber: input.riggerNumber ?? null,
				notes: input.notes ?? null,
				createdAt: new Date(now)
			})
			.returning()
	)[0];
	if (input.kind === 'reserve_repack' && (!rig.reserveRepackedOn || input.performedOn >= rig.reserveRepackedOn)) {
		await db.update(rigs).set({ reserveRepackedOn: input.performedOn, updatedAt: new Date(now) }).where(eq(rigs.id, rig.id));
	}
	if (input.kind === 'aad_service' && input.nextDueOn) {
		await db.update(rigs).set({ aadServiceDueOn: input.nextDueOn, updatedAt: new Date(now) }).where(eq(rigs.id, rig.id));
	}
	return ev;
}

export async function listServiceHistory(db: Database, rigId: string) {
	return db.select().from(gearServiceEvents).where(eq(gearServiceEvents.rigId, rigId)).orderBy(desc(gearServiceEvents.performedOn));
}

async function dzGearSettings(db: Database, dropzoneId: string) {
	const dz = assertFound(
		(
			await db
				.select({ name: dropzones.name, country: dropzones.country, days: dropzones.repackIntervalDays, settings: dropzones.settings })
				.from(dropzones)
				.where(eq(dropzones.id, dropzoneId))
				.limit(1)
		)[0],
		'Dropzone'
	);
	return { ...dz, warnDays: dz.settings.gearWarnDays ?? DEFAULT_WARN_DAYS };
}

/** DZ rigs with repack + AAD status, most urgent first. */
export async function dropzoneGearStatus(db: Database, dropzoneId: string, today: string) {
	const dz = await dzGearSettings(db, dropzoneId);
	const intervalDays = repackIntervalDays({ dropzoneDays: dz.days, country: dz.country });
	const list = await listDropzoneRigs(db, dropzoneId);
	return list
		.map((rig) => ({
			rig,
			repack: repackStatus(rig, { today, intervalDays, warnDays: dz.warnDays }),
			aad: aadStatus(rig, { today, warnDays: dz.warnDays })
		}))
		.sort((a, b) => (a.repack.daysLeft ?? 1e9) - (b.repack.daysLeft ?? 1e9));
}

/** "Notify riggers": repack_due notification to every rigger for each DZ rig due soon/overdue. */
export async function notifyRiggersOfDueRepacks(db: Database, dropzoneId: string, today: string, by?: string): Promise<number> {
	const dz = await dzGearSettings(db, dropzoneId);
	const due = (await dropzoneGearStatus(db, dropzoneId, today)).filter((r) => r.repack.status === 'due_soon' || r.repack.status === 'overdue');
	const riggers = (await listUsersWithRole(db, dropzoneId, 'rigger')).map((r) => r.id);
	for (const r of due) {
		await notify(db, {
			userIds: riggers,
			type: 'repack_due',
			dropzoneId,
			actorUserId: by ?? null,
			payload: { dropzoneName: dz.name, rig: r.rig.name ?? r.rig.container ?? 'rig', dueOn: r.repack.dueOn }
		});
	}
	return due.length;
}

/** Next repack due date across a user's active rigs (Home "Reserve Repack" stat). */
export async function nextUserRepack(db: Database, userId: string, today: string, intervalDays = DEFAULT_REPACK_DAYS): Promise<DueInfo> {
	const list = (await listUserRigs(db, userId)).filter((r) => r.active);
	const infos = list.map((r) => repackStatus(r, { today, intervalDays })).filter((i) => i.dueOn);
	infos.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
	return infos[0] ?? { dueOn: null, daysLeft: null, status: 'unknown' };
}

