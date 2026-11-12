import type { Slot } from '../db/schema.ts';
import { computeSlotPrice, type PriceMap } from '../domain/pricing.ts';
import { describeJump, type LoadWithSlots } from '../domain/loads.ts';
import { SOLO_JUMP_TYPES, SPORT_EXTRAS, type JumpType, type SlotExtra } from '../../domain/constants.ts';

/** Jump types offered when a team self-manifests (original: solo list + coaching). */
export const TEAM_JUMP_TYPES: readonly JumpType[] = ['belly', 'freefly', 'tracking', 'angle', 'wingsuit', 'coaching', 'hop_pop', 'crw'];
/** Types a jumper can switch their own slot to. */
export const CHANGE_JUMP_TYPES: readonly JumpType[] = [...SOLO_JUMP_TYPES, 'coaching'];

/** Client-side live price: base per jump type + price per extra (same rules as computeSlotPrice). */
export function priceTable(prices: PriceMap) {
	const base: Partial<Record<JumpType, number>> = {};
	for (const t of new Set([...SOLO_JUMP_TYPES, ...TEAM_JUMP_TYPES, ...CHANGE_JUMP_TYPES])) {
		base[t] = computeSlotPrice({ prices, jumpType: t }).baseMinor;
	}
	const extras: Partial<Record<SlotExtra, number>> = {};
	for (const e of SPORT_EXTRAS) {
		extras[e] = computeSlotPrice({ prices, jumpType: 'belly', extras: [e] }).extrasMinor;
	}
	return { base, extras };
}
export type PriceTable = ReturnType<typeof priceTable>;

const initials = (n: string) =>
	n
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? '')
		.join('');

/** What a jumper may see about a load (no weights, emails or prices of others). */
export function loadCard(load: LoadWithSlots, userId: string) {
	const groups = new Map<string, Slot[]>();
	for (const s of load.slots) {
		const key = s.groupId ?? `solo:${s.id}`;
		groups.set(key, [...(groups.get(key) ?? []), s]);
	}
	const counts = new Map<string, number>();
	for (const list of groups.values()) {
		const lead = list.find((s) => !s.staffRole) ?? list[0];
		const label = list[0].teamName
			? `${list[0].teamName} · ${describeJump(lead.jumpType, list.length, null)}`
			: describeJump(lead.jumpType, list.length, lead.staffRole);
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	const groupLabels = [...counts].map(([label, count]) => ({ label, count }));
	const mine = load.slots.find((s) => s.userId === userId) ?? null;
	return {
		id: load.id,
		loadNumber: load.loadNumber,
		status: load.status,
		isOpen: load.isOpen,
		aircraftName: load.aircraftName,
		scheduledAt: load.scheduledAt?.getTime() ?? null,
		callDueAt: load.callDueAt?.getTime() ?? null,
		refuel: load.refuel,
		shutdownMinutes: load.shutdownMinutes,
		capacity: load.capacity,
		used: load.stats.used,
		free: load.stats.free,
		full: load.stats.full,
		people: load.slots.map((s) => ({ id: s.id, name: s.displayName, initials: initials(s.displayName), lm: s.isLoadMaster, me: s.userId === userId, colour: s.colour })),
		groups: groupLabels,
		mine: mine
			? {
					slotId: mine.id,
					jumpType: mine.jumpType,
					extras: mine.extras,
					totalMinor: mine.totalMinor,
					currency: mine.currency,
					paid: mine.paid,
					staffRole: mine.staffRole,
					teamName: mine.teamName,
					lines: mine.priceBreakdown
				}
			: null
	};
}
export type LoadCard = ReturnType<typeof loadCard>;
