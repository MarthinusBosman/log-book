import { and, asc, eq, gte, inArray, max } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	aircraft,
	dropzoneFollows,
	dropzones,
	logbookJumps,
	tandemPassengers,
	users,
	loads,
	slots,
	type Dropzone,
	type Load,
	type Slot
} from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import {
	CALL_MINUTES,
	EDITABLE_LOAD_STATUSES,
	SELF_SERVICE_LOAD_STATUSES,
	JUMP_TYPE_LABELS,
	SLOT_STAFF_ROLE_LABELS,
	type JumpType,
	type LoadStatus,
	type SlotExtra,
	type SlotStaffRole
} from '../../domain/constants.ts';
import { chunkedInsert, runAtomic, type Statement } from './atomic.ts';
import { outboxStatementsForJumps } from './federation.ts';
import { DomainError, assertFound } from './errors.ts';
import { notify, notifyStatements } from './notifications.ts';
import { computeSlotPrice, computeStaffPay, getPriceMap, type PriceMap } from './pricing.ts';
import { captureLoadHoldsStatements, getOrCreateAccount, placeHold, releaseHold, releaseHoldStatements, staffPayStatements, updateHold } from './wallet.ts';
import { getOpenCheckin } from './checkins.ts';
import { nextJumpNumber } from './logbook.ts';
import { MINUTE, isIsoDate, localDate } from './time.ts';

// ── pure rules ─────────────────────────────────────────────────────────────

export type LoadStats = {
	used: number;
	free: number;
	/** Σ slot weights + pilot weight. */
	weightKg: number;
	weightLimitKg: number | null;
	full: boolean;
	overweight: boolean;
};

export function loadStats(load: Pick<Load, 'capacity' | 'weightLimitKg' | 'pilotWeightKg'>, loadSlots: Pick<Slot, 'weightKg'>[]): LoadStats {
	const used = loadSlots.length;
	const weightKg = loadSlots.reduce((a, s) => a + (s.weightKg ?? 0), 0) + (load.pilotWeightKg ?? 0);
	return {
		used,
		free: Math.max(0, load.capacity - used),
		weightKg,
		weightLimitKg: load.weightLimitKg ?? null,
		full: used >= load.capacity,
		overweight: load.weightLimitKg != null && weightKg > load.weightLimitKg
	};
}

/** Throws load_full / overweight if adding these slots breaks capacity or the weight limit. */
export function assertFits(
	load: Pick<Load, 'capacity' | 'weightLimitKg' | 'pilotWeightKg'>,
	existing: Pick<Slot, 'weightKg'>[],
	adding: { weightKg: number }[]
): void {
	const s = loadStats(load, existing);
	if (adding.length > s.free) {
		throw new DomainError('load_full', 'There are not enough slots available on this load', { free: s.free, requested: adding.length });
	}
	const newWeight = s.weightKg + adding.reduce((a, x) => a + (x.weightKg ?? 0), 0);
	if (load.weightLimitKg != null && newWeight > load.weightLimitKg) {
		throw new DomainError('overweight', 'This would exceed the aircraft weight limit', {
			weightKg: newWeight,
			weightLimitKg: load.weightLimitKg
		});
	}
}

const TRANSITIONS: Record<LoadStatus, readonly LoadStatus[]> = {
	planned: ['open', 'called', 'boarding', 'cancelled'],
	open: ['planned', 'called', 'boarding', 'cancelled'],
	called: ['open', 'planned', 'boarding', 'cancelled'],
	boarding: ['called', 'departed', 'cancelled'],
	departed: ['landed', 'completed'],
	landed: ['completed'],
	completed: [],
	cancelled: ['planned']
};

export function canTransition(from: LoadStatus, to: LoadStatus): boolean {
	return TRANSITIONS[from].includes(to) || (to === 'completed' && from !== 'cancelled' && from !== 'completed');
}

/** Logbook description like the original: "4 way Belly", "Solo Freeflying", "Tandem jump". */
export function describeJump(jumpType: string, groupSize: number, staffRole?: SlotStaffRole | null): string {
	const label = JUMP_TYPE_LABELS[jumpType as JumpType] ?? jumpType;
	if (jumpType === 'tandem') return staffRole ? `Tandem jump (${SLOT_STAFF_ROLE_LABELS[staffRole]})` : 'Tandem jump';
	if (staffRole) return `${label} jump (${SLOT_STAFF_ROLE_LABELS[staffRole]})`;
	if (groupSize > 1) return `${groupSize} way ${label}`;
	return `Solo ${label}`;
}

// ── reads ──────────────────────────────────────────────────────────────────

export type LoadWithSlots = Load & { slots: Slot[]; stats: LoadStats };

async function dzRow(db: Database, dropzoneId: string): Promise<Dropzone> {
	return assertFound((await db.select().from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0], 'Dropzone');
}

export async function getLoad(db: Database, loadId: string): Promise<LoadWithSlots> {
	const load = assertFound((await db.select().from(loads).where(eq(loads.id, loadId)).limit(1))[0], 'Load');
	const list = await db.select().from(slots).where(eq(slots.loadId, loadId)).orderBy(asc(slots.position), asc(slots.createdAt));
	return { ...load, slots: list, stats: loadStats(load, list) };
}

/** All loads of a DZ-local day with their slots, by load number. */
export async function listLoadsForDay(
	db: Database,
	dropzoneId: string,
	day: string,
	opts: { onlyOpen?: boolean; includeCancelled?: boolean } = {}
): Promise<LoadWithSlots[]> {
	const list = await db
		.select()
		.from(loads)
		.where(and(eq(loads.dropzoneId, dropzoneId), eq(loads.day, day)))
		.orderBy(asc(loads.loadNumber));
	const filtered = list.filter(
		(l) =>
			(opts.includeCancelled || l.status !== 'cancelled') &&
			(!opts.onlyOpen || (l.isOpen && l.status !== 'completed' && EDITABLE_LOAD_STATUSES.includes(l.status)))
	);
	if (filtered.length === 0) return [];
	const allSlots = await db
		.select()
		.from(slots)
		.where(inArray(slots.loadId, filtered.map((l) => l.id)))
		.orderBy(asc(slots.position), asc(slots.createdAt));
	return filtered.map((l) => {
		const s = allSlots.filter((x) => x.loadId === l.id);
		return { ...l, slots: s, stats: loadStats(l, s) };
	});
}

export async function nextLoadNumber(db: Database, dropzoneId: string, day: string): Promise<number> {
	const r = await db
		.select({ n: max(loads.loadNumber) })
		.from(loads)
		.where(and(eq(loads.dropzoneId, dropzoneId), eq(loads.day, day)));
	return Number(r[0]?.n ?? 0) + 1;
}

// ── load CRUD ──────────────────────────────────────────────────────────────

export type CreateLoadsInput = {
	dropzoneId: string;
	/** DZ-local YYYY-MM-DD */
	day: string;
	count?: number;
	aircraftId?: string | null;
	/** Custom plane (or override of the aircraft's values). */
	aircraftName?: string | null;
	capacity?: number;
	weightLimitKg?: number | null;
	pilotUserId?: string | null;
	pilotName?: string | null;
	pilotWeightKg?: number | null;
	requirements?: string | null;
	/** "Automatically open load/s for jumpers?" */
	open?: boolean;
	scheduledAt?: number | null;
	/** With `scheduledAt` and several loads: minutes between consecutive loads (0 = all at the same time). */
	spacingMinutes?: number | null;
	createdBy?: string | null;
	now?: number;
};

/** Upper bound for the gap between batch-created loads (10 h covers a whole day's spread). */
export const MAX_LOAD_SPACING_MINUTES = 600;

/** Batch-create loads; numbers continue from the day's existing loads. Notifies DZ followers. */
export async function createLoads(db: Database, input: CreateLoadsInput): Promise<Load[]> {
	if (!isIsoDate(input.day)) throw new DomainError('invalid', 'Please select a date for the load/s');
	const count = input.count ?? 1;
	if (!Number.isInteger(count) || count < 1 || count > 50) throw new DomainError('invalid', 'Number of loads must be 1–50');
	const spacing = input.spacingMinutes ?? 0;
	if (!Number.isInteger(spacing) || spacing < 0 || spacing > MAX_LOAD_SPACING_MINUTES)
		throw new DomainError('invalid', `Minutes between loads must be 0–${MAX_LOAD_SPACING_MINUTES}`);
	const now = input.now ?? Date.now();
	const dz = await dzRow(db, input.dropzoneId);
	const plane = input.aircraftId
		? assertFound(
				(await db.select().from(aircraft).where(and(eq(aircraft.id, input.aircraftId), eq(aircraft.dropzoneId, dz.id))).limit(1))[0],
				'Aircraft'
			)
		: null;
	const capacity = input.capacity ?? plane?.capacity ?? dz.settings.defaultCapacity ?? undefined;
	if (!capacity || capacity < 1) throw new DomainError('invalid', 'Load capacity (slots) is required');
	let pilotName = input.pilotName ?? null;
	const pilotUserId = input.pilotUserId ?? plane?.defaultPilotId ?? null;
	let pilotWeightKg = input.pilotWeightKg ?? null;
	if (pilotUserId && (!pilotName || pilotWeightKg == null)) {
		const p = (await db.select({ n: users.name, w: users.weightKg }).from(users).where(eq(users.id, pilotUserId)).limit(1))[0];
		pilotName ??= p?.n ?? null;
		pilotWeightKg ??= p?.w ?? null;
	}
	const first = await nextLoadNumber(db, dz.id, input.day);
	if (input.scheduledAt != null && count > 1 && spacing > 0) {
		const last = input.scheduledAt + (count - 1) * spacing * MINUTE;
		if (localDate(last, dz.timezone) !== localDate(input.scheduledAt, dz.timezone))
			throw new DomainError('invalid', `${count} loads ${spacing} minutes apart run past midnight: use fewer loads or a shorter gap`);
	}
	const rows = Array.from({ length: count }, (_, i) => ({
		id: newId(),
		dropzoneId: dz.id,
		day: input.day,
		loadNumber: first + i,
		status: (input.open ? 'open' : 'planned') as LoadStatus,
		isOpen: !!input.open,
		aircraftId: plane?.id ?? null,
		aircraftName: input.aircraftName ?? plane?.name ?? null,
		capacity,
		weightLimitKg: input.weightLimitKg !== undefined ? input.weightLimitKg : (plane?.weightLimitKg ?? null),
		pilotUserId,
		pilotName,
		pilotWeightKg,
		requirements: input.requirements ?? null,
		scheduledAt: input.scheduledAt != null ? new Date(input.scheduledAt + i * spacing * MINUTE) : null,
		createdBy: input.createdBy ?? null,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	}));
	const followers = await db
		.select({ u: dropzoneFollows.userId })
		.from(dropzoneFollows)
		.where(and(eq(dropzoneFollows.dropzoneId, dz.id), eq(dropzoneFollows.notify, true)));
	await runAtomic(db, [
		...chunkedInsert(db, loads, rows),
		...notifyStatements(db, {
			userIds: followers.map((f) => f.u).filter((u) => u !== input.createdBy),
			type: 'new_loads',
			dropzoneId: dz.id,
			actorUserId: input.createdBy,
			payload: { dropzoneName: dz.name, count, day: input.day },
			now
		})
	]);
	return db.select().from(loads).where(inArray(loads.id, rows.map((r) => r.id))).orderBy(asc(loads.loadNumber));
}

export type LoadPatch = Partial<
	Pick<Load, 'aircraftId' | 'aircraftName' | 'capacity' | 'weightLimitKg' | 'pilotUserId' | 'pilotName' | 'pilotWeightKg' | 'requirements' | 'refuel' | 'shutdownMinutes'>
> & { scheduledAt?: number | null };

/** Edit plane/pilot/flags. Selecting an aircraft copies its name/capacity/limit unless given. */
export async function updateLoad(db: Database, loadId: string, patch: LoadPatch, now = Date.now()): Promise<LoadWithSlots> {
	const load = await getLoad(db, loadId);
	const set: Record<string, unknown> = { ...patch, updatedAt: new Date(now) };
	if (patch.scheduledAt !== undefined) set.scheduledAt = patch.scheduledAt == null ? null : new Date(patch.scheduledAt);
	if (patch.aircraftId) {
		const plane = assertFound((await db.select().from(aircraft).where(eq(aircraft.id, patch.aircraftId)).limit(1))[0], 'Aircraft');
		set.aircraftName = patch.aircraftName ?? plane.name;
		set.capacity = patch.capacity ?? plane.capacity;
		set.weightLimitKg = patch.weightLimitKg !== undefined ? patch.weightLimitKg : plane.weightLimitKg;
	}
	if (patch.pilotUserId && (patch.pilotName === undefined || patch.pilotWeightKg === undefined)) {
		const p = (await db.select({ n: users.name, w: users.weightKg }).from(users).where(eq(users.id, patch.pilotUserId)).limit(1))[0];
		if (patch.pilotName === undefined) set.pilotName = p?.n ?? null;
		if (patch.pilotWeightKg === undefined) set.pilotWeightKg = p?.w ?? null;
	}
	if (patch.shutdownMinutes != null && (!Number.isInteger(patch.shutdownMinutes) || patch.shutdownMinutes < 0)) {
		throw new DomainError('invalid', 'Shutdown minutes must be a positive whole number');
	}
	const next = { ...load, ...set } as Load;
	if ((next.capacity ?? 0) < load.slots.length) {
		throw new DomainError('load_full', 'Capacity is lower than the number of manifested slots');
	}
	await db.update(loads).set(set).where(eq(loads.id, loadId));
	return getLoad(db, loadId);
}

/** Open (jumpers may self-manifest) / close a load. */
export async function setLoadOpen(db: Database, loadId: string, open: boolean, now = Date.now()): Promise<void> {
	const load = await getLoad(db, loadId);
	if (!EDITABLE_LOAD_STATUSES.includes(load.status)) throw new DomainError('load_locked', 'Load can no longer be opened/closed');
	const status: LoadStatus =
		open && load.status === 'planned' ? 'open' : !open && load.status === 'open' ? 'planned' : load.status;
	await db.update(loads).set({ isOpen: open, status, updatedAt: new Date(now) }).where(eq(loads.id, loadId));
}

/** Delete a load (not completed). Releases every wallet hold first. */
export async function deleteLoad(db: Database, loadId: string, opts: { by?: string | null; now?: number } = {}): Promise<void> {
	const load = await getLoad(db, loadId);
	if (load.status === 'completed') throw new DomainError('load_locked', 'Completed loads cannot be deleted');
	for (const s of load.slots) await releaseHold(db, s.id, { origin: 'load_deleted', by: opts.by, now: opts.now });
	await db.delete(loads).where(eq(loads.id, loadId));
}

// ── status lifecycle ───────────────────────────────────────────────────────

async function setStatus(db: Database, load: Load, to: LoadStatus, extra: Partial<Load>, now: number): Promise<void> {
	if (!canTransition(load.status, to)) {
		throw new DomainError('invalid_transition', `Cannot move load from ${load.status} to ${to}`);
	}
	await db
		.update(loads)
		.set({ ...extra, status: to, updatedAt: new Date(now) })
		.where(eq(loads.id, load.id));
}

function jumperIds(load: LoadWithSlots): string[] {
	return [...new Set(load.slots.map((s) => s.userId).filter((u): u is string => !!u))];
}

/** 20-minute call: starts the countdown and notifies everyone on the load. */
export async function startCall(db: Database, loadId: string, opts: { minutes?: number; now?: number; by?: string | null } = {}): Promise<Load> {
	const now = opts.now ?? Date.now();
	const load = await getLoad(db, loadId);
	const minutes = opts.minutes ?? CALL_MINUTES;
	await setStatus(db, load, 'called', { callStartedAt: new Date(now), callDueAt: new Date(now + minutes * MINUTE) }, now);
	const dz = await dzRow(db, load.dropzoneId);
	await notify(db, {
		userIds: jumperIds(load),
		type: 'call_20min',
		dropzoneId: load.dropzoneId,
		actorUserId: opts.by,
		payload: { dropzoneName: dz.name, loadNumber: load.loadNumber, minutes },
		now
	});
	return (await getLoad(db, loadId)) as Load;
}

/** Cancel the call (back to open/planned, timer cleared). */
export async function cancelCall(db: Database, loadId: string, now = Date.now()): Promise<void> {
	const load = await getLoad(db, loadId);
	if (load.status !== 'called') throw new DomainError('invalid_transition', 'Load has no active call');
	await setStatus(db, load, load.isOpen ? 'open' : 'planned', { callStartedAt: null, callDueAt: null }, now);
}

/** "Gear up & go" → boarding. */
export async function boardLoad(db: Database, loadId: string, opts: { now?: number; by?: string | null } = {}): Promise<void> {
	const now = opts.now ?? Date.now();
	const load = await getLoad(db, loadId);
	await setStatus(db, load, 'boarding', { boardingAt: new Date(now) }, now);
	const dz = await dzRow(db, load.dropzoneId);
	await notify(db, {
		userIds: jumperIds(load),
		type: 'gear_up',
		dropzoneId: load.dropzoneId,
		actorUserId: opts.by,
		payload: { dropzoneName: dz.name, loadNumber: load.loadNumber },
		now
	});
}

export async function departLoad(db: Database, loadId: string, now = Date.now()): Promise<void> {
	const load = await getLoad(db, loadId);
	await setStatus(db, load, 'departed', { departedAt: new Date(now), isOpen: false }, now);
}

export async function landLoad(db: Database, loadId: string, now = Date.now()): Promise<void> {
	const load = await getLoad(db, loadId);
	await setStatus(db, load, 'landed', { landedAt: new Date(now) }, now);
}

/** Cancel: releases all holds, keeps the slots for reference. */
export async function cancelLoad(db: Database, loadId: string, opts: { now?: number; by?: string | null } = {}): Promise<void> {
	const now = opts.now ?? Date.now();
	const load = await getLoad(db, loadId);
	if (!canTransition(load.status, 'cancelled')) throw new DomainError('invalid_transition', `Cannot cancel a ${load.status} load`);
	for (const s of load.slots) await releaseHold(db, s.id, { origin: 'load_cancelled', by: opts.by, now });
	await setStatus(db, load, 'cancelled', { cancelledAt: new Date(now), isOpen: false }, now);
}

export type CompleteResult = { load: Load; logbookEntries: number; chargedSlotIds: string[]; notified: number };

/**
 * Mark a load completed. In one atomic write:
 *  - capture wallet holds (release + charge, slots marked paid)
 *  - logbook entry (source='load', verified) for every slot with a user account
 *  - pilot pay on the load; staff pay credited to wallets when the DZ pays staff via wallet
 *  - tandem passengers → completed; `load_completed` notifications
 */
export async function completeLoad(db: Database, loadId: string, opts: { now?: number; by?: string | null } = {}): Promise<CompleteResult> {
	const now = opts.now ?? Date.now();
	const load = await getLoad(db, loadId);
	if (load.status === 'completed') throw new DomainError('invalid_transition', 'This load has already been marked as completed');
	if (load.status === 'cancelled') throw new DomainError('invalid_transition', 'Cannot complete a cancelled load');
	const dz = await dzRow(db, load.dropzoneId);
	const prices = await getPriceMap(db, dz.id);
	const statements: Statement[] = [];

	const capture = await captureLoadHoldsStatements(db, loadId, now);
	statements.push(...capture.statements);

	const groupSize = new Map<string, number>();
	for (const s of load.slots) if (s.groupId) groupSize.set(s.groupId, (groupSize.get(s.groupId) ?? 0) + 1);
	const jumps: (typeof logbookJumps.$inferInsert)[] = [];
	const seen = new Set<string>();
	for (const s of load.slots) {
		if (!s.userId || seen.has(s.userId)) continue;
		seen.add(s.userId);
		const size = s.groupId ? (groupSize.get(s.groupId) ?? 1) : 1;
		const existing = await db
			.select({ id: logbookJumps.id })
			.from(logbookJumps)
			.where(and(eq(logbookJumps.userId, s.userId), eq(logbookJumps.source, 'load'), eq(logbookJumps.sourceRef, s.id)))
			.limit(1);
		if (existing[0]) continue;
		jumps.push({
			id: newId(),
			userId: s.userId,
			jumpNumber: await nextJumpNumber(db, s.userId),
			jumpDate: load.day,
			dropzoneId: dz.id,
			location: dz.name,
			aircraft: load.aircraftName,
			altitudeFt: dz.settings.defaultAltitudeFt ?? null,
			jumpType: s.jumpType,
			description: describeJump(s.jumpType, size, s.staffRole),
			verified: true,
			source: 'load',
			sourceRef: s.id,
			slotId: s.id,
			loadId: load.id,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		});
	}
	statements.push(...chunkedInsert(db, logbookJumps, jumps, { onConflictDoNothing: true }));
	// Federation: queue the new entries of jumpers linked to a global account.
	statements.push(...(await outboxStatementsForJumps(db, jumps, now)));

	const pilotPayMinor = load.pilotUserId || load.pilotName ? (prices.pay_pilot ?? 0) : 0;

	if (dz.settings.staffPayToWallet) {
		const payByUser = new Map<string, { amountMinor: number; slotId?: string; loadId: string; reason: string }[]>();
		for (const s of load.slots) {
			if (s.userId && s.staffPayMinor > 0) {
				payByUser.set(s.userId, [
					...(payByUser.get(s.userId) ?? []),
					{ amountMinor: s.staffPayMinor, slotId: s.id, loadId: load.id, reason: `Load ${load.loadNumber} staff pay` }
				]);
			}
		}
		if (load.pilotUserId && pilotPayMinor > 0) {
			payByUser.set(load.pilotUserId, [
				...(payByUser.get(load.pilotUserId) ?? []),
				{ amountMinor: pilotPayMinor, loadId: load.id, reason: `Load ${load.loadNumber} pilot pay` }
			]);
		}
		for (const [userId, items] of payByUser) {
			const account = await getOrCreateAccount(db, userId, dz.id);
			statements.push(...staffPayStatements(db, account, items, now));
		}
	}

	const tandemIds = load.slots.map((s) => s.tandemPassengerId).filter((t): t is string => !!t);
	if (tandemIds.length) {
		statements.push(db.update(tandemPassengers).set({ status: 'completed' }).where(inArray(tandemPassengers.id, tandemIds)));
	}
	const notifyIds = jumperIds(load);
	statements.push(
		...notifyStatements(db, {
			userIds: notifyIds,
			type: 'load_completed',
			dropzoneId: dz.id,
			actorUserId: opts.by,
			payload: { dropzoneName: dz.name, loadNumber: load.loadNumber, day: load.day },
			now
		})
	);
	statements.push(
		db
			.update(loads)
			.set({ status: 'completed', completedAt: new Date(now), isOpen: false, pilotPayMinor, updatedAt: new Date(now) })
			.where(eq(loads.id, load.id))
	);
	await runAtomic(db, statements);
	return {
		load: (await getLoad(db, loadId)) as Load,
		logbookEntries: jumps.length,
		chargedSlotIds: capture.settledSlotIds,
		notified: notifyIds.length
	};
}

// ── slots ──────────────────────────────────────────────────────────────────

export type SlotInput = {
	userId?: string | null;
	/** Required when there is no userId (custom jumper / passenger). */
	displayName?: string;
	email?: string | null;
	licence?: string | null;
	/** Defaults: check-in weight → user loading weight → 0. */
	weightKg?: number | null;
	jumpType: JumpType;
	extras?: SlotExtra[];
	staffRole?: SlotStaffRole | null;
	isLoadMaster?: boolean;
	groupId?: string | null;
	teamId?: string | null;
	teamName?: string | null;
	tandemPassengerId?: string | null;
	baseOverrideMinor?: number | null;
	depositMinor?: number;
	note?: string | null;
	colour?: string | null;
	/** Extras of the group (e.g. the passenger's handcam → TI handcam pay). */
	groupExtras?: SlotExtra[];
};

export type AddSlotOptions = {
	by?: string | null;
	now?: number;
	/** Staff override of the membership-expiry rule. */
	allowExpired?: boolean;
	/** Self-manifest: enforce load.isOpen. */
	selfManifest?: boolean;
	/** Skip the wallet hold (e.g. staff marked "pay at manifest"). */
	skipWallet?: boolean;
};

async function buildSlotRow(
	db: Database,
	load: Load,
	dz: Dropzone,
	prices: PriceMap,
	input: SlotInput,
	position: number,
	opts: AddSlotOptions,
	now: number
): Promise<typeof slots.$inferInsert> {
	let displayName = input.displayName?.trim() ?? '';
	let weightKg = input.weightKg ?? null;
	let licence = input.licence ?? null;
	let email = input.email ?? null;
	if (input.userId) {
		const u = assertFound((await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0], 'User');
		displayName ||= u.name;
		licence ??= u.licence;
		email ??= u.email;
		if (!opts.allowExpired && u.associationExpiry && u.associationExpiry < load.day) {
			throw new DomainError('membership_expired', `${u.name}'s membership has expired`, { userId: u.id, expiry: u.associationExpiry });
		}
		const checkin = await getOpenCheckin(db, dz.id, u.id);
		if (dz.settings.requireCheckin && !checkin) {
			throw new DomainError('not_checked_in', `${u.name} is not checked in`, { userId: u.id });
		}
		weightKg ??= checkin?.weightKg ?? u.loadingWeightKg ?? u.weightKg ?? null;
	}
	if (!displayName) throw new DomainError('invalid', 'Jumper name is required');
	const extras = [...new Set(input.extras ?? [])];
	const price = computeSlotPrice({
		prices,
		jumpType: input.jumpType,
		extras,
		staffRole: input.staffRole,
		baseOverrideMinor: input.baseOverrideMinor,
		depositMinor: input.depositMinor
	});
	return {
		id: newId(),
		dropzoneId: dz.id,
		loadId: load.id,
		userId: input.userId ?? null,
		displayName,
		email,
		licence,
		weightKg: weightKg ?? 0,
		jumpType: input.jumpType,
		groupId: input.groupId ?? null,
		teamId: input.teamId ?? null,
		teamName: input.teamName ?? null,
		tandemPassengerId: input.tandemPassengerId ?? null,
		staffRole: input.staffRole ?? null,
		isLoadMaster: input.isLoadMaster ?? false,
		extras,
		baseOverrideMinor: input.baseOverrideMinor ?? null,
		priceBreakdown: price.lines,
		depositMinor: price.depositMinor,
		totalMinor: price.totalMinor,
		currency: dz.currency,
		staffPayMinor: computeStaffPay(prices, input.staffRole, input.groupExtras ?? []),
		note: input.note ?? null,
		colour: input.colour ?? null,
		position,
		createdBy: opts.by ?? null,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	};
}

/**
 * Add several slots to a load all-or-nothing: capacity + weight (incl. pilot) checked up front,
 * duplicates refused, wallet holds placed; any hold failure rolls the whole group back.
 */
export async function addSlots(db: Database, loadId: string, inputs: SlotInput[], opts: AddSlotOptions = {}): Promise<Slot[]> {
	if (inputs.length === 0) return [];
	const now = opts.now ?? Date.now();
	const load = await getLoad(db, loadId);
	if (!EDITABLE_LOAD_STATUSES.includes(load.status)) throw new DomainError('load_locked', 'This load is closed for changes');
	if (opts.selfManifest) assertSelfService(load);
	if (opts.selfManifest && !load.isOpen) throw new DomainError('load_locked', 'This load is not open for jumpers');
	const onLoad = new Set(load.slots.map((s) => s.userId).filter(Boolean));
	const adding = new Set<string>();
	for (const i of inputs) {
		if (!i.userId) continue;
		if (onLoad.has(i.userId) || adding.has(i.userId)) {
			throw new DomainError('already_on_load', 'Already on load', { userId: i.userId });
		}
		adding.add(i.userId);
	}
	const dz = await dzRow(db, load.dropzoneId);
	const prices = await getPriceMap(db, dz.id);
	const start = load.slots.reduce((m, s) => Math.max(m, s.position), -1) + 1;
	const rows = [];
	for (let i = 0; i < inputs.length; i++) rows.push(await buildSlotRow(db, load, dz, prices, inputs[i], start + i, opts, now));
	assertFits(load, load.slots, rows.map((r) => ({ weightKg: r.weightKg ?? 0 })));
	await runAtomic(db, chunkedInsert(db, slots, rows));
	if (!opts.skipWallet && dz.walletEnabled) {
		const placed: string[] = [];
		try {
			for (const r of rows) {
				await placeHold(db, r.id!, { now, by: opts.by });
				placed.push(r.id!);
			}
		} catch (e) {
			for (const id of placed) await releaseHold(db, id, { origin: 'manifest_failed', now });
			await db.delete(slots).where(inArray(slots.id, rows.map((r) => r.id!)));
			throw e;
		}
	}
	const toNotify = rows.map((r) => r.userId).filter((u): u is string => !!u && u !== opts.by);
	await notify(db, {
		userIds: toNotify,
		type: 'added_to_load',
		dropzoneId: dz.id,
		actorUserId: opts.by,
		payload: { dropzoneName: dz.name, loadNumber: load.loadNumber },
		now
	});
	return db.select().from(slots).where(inArray(slots.id, rows.map((r) => r.id!))).orderBy(asc(slots.position));
}

export async function addSlot(db: Database, loadId: string, input: SlotInput, opts: AddSlotOptions = {}): Promise<Slot> {
	return (await addSlots(db, loadId, [input], opts))[0];
}

/** Jumper self-manifest ("Join this Load"). */
export async function joinLoad(
	db: Database,
	input: { loadId: string; userId: string; jumpType: JumpType; extras?: SlotExtra[]; now?: number }
): Promise<Slot> {
	return addSlot(db, input.loadId, { userId: input.userId, jumpType: input.jumpType, extras: input.extras }, {
		by: input.userId,
		selfManifest: true,
		now: input.now
	});
}

/**
 * Tandem group: passenger slot (+ TI, + optional videographer) sharing one groupId.
 * Passenger price = tandem slot + booked extras − deposit; TI pay includes handcam pay.
 */
export async function addTandemGroup(
	db: Database,
	input: { loadId: string; passengerId: string; instructorUserId: string; videographerUserId?: string | null; note?: string | null },
	opts: AddSlotOptions = {}
): Promise<Slot[]> {
	const p = assertFound(
		(await db.select().from(tandemPassengers).where(eq(tandemPassengers.id, input.passengerId)).limit(1))[0],
		'Tandem passenger'
	);
	if (p.manifested) throw new DomainError('already_on_load', `${p.name} is already manifested`);
	const groupId = newId();
	const extras = p.extras ?? [];
	const list: SlotInput[] = [
		{
			displayName: p.name,
			email: p.email,
			weightKg: p.weightKg ?? 0,
			jumpType: 'tandem',
			extras,
			tandemPassengerId: p.id,
			depositMinor: p.depositMinor,
			groupId,
			note: input.note ?? p.note
		},
		{ userId: input.instructorUserId, jumpType: 'tandem', staffRole: 'tandem_instructor', groupId, groupExtras: extras, tandemPassengerId: p.id }
	];
	if (input.videographerUserId) {
		list.push({ userId: input.videographerUserId, jumpType: 'tandem', staffRole: 'videographer', groupId, tandemPassengerId: p.id });
	}
	const created = await addSlots(db, input.loadId, list, opts);
	await db.update(tandemPassengers).set({ manifested: true, status: 'manifested' }).where(eq(tandemPassengers.id, p.id));
	return created;
}

export type SlotPatch = Partial<
	Pick<SlotInput, 'jumpType' | 'extras' | 'staffRole' | 'isLoadMaster' | 'groupId' | 'teamId' | 'teamName' | 'baseOverrideMinor' | 'depositMinor' | 'note' | 'colour' | 'weightKg' | 'displayName'>
>;

/** Change jump type / extras / price override / flags; recomputes price and adjusts the wallet hold. */
export async function updateSlot(
	db: Database,
	slotId: string,
	patch: SlotPatch,
	opts: { by?: string | null; now?: number; selfService?: boolean } = {}
): Promise<Slot> {
	const now = opts.now ?? Date.now();
	const slot = assertFound((await db.select().from(slots).where(eq(slots.id, slotId)).limit(1))[0], 'Slot');
	const load = await getLoad(db, slot.loadId);
	if (!EDITABLE_LOAD_STATUSES.includes(load.status)) throw new DomainError('load_locked', 'This load is closed for changes');
	if (opts.selfService) assertSelfService(load);
	if (slot.paid && (patch.jumpType || patch.extras || patch.baseOverrideMinor !== undefined)) {
		throw new DomainError('conflict', 'Slot is already paid');
	}
	if (patch.weightKg != null && patch.weightKg > slot.weightKg) {
		assertFits({ ...load, capacity: load.capacity + 1 }, load.slots.filter((s) => s.id !== slot.id), [{ weightKg: patch.weightKg }]);
	}
	const prices = await getPriceMap(db, slot.dropzoneId);
	const merged = {
		jumpType: patch.jumpType ?? (slot.jumpType as JumpType),
		extras: patch.extras ?? slot.extras,
		staffRole: patch.staffRole !== undefined ? patch.staffRole : slot.staffRole,
		baseOverrideMinor: patch.baseOverrideMinor !== undefined ? patch.baseOverrideMinor : slot.baseOverrideMinor,
		depositMinor: patch.depositMinor ?? slot.depositMinor
	};
	const price = computeSlotPrice({ prices, ...merged });
	const groupExtras =
		merged.staffRole === 'tandem_instructor' && slot.groupId
			? (load.slots.find((s) => s.groupId === slot.groupId && s.tandemPassengerId && !s.staffRole)?.extras ?? [])
			: [];
	await db
		.update(slots)
		.set({
			...patch,
			weightKg: patch.weightKg ?? slot.weightKg,
			extras: [...new Set(merged.extras)],
			priceBreakdown: price.lines,
			depositMinor: price.depositMinor,
			totalMinor: price.totalMinor,
			staffPayMinor: computeStaffPay(prices, merged.staffRole, groupExtras),
			updatedAt: new Date(now)
		})
		.where(eq(slots.id, slotId));
	const dz = await dzRow(db, slot.dropzoneId);
	if (dz.walletEnabled && slot.userId && !slot.paid) {
		try {
			await updateHold(db, slotId, { now, by: opts.by });
		} catch (e) {
			// roll back the price change if the wallet can't cover it
			await db
				.update(slots)
				.set({
					jumpType: slot.jumpType,
					extras: slot.extras,
					staffRole: slot.staffRole,
					baseOverrideMinor: slot.baseOverrideMinor,
					priceBreakdown: slot.priceBreakdown,
					depositMinor: slot.depositMinor,
					totalMinor: slot.totalMinor,
					staffPayMinor: slot.staffPayMinor
				})
				.where(eq(slots.id, slotId));
			throw e;
		}
	}
	return (await db.select().from(slots).where(eq(slots.id, slotId)).limit(1))[0];
}

/** Remove a slot (or its whole group with `withGroup`). Releases holds; notifies removed users. */
export async function removeSlot(
	db: Database,
	slotId: string,
	opts: { by?: string | null; now?: number; withGroup?: boolean } = {}
): Promise<number> {
	const now = opts.now ?? Date.now();
	const slot = assertFound((await db.select().from(slots).where(eq(slots.id, slotId)).limit(1))[0], 'Slot');
	const load = await getLoad(db, slot.loadId);
	if (!EDITABLE_LOAD_STATUSES.includes(load.status)) throw new DomainError('load_locked', 'This load is closed for changes');
	const targets = opts.withGroup && slot.groupId ? load.slots.filter((s) => s.groupId === slot.groupId) : [slot];
	const statements: Statement[] = [];
	for (const t of targets) {
		const rel = await releaseHoldStatements(db, t.id, { origin: 'slot_removed', by: opts.by, now });
		if (rel) statements.push(...rel.statements);
	}
	const ids = targets.map((t) => t.id);
	statements.push(db.delete(slots).where(inArray(slots.id, ids)));
	const passengerIds = targets.map((t) => t.tandemPassengerId).filter((x): x is string => !!x);
	if (passengerIds.length && targets.some((t) => t.tandemPassengerId && !t.staffRole)) {
		statements.push(
			db.update(tandemPassengers).set({ manifested: false, status: 'registered' }).where(inArray(tandemPassengers.id, passengerIds))
		);
	}
	const dz = await dzRow(db, load.dropzoneId);
	statements.push(
		...notifyStatements(db, {
			userIds: targets.map((t) => t.userId).filter((u) => u !== opts.by),
			type: 'removed_from_load',
			dropzoneId: dz.id,
			actorUserId: opts.by,
			payload: { dropzoneName: dz.name, loadNumber: load.loadNumber },
			now
		})
	);
	await runAtomic(db, statements);
	return ids.length;
}

/**
 * Jumper-initiated changes (join, leave, change jump type) stop once the load is boarding:
 * after "Gear up & go" only manifest edits it, so staff never board with a list they didn't see.
 */
export function assertSelfService(load: Pick<Load, 'status' | 'loadNumber'>): void {
	if (SELF_SERVICE_LOAD_STATUSES.includes(load.status)) return;
	if (load.status === 'boarding') {
		throw new DomainError('load_locked', `Load ${load.loadNumber} is boarding: ask manifest to make changes`);
	}
	throw new DomainError('load_locked', 'This load is closed for changes');
}

/** Jumper leaves a load themselves. */
export async function leaveLoad(db: Database, loadId: string, userId: string, now = Date.now()): Promise<void> {
	const s = (await db.select().from(slots).where(and(eq(slots.loadId, loadId), eq(slots.userId, userId))).limit(1))[0];
	if (!s) throw new DomainError('not_found', 'You are not on this load');
	assertSelfService(await getLoad(db, loadId));
	await removeSlot(db, s.id, { by: userId, now });
}

/**
 * Move a slot (or its group) to another load of the same DZ: capacity/weight checked on the target.
 * Holds stay in place (same DZ wallet); ledger entries keep the old load ref.
 */
export async function moveSlot(
	db: Database,
	slotId: string,
	toLoadId: string,
	opts: { by?: string | null; now?: number; withGroup?: boolean } = {}
): Promise<void> {
	const now = opts.now ?? Date.now();
	const slot = assertFound((await db.select().from(slots).where(eq(slots.id, slotId)).limit(1))[0], 'Slot');
	const from = await getLoad(db, slot.loadId);
	const to = await getLoad(db, toLoadId);
	if (from.id === to.id) return;
	if (to.dropzoneId !== from.dropzoneId) throw new DomainError('invalid', 'Loads are at different dropzones');
	for (const l of [from, to]) {
		if (!EDITABLE_LOAD_STATUSES.includes(l.status)) throw new DomainError('load_locked', `Load ${l.loadNumber} is closed for changes`);
	}
	const targets = opts.withGroup && slot.groupId ? from.slots.filter((s) => s.groupId === slot.groupId) : [slot];
	const onTarget = new Set(to.slots.map((s) => s.userId).filter(Boolean));
	if (targets.some((t) => t.userId && onTarget.has(t.userId))) throw new DomainError('already_on_load', 'Already on the target load');
	assertFits(to, to.slots, targets);
	const start = to.slots.reduce((m, s) => Math.max(m, s.position), -1) + 1;
	const dz = await dzRow(db, from.dropzoneId);
	await runAtomic(db, [
		...targets.map((t, i) =>
			db.update(slots).set({ loadId: to.id, position: start + i, updatedAt: new Date(now) }).where(eq(slots.id, t.id))
		),
		...notifyStatements(db, {
			userIds: targets.map((t) => t.userId).filter((u) => u !== opts.by),
			type: 'moved_load',
			dropzoneId: dz.id,
			actorUserId: opts.by,
			payload: { dropzoneName: dz.name, loadNumber: to.loadNumber, fromLoadNumber: from.loadNumber },
			now
		})
	]);
}

/**
 * Today's open loads for the jumper "Join a Load" screen / hangar display. Pass the dropzone row
 * (id + timezone) when the caller already has it, to skip re-reading it.
 */
export async function openLoadsToday(db: Database, dropzone: string | Pick<Dropzone, 'id' | 'timezone'>, now = Date.now()): Promise<LoadWithSlots[]> {
	const dz = typeof dropzone === 'string' ? await dzRow(db, dropzone) : dropzone;
	return listLoadsForDay(db, dz.id, localDate(now, dz.timezone), { onlyOpen: true });
}

/**
 * The user's slots on loads that haven't flown yet (planned … boarding), from `fromDay` on —
 * the dashboard "Next load" card. Soonest first (day, then call due / scheduled time, then number).
 */
export async function upcomingSlotsForUser(db: Database, userId: string, fromDay: string) {
	const rows = await db
		.select({
			slot: slots,
			load: loads,
			dropzone: { id: dropzones.id, name: dropzones.name, slug: dropzones.slug, timezone: dropzones.timezone }
		})
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.innerJoin(dropzones, eq(dropzones.id, loads.dropzoneId))
		.where(and(eq(slots.userId, userId), gte(loads.day, fromDay), inArray(loads.status, [...EDITABLE_LOAD_STATUSES])))
		.orderBy(asc(loads.day), asc(loads.loadNumber));
	const t = (l: Load) => (l.callDueAt ?? l.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
	return rows.sort((a, b) => a.load.day.localeCompare(b.load.day) || t(a.load) - t(b.load) || a.load.loadNumber - b.load.loadNumber);
}
