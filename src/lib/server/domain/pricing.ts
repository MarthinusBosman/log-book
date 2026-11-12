import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { pricelistItems, type PriceLine } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { chunkedInsert, runAtomic } from './atomic.ts';
import {
	PRICE_CODES,
	PRICE_ITEMS,
	SLOT_EXTRA_LABELS,
	type JumpType,
	type PriceCode,
	type SlotExtra,
	type SlotStaffRole
} from '../../domain/constants.ts';

/** code → amount (minor units). Missing codes price at 0. */
export type PriceMap = Partial<Record<PriceCode, number>>;

export type PriceInput = {
	prices: PriceMap;
	jumpType: JumpType | string;
	extras?: readonly SlotExtra[];
	/** Working staff (TI, video, coach, AFF-I, jumpmaster) jump free. */
	staffRole?: SlotStaffRole | null;
	/** Manifest override of the base price ("Customize slot price"). */
	baseOverrideMinor?: number | null;
	/** Tandem deposit already paid — deducted from the total. */
	depositMinor?: number;
};

export type PriceResult = {
	lines: PriceLine[];
	baseMinor: number;
	extrasMinor: number;
	depositMinor: number;
	/** Amount due = base + extras − deposit, never below 0. */
	totalMinor: number;
};

/** Base price code per jump type (original `sportslot` fallback for disciplines). */
export function basePriceCode(jumpType: string): PriceCode {
	switch (jumpType) {
		case 'hop_pop':
			return 'hop_pop';
		case 'aff_1_3':
			return 'aff_1_3';
		case 'aff_4_7':
			return 'aff_4_7';
		case 'aff_8_10':
			return 'aff_8_10';
		case 'isp':
			return 'isp';
		case 'coaching':
			return 'coach';
		case 'static_line':
			return 'static_line';
		case 'tandem':
			return 'tandem_slot';
		default:
			return 'sport_slot';
	}
}

/** Price code for an extra; tandem extras use the tandem_* codes. */
export function extraPriceCode(extra: SlotExtra, tandem: boolean): PriceCode | null {
	if (tandem) {
		switch (extra) {
			case 'handcam':
				return 'tandem_handcam';
			case 'outside_video':
				return 'tandem_outside_video';
			case 'extreme_ride':
				return 'tandem_extreme_ride';
			case 'beach_landing':
				return 'tandem_beach_landing';
			case 'extra_altitude':
				return 'tandem_extra_altitude';
			case 'max_altitude':
				return 'tandem_max_altitude';
			default:
				return null; // gear rental / special event don't apply to tandem passengers
		}
	}
	switch (extra) {
		case 'gear_rental':
			return 'gear_rental';
		case 'extra_altitude':
			return 'extra_altitude';
		case 'max_altitude':
			return 'max_altitude';
		case 'special_event':
			return 'special_event';
		default:
			return null; // handcam/video etc. are tandem-only add-ons
	}
}

const int = (n: number | undefined | null) => Math.max(0, Math.round(n ?? 0));

/** Pure slot price calculation with an itemised breakdown. */
export function computeSlotPrice(input: PriceInput): PriceResult {
	const p = input.prices;
	if (input.staffRole) {
		return { lines: [], baseMinor: 0, extrasMinor: 0, depositMinor: 0, totalMinor: 0 };
	}
	const tandem = input.jumpType === 'tandem';
	const baseCode = basePriceCode(input.jumpType);
	const baseMinor = input.baseOverrideMinor != null ? int(input.baseOverrideMinor) : int(p[baseCode]);
	const lines: PriceLine[] = [
		{
			code: input.baseOverrideMinor != null ? 'custom' : baseCode,
			label: input.baseOverrideMinor != null ? 'Custom price' : PRICE_ITEMS[baseCode].label,
			amountMinor: baseMinor
		}
	];
	let extrasMinor = 0;
	for (const extra of new Set(input.extras ?? [])) {
		const code = extraPriceCode(extra, tandem);
		if (!code) continue;
		const amount = int(p[code]);
		extrasMinor += amount;
		lines.push({ code, label: SLOT_EXTRA_LABELS[extra], amountMinor: amount });
	}
	const depositMinor = int(input.depositMinor);
	if (depositMinor > 0) lines.push({ code: 'deposit', label: 'Deposit paid', amountMinor: -depositMinor });
	const totalMinor = Math.max(0, baseMinor + extrasMinor - depositMinor);
	return { lines, baseMinor, extrasMinor, depositMinor, totalMinor };
}

/** Pure staff pay for a working slot. Handcam pay is added for a TI when the passenger has handcam. */
export function computeStaffPay(
	prices: PriceMap,
	staffRole: SlotStaffRole | null | undefined,
	groupExtras: readonly SlotExtra[] = []
): number {
	switch (staffRole) {
		case 'tandem_instructor':
			return int(prices.pay_tandem) + (groupExtras.includes('handcam') ? int(prices.pay_handcam) : 0);
		case 'videographer':
			return int(prices.pay_tandem_video);
		case 'aff_instructor':
			return int(prices.pay_aff);
		case 'coach':
			return int(prices.pay_coach);
		default:
			return 0;
	}
}

/** Pure tandem booking quote (total before deposit, deposit due online). */
export function quoteTandem(prices: PriceMap, extras: readonly SlotExtra[], jumpers = 1) {
	const one = computeSlotPrice({ prices, jumpType: 'tandem', extras });
	return {
		perJumper: one,
		totalMinor: one.totalMinor * jumpers,
		depositMinor: int(prices.tandem_deposit) * jumpers
	};
}

// ── DB access ──────────────────────────────────────────────────────────────

export async function getPriceMap(db: Database, dropzoneId: string): Promise<PriceMap> {
	const rows = await db
		.select({ code: pricelistItems.code, amount: pricelistItems.amountMinor, active: pricelistItems.active })
		.from(pricelistItems)
		.where(eq(pricelistItems.dropzoneId, dropzoneId));
	const map: PriceMap = {};
	for (const r of rows) if (r.active) map[r.code as PriceCode] = r.amount;
	return map;
}

export async function listPricelist(db: Database, dropzoneId: string) {
	const rows = await db.select().from(pricelistItems).where(eq(pricelistItems.dropzoneId, dropzoneId));
	const byCode = new Map(rows.map((r) => [r.code, r]));
	return PRICE_CODES.map((code) => {
		const row = byCode.get(code);
		return {
			code,
			category: PRICE_ITEMS[code].category,
			label: row?.label ?? PRICE_ITEMS[code].label,
			amountMinor: row?.amountMinor ?? 0,
			active: row?.active ?? true
		};
	});
}

/** Upsert price-list amounts (only known codes). */
export async function setPrices(db: Database, dropzoneId: string, prices: PriceMap, now = Date.now()): Promise<void> {
	for (const [code, amount] of Object.entries(prices)) {
		if (!(code in PRICE_ITEMS) || amount == null) continue;
		const amountMinor = int(amount);
		await db
			.insert(pricelistItems)
			.values({ id: newId(), dropzoneId, code, amountMinor, updatedAt: new Date(now) })
			.onConflictDoUpdate({
				target: [pricelistItems.dropzoneId, pricelistItems.code],
				set: { amountMinor, updatedAt: new Date(now) }
			});
	}
}

/** Create zero rows for every code (idempotent). */
export async function seedDefaultPricelist(db: Database, dropzoneId: string): Promise<void> {
	await runAtomic(
		db,
		chunkedInsert(
			db,
			pricelistItems,
			PRICE_CODES.map((code) => ({ id: newId(), dropzoneId, code, amountMinor: 0 })),
			{ onConflictDoNothing: true }
		)
	);
}

export async function getPrice(db: Database, dropzoneId: string, code: PriceCode): Promise<number> {
	const rows = await db
		.select({ a: pricelistItems.amountMinor })
		.from(pricelistItems)
		.where(and(eq(pricelistItems.dropzoneId, dropzoneId), eq(pricelistItems.code, code)))
		.limit(1);
	return rows[0]?.a ?? 0;
}
