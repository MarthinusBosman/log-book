import { describe, expect, test } from 'bun:test';
import { PRICE_CODES } from '../../domain/constants.ts';
import { basePriceCode, computeSlotPrice, computeStaffPay, getPriceMap, listPricelist, quoteTandem, setPrices } from './pricing.ts';
import { TEST_PRICES as P, freshDb, makeDropzone } from './testing.ts';

describe('computeSlotPrice', () => {
	test('base price by jump type (original mapping)', () => {
		const cases: [string, number][] = [
			['belly', P.sport_slot!],
			['freefly', P.sport_slot!],
			['wingsuit', P.sport_slot!],
			['crw', P.sport_slot!],
			['hop_pop', P.hop_pop!],
			['aff_1_3', P.aff_1_3!],
			['aff_4_7', P.aff_4_7!],
			['aff_8_10', P.aff_8_10!],
			['isp', P.isp!],
			['coaching', P.coach!],
			['static_line', P.static_line!],
			['tandem', P.tandem_slot!]
		];
		for (const [jt, amount] of cases) {
			const r = computeSlotPrice({ prices: P, jumpType: jt });
			expect(r.totalMinor).toBe(amount);
			expect(r.lines[0].code).toBe(basePriceCode(jt));
		}
	});

	test('sport extras add their price; tandem-only extras ignored on sport slots', () => {
		const r = computeSlotPrice({ prices: P, jumpType: 'belly', extras: ['gear_rental', 'max_altitude', 'handcam', 'gear_rental'] });
		expect(r.extrasMinor).toBe(P.gear_rental! + P.max_altitude!);
		expect(r.totalMinor).toBe(P.sport_slot! + P.gear_rental! + P.max_altitude!);
		expect(r.lines.map((l) => l.code)).toEqual(['sport_slot', 'gear_rental', 'max_altitude']);
	});

	test('tandem extras use tandem_* codes and the deposit is deducted', () => {
		const r = computeSlotPrice({
			prices: P,
			jumpType: 'tandem',
			extras: ['handcam', 'outside_video', 'extra_altitude', 'gear_rental'],
			depositMinor: P.tandem_deposit
		});
		const gross = P.tandem_slot! + P.tandem_handcam! + P.tandem_outside_video! + P.tandem_extra_altitude!;
		expect(r.totalMinor).toBe(gross - P.tandem_deposit!);
		expect(r.lines.at(-1)).toEqual({ code: 'deposit', label: 'Deposit paid', amountMinor: -P.tandem_deposit! });
	});

	test('total never goes below zero', () => {
		expect(computeSlotPrice({ prices: P, jumpType: 'hop_pop', depositMinor: 10_000_000 }).totalMinor).toBe(0);
	});

	test('manifest override replaces only the base', () => {
		const r = computeSlotPrice({ prices: P, jumpType: 'belly', extras: ['gear_rental'], baseOverrideMinor: 1000 });
		expect(r.baseMinor).toBe(1000);
		expect(r.totalMinor).toBe(1000 + P.gear_rental!);
		expect(r.lines[0].code).toBe('custom');
	});

	test('working staff jump free', () => {
		for (const role of ['tandem_instructor', 'videographer', 'coach', 'aff_instructor', 'jumpmaster'] as const) {
			expect(computeSlotPrice({ prices: P, jumpType: 'tandem', staffRole: role, extras: ['handcam'] }).totalMinor).toBe(0);
		}
	});

	test('missing prices are 0', () => {
		expect(computeSlotPrice({ prices: {}, jumpType: 'belly', extras: ['gear_rental'] }).totalMinor).toBe(0);
	});
});

describe('staff pay & tandem quote', () => {
	test('per role, TI gets handcam pay when the passenger has handcam', () => {
		expect(computeStaffPay(P, 'tandem_instructor')).toBe(P.pay_tandem!);
		expect(computeStaffPay(P, 'tandem_instructor', ['handcam'])).toBe(P.pay_tandem! + P.pay_handcam!);
		expect(computeStaffPay(P, 'videographer')).toBe(P.pay_tandem_video!);
		expect(computeStaffPay(P, 'aff_instructor')).toBe(P.pay_aff!);
		expect(computeStaffPay(P, 'coach')).toBe(P.pay_coach!);
		expect(computeStaffPay(P, 'jumpmaster')).toBe(0);
		expect(computeStaffPay(P, null)).toBe(0);
	});

	test('quoteTandem: deposit per jumper', () => {
		const q = quoteTandem(P, ['handcam'], 3);
		expect(q.totalMinor).toBe(3 * (P.tandem_slot! + P.tandem_handcam!));
		expect(q.depositMinor).toBe(3 * P.tandem_deposit!);
	});
});

describe('price list storage', () => {
	test('new dropzone gets one row per code; setPrices upserts', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db, {}, {});
		const list = await listPricelist(db, dz.id);
		expect(list).toHaveLength(PRICE_CODES.length);
		expect(list.every((i) => i.amountMinor === 0)).toBe(true);
		await setPrices(db, dz.id, { sport_slot: 45000, bogus: 1 } as never);
		await setPrices(db, dz.id, { sport_slot: 46000 });
		const map = await getPriceMap(db, dz.id);
		expect(map.sport_slot).toBe(46000);
		expect('bogus' in map).toBe(false);
	});
});
