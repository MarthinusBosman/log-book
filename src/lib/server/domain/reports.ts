import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { loads, slots, type Load, type Slot } from '../db/schema.ts';
import { AFF_JUMP_TYPES, type JumpType, type LoadStatus } from '../../domain/constants.ts';

export type JumpReport = {
	from: string;
	to: string;
	totals: {
		loads: number;
		slots: number;
		extraAltitude: number;
		maxAltitude: number;
		beachLanding: number;
		tandems: number;
		handcam: number;
		outsideVideo: number;
		extremeRide: number;
		sporties: number;
		aff: number;
		staticLine: number;
		gearRental: number;
		coachJumps: number;
	};
	perDay: { day: string; loads: number; slots: number; revenueMinor: number }[];
	perAircraft: { aircraft: string; loads: number; slots: number }[];
	perStaff: { userId: string | null; name: string; slots: number; payMinor: number }[];
	revenue: { currency: string | null; totalMinor: number; paidMinor: number; outstandingMinor: number; staffPayMinor: number; pilotPayMinor: number };
};

/** Pure: build the report from loads + their slots (counting rules from the original). */
export function buildReport(from: string, to: string, loadList: Load[], slotList: Slot[]): JumpReport {
	const t = {
		loads: loadList.length,
		slots: slotList.length,
		extraAltitude: 0,
		maxAltitude: 0,
		beachLanding: 0,
		tandems: 0,
		handcam: 0,
		outsideVideo: 0,
		extremeRide: 0,
		sporties: 0,
		aff: 0,
		staticLine: 0,
		gearRental: 0,
		coachJumps: 0
	};
	const loadById = new Map(loadList.map((l) => [l.id, l]));
	const perDay = new Map<string, { day: string; loads: number; slots: number; revenueMinor: number }>();
	const perAircraft = new Map<string, { aircraft: string; loads: number; slots: number }>();
	const perStaff = new Map<string, { userId: string | null; name: string; slots: number; payMinor: number }>();
	for (const l of loadList) {
		const d = perDay.get(l.day) ?? { day: l.day, loads: 0, slots: 0, revenueMinor: 0 };
		d.loads++;
		perDay.set(l.day, d);
		const a = l.aircraftName ?? 'Unknown';
		const ac = perAircraft.get(a) ?? { aircraft: a, loads: 0, slots: 0 };
		ac.loads++;
		perAircraft.set(a, ac);
		if (l.pilotPayMinor > 0) {
			const key = l.pilotUserId ?? `name:${l.pilotName}`;
			const ps = perStaff.get(key) ?? { userId: l.pilotUserId, name: l.pilotName ?? 'Pilot', slots: 0, payMinor: 0 };
			ps.payMinor += l.pilotPayMinor;
			perStaff.set(key, ps);
		}
	}
	let currency: string | null = null;
	let totalMinor = 0;
	let paidMinor = 0;
	let staffPayMinor = 0;
	for (const s of slotList) {
		const l = loadById.get(s.loadId);
		if (!l) continue;
		currency ??= s.currency;
		const ex = new Set(s.extras);
		if (ex.has('extra_altitude')) t.extraAltitude++;
		if (ex.has('max_altitude')) t.maxAltitude++;
		if (ex.has('beach_landing')) t.beachLanding++;
		const isPassenger = s.jumpType === 'tandem' && !s.staffRole;
		if (isPassenger) {
			t.tandems++;
			if (ex.has('handcam')) t.handcam++;
			if (ex.has('outside_video')) t.outsideVideo++;
			if (ex.has('extreme_ride')) t.extremeRide++;
		}
		const isCoach = s.staffRole === 'coach' || s.jumpType === 'coaching';
		if (isCoach) t.coachJumps++;
		// Sporties = slots that are not tandem and not coach
		if (s.jumpType !== 'tandem' && !isCoach) {
			t.sporties++;
			if (AFF_JUMP_TYPES.includes(s.jumpType as JumpType)) t.aff++;
			if (s.jumpType === 'static_line') t.staticLine++;
			if (ex.has('gear_rental')) t.gearRental++;
		}
		totalMinor += s.totalMinor;
		if (s.paid) paidMinor += s.totalMinor;
		staffPayMinor += s.staffPayMinor;
		perDay.get(l.day)!.slots++;
		perDay.get(l.day)!.revenueMinor += s.totalMinor;
		perAircraft.get(l.aircraftName ?? 'Unknown')!.slots++;
		if (s.staffRole) {
			const key = s.userId ?? `name:${s.displayName}`;
			const ps = perStaff.get(key) ?? { userId: s.userId, name: s.displayName, slots: 0, payMinor: 0 };
			ps.slots++;
			ps.payMinor += s.staffPayMinor;
			perStaff.set(key, ps);
		}
	}
	const pilotPayMinor = loadList.reduce((a, l) => a + l.pilotPayMinor, 0);
	return {
		from,
		to,
		totals: t,
		perDay: [...perDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
		perAircraft: [...perAircraft.values()].sort((a, b) => b.loads - a.loads),
		perStaff: [...perStaff.values()].sort((a, b) => b.payMinor - a.payMinor),
		revenue: { currency, totalMinor, paidMinor, outstandingMinor: totalMinor - paidMinor, staffPayMinor, pilotPayMinor }
	};
}

/**
 * Jump report for a DZ over [from, to] (inclusive, DZ-local dates). By default only completed loads
 * count; pass `statuses` to include others (e.g. today's in-progress loads).
 */
export async function jumpReport(
	db: Database,
	dropzoneId: string,
	from: string,
	to: string,
	opts: { statuses?: LoadStatus[] } = {}
): Promise<JumpReport> {
	const statuses = opts.statuses ?? ['completed'];
	const loadList = await db
		.select()
		.from(loads)
		.where(and(eq(loads.dropzoneId, dropzoneId), gte(loads.day, from), lte(loads.day, to), inArray(loads.status, statuses)));
	const slotList: Slot[] = [];
	const ids = loadList.map((l) => l.id);
	for (let i = 0; i < ids.length; i += 90) {
		slotList.push(...(await db.select().from(slots).where(inArray(slots.loadId, ids.slice(i, i + 90)))));
	}
	return buildReport(from, to, loadList, slotList);
}
