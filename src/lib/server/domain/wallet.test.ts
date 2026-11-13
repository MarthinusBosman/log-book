import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { ledgerEntries, slots } from '../db/schema.ts';
import { isDomainError } from './errors.ts';
import { addSlot, completeLoad, createLoads, deleteLoad, removeSlot, updateSlot } from './loads.ts';
import { markSlotsPaid } from './payments.ts';
import { getAccount, paySlotsFromWallet, topUp } from './wallet.ts';
import { DAY, NOW, TEST_PRICES as P, freshDb, makeDropzone, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

async function setup(patch = {}) {
	const { dz, owner } = await makeDropzone(db, { walletEnabled: true, ...patch });
	const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 10, createdBy: owner.id, now: NOW });
	const jumper = await makeUser(db, { name: 'Jo Jumper' });
	return { dz, owner, load, jumper };
}

const ledger = (accountId: string) =>
	db.select().from(ledgerEntries).where(eq(ledgerEntries.accountId, accountId)).orderBy(ledgerEntries.createdAt);

describe('top-ups', () => {
	test('credit, idempotent on provider tx id, currency checked', async () => {
		const { dz, jumper } = await setup();
		const e1 = await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'payfast', providerTxId: 'pf_1', currency: 'zar' });
		const e2 = await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'payfast', providerTxId: 'pf_1' });
		expect(e2.id).toBe(e1.id);
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.availableMinor).toBe(100000);
		expect(acc.lifetimeTopupMinor).toBe(100000);
		expect(acc.currency).toBe('ZAR');
		await expect(topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 1, provider: 'stripe', currency: 'USD' })).rejects.toThrow(/mismatch/);
		await expect(topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 0, provider: 'cash' })).rejects.toThrow(/valid amount/);
	});
});

describe('holds', () => {
	test('manifest places a hold: available → pending', async () => {
		const { dz, load, jumper } = await setup();
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		const slot = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' });
		expect(slot.totalMinor).toBe(P.sport_slot!);
		expect(slot.walletHoldId).toBeTruthy();
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.availableMinor).toBe(100000 - P.sport_slot!);
		expect(acc.pendingMinor).toBe(P.sport_slot!);
		const entries = await ledger(acc.id);
		expect(entries.map((e) => e.type)).toEqual(['topup', 'hold']);
		expect(entries[1].availableAfterMinor).toBe(acc.availableMinor);
		expect(entries[1].pendingAfterMinor).toBe(acc.pendingMinor);
	});

	test('insufficient funds refuses manifest and leaves no slot', async () => {
		const { dz, load, jumper } = await setup();
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 1000, provider: 'cash' });
		const err = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' }).catch((e) => e);
		expect(isDomainError(err, 'insufficient_funds')).toBe(true);
		expect(err.details).toMatchObject({ availableMinor: 1000, requiredMinor: P.sport_slot });
		expect(await db.select().from(slots).where(eq(slots.loadId, load.id))).toHaveLength(0);
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.availableMinor).toBe(1000);
		expect(acc.pendingMinor).toBe(0);
	});

	test('team manifest is all-or-nothing when one wallet is short', async () => {
		const { dz, load, jumper } = await setup();
		const broke = await makeUser(db);
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		const err = await (await import('./loads.ts'))
			.addSlots(db, load.id, [
				{ userId: jumper.id, jumpType: 'belly' },
				{ userId: broke.id, jumpType: 'belly' }
			])
			.catch((e) => e);
		expect(isDomainError(err, 'insufficient_funds')).toBe(true);
		expect(await db.select().from(slots).where(eq(slots.loadId, load.id))).toHaveLength(0);
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.availableMinor).toBe(100000);
		expect(acc.pendingMinor).toBe(0);
	});

	test('dropzone may allow negative balances', async () => {
		const { dz, load, jumper } = await setup({ walletAllowNegative: true });
		await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' });
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.availableMinor).toBe(-P.sport_slot!);
		expect(acc.pendingMinor).toBe(P.sport_slot!);
	});

	test('wallet disabled → no hold, slot unpaid', async () => {
		const { load, jumper } = await setup({ walletEnabled: false });
		const slot = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' });
		expect(slot.walletHoldId).toBeNull();
		expect(slot.paid).toBe(false);
	});

	test('changing extras re-holds the new total; refused change rolls back', async () => {
		const { dz, load, jumper } = await setup();
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: P.sport_slot! + P.gear_rental!, provider: 'cash' });
		const slot = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' });
		const updated = await updateSlot(db, slot.id, { extras: ['gear_rental'] });
		expect(updated.totalMinor).toBe(P.sport_slot! + P.gear_rental!);
		let acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.availableMinor).toBe(0);
		expect(acc.pendingMinor).toBe(P.sport_slot! + P.gear_rental!);
		expect((await ledger(acc.id)).map((e) => e.type)).toEqual(['topup', 'hold', 'hold_release', 'hold']);
		// can't afford max altitude on top
		const err = await updateSlot(db, slot.id, { extras: ['gear_rental', 'max_altitude'] }).catch((e) => e);
		expect(isDomainError(err, 'insufficient_funds')).toBe(true);
		const after = (await db.select().from(slots).where(eq(slots.id, slot.id)))[0];
		expect(after.extras).toEqual(['gear_rental']);
		expect(after.totalMinor).toBe(P.sport_slot! + P.gear_rental!);
		acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.pendingMinor).toBe(P.sport_slot! + P.gear_rental!);
	});

	test('removing a slot / deleting a load releases holds', async () => {
		const { dz, load, jumper } = await setup();
		const other = await makeUser(db);
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		await topUp(db, { userId: other.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		const s1 = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' });
		await addSlot(db, load.id, { userId: other.id, jumpType: 'hop_pop' });
		await removeSlot(db, s1.id);
		let acc = (await getAccount(db, jumper.id, dz.id))!;
		expect([acc.availableMinor, acc.pendingMinor]).toEqual([100000, 0]);
		await deleteLoad(db, load.id);
		acc = (await getAccount(db, other.id, dz.id))!;
		expect([acc.availableMinor, acc.pendingMinor]).toEqual([100000, 0]);
		const types = (await ledger(acc.id)).map((e) => [e.type, e.origin]);
		expect(types.at(-1)).toEqual(['hold_release', 'load_deleted']);
	});
});

describe('capture & payments', () => {
	test('completing the load captures holds: pending cleared, charged, slot paid', async () => {
		const { dz, load, jumper } = await setup();
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		const slot = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly', extras: ['gear_rental'] });
		const res = await completeLoad(db, load.id, { now: NOW + 3600_000 });
		expect(res.chargedSlotIds).toEqual([slot.id]);
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect(acc.pendingMinor).toBe(0);
		expect(acc.availableMinor).toBe(100000 - slot.totalMinor);
		expect(acc.lifetimeSpentMinor).toBe(slot.totalMinor);
		const entries = await ledger(acc.id);
		expect(entries.map((e) => e.type)).toEqual(['topup', 'hold', 'hold_release', 'charge']);
		expect(entries[3].relatedEntryId).toBe(entries[1].id);
		expect(entries.at(-1)!.availableAfterMinor).toBe(acc.availableMinor);
		const paid = (await db.select().from(slots).where(eq(slots.id, slot.id)))[0];
		expect(paid.paid).toBe(true);
		expect(paid.paidVia).toBe('wallet');
	});

	test('un-held slots stay unpaid on completion and can be paid from the wallet later', async () => {
		const { dz, load, jumper } = await setup({ walletEnabled: false });
		const slot = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'hop_pop' });
		await completeLoad(db, load.id);
		expect((await db.select().from(slots).where(eq(slots.id, slot.id)))[0].paid).toBe(false);
		await db.update((await import('../db/schema.ts')).dropzones).set({ walletEnabled: true });
		await expect(paySlotsFromWallet(db, { userId: jumper.id, dropzoneId: dz.id, slotIds: [slot.id] })).rejects.toThrow(/Insufficient/);
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: P.hop_pop!, provider: 'cash' });
		const r = await paySlotsFromWallet(db, { userId: jumper.id, dropzoneId: dz.id, slotIds: [slot.id] });
		expect(r.paidSlotIds).toEqual([slot.id]);
		expect((await getAccount(db, jumper.id, dz.id))!.availableMinor).toBe(0);
	});

	test('mark paid at manifest releases the hold instead of charging the wallet', async () => {
		const { dz, owner, load, jumper } = await setup();
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash' });
		const slot = await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' });
		const payment = await markSlotsPaid(db, { dropzoneId: dz.id, slotIds: [slot.id], provider: 'cash', by: owner.id });
		expect(payment?.amountMinor).toBe(P.sport_slot!);
		const acc = (await getAccount(db, jumper.id, dz.id))!;
		expect([acc.availableMinor, acc.pendingMinor]).toEqual([100000, 0]);
		await completeLoad(db, load.id);
		expect((await getAccount(db, jumper.id, dz.id))!.availableMinor).toBe(100000);
	});
});

describe('jumper wallet history', () => {
	test('one row per jump: released holds hidden, open hold neutral, balance includes held money', async () => {
		const { walletHistory } = await import('../../domain/wallet-history.ts');
		const { listLedgerWithLoads } = await import('./wallet.ts');
		const { dz, owner, load, jumper } = await setup();
		const [load2, load3] = await createLoads(db, { dropzoneId: dz.id, day: DAY, count: 2, capacity: 10, createdBy: owner.id, now: NOW });
		await topUp(db, { userId: jumper.id, dropzoneId: dz.id, amountMinor: 100000, provider: 'cash', now: NOW });
		await addSlot(db, load.id, { userId: jumper.id, jumpType: 'belly' }, { now: NOW + 1000 });
		await completeLoad(db, load.id, { now: NOW + 2000 });
		const left = await addSlot(db, load2.id, { userId: jumper.id, jumpType: 'belly' }, { now: NOW + 3000 });
		await removeSlot(db, left.id, { now: NOW + 4000 });
		await addSlot(db, load3.id, { userId: jumper.id, jumpType: 'belly' }, { now: NOW + 5000 });

		const acc = (await getAccount(db, jumper.id, dz.id))!;
		const raw = await listLedgerWithLoads(db, acc.id);
		expect(raw).toHaveLength(7); // topup, hold/release/charge, hold/release, hold
		const rows = walletHistory(raw.map((e) => ({ ...e, createdAt: e.createdAt.getTime() })));
		expect(rows.map((r) => [r.direction, r.loadNumber, r.amountMinor, r.balanceAfterMinor])).toEqual([
			['reserved', load3.loadNumber, P.sport_slot!, 100000 - P.sport_slot!],
			['out', load.loadNumber, P.sport_slot!, 100000 - P.sport_slot!],
			['in', null, 100000, 100000]
		]);
		expect(rows[0].title).toBe('Reserved for a jump');
		expect(rows[1].title).toBe('Jump charged');
		expect(rows[1].loadDay).toBe(DAY);
		expect(rows[2].method).toBe('Cash');
		expect(rows[1].method).toBeNull();
		// header figures still add up: available + reserved = latest balance
		expect(acc.availableMinor + acc.pendingMinor).toBe(rows[0].balanceAfterMinor);
	});

	test('adjustments keep their sign; reasons that repeat the label are dropped', async () => {
		const { walletHistory } = await import('../../domain/wallet-history.ts');
		const base = { availableAfterMinor: 0, pendingAfterMinor: 0, relatedEntryId: null, createdAt: NOW };
		const rows = walletHistory([
			{ ...base, id: 'a', type: 'adjustment', amountMinor: -500, reason: 'Packing fee' },
			{ ...base, id: 'b', type: 'refund', amountMinor: 700, reason: 'Refund' },
			{ ...base, id: 'c', type: 'hold_release', amountMinor: 900, reason: null, relatedEntryId: 'zzz' }
		]);
		expect(rows.map((r) => [r.id, r.direction, r.amountMinor, r.detail])).toEqual([
			['a', 'out', 500, 'Packing fee'],
			['b', 'in', 700, null]
		]);
	});

	test('top-ups say how they were paid in words; manual is left out', async () => {
		const { walletHistory } = await import('../../domain/wallet-history.ts');
		const { paymentMethodLabel } = await import('../../domain/constants.ts');
		const base = { availableAfterMinor: 0, pendingAfterMinor: 0, relatedEntryId: null, createdAt: NOW, type: 'topup', amountMinor: 1000, reason: 'Top-up' };
		const rows = walletHistory([
			{ ...base, id: 'a', provider: 'paystack' },
			{ ...base, id: 'b', provider: 'eft' },
			{ ...base, id: 'c', provider: 'manual' },
			{ ...base, id: 'd', provider: null }
		]);
		expect(rows.map((r) => r.method)).toEqual(['Paystack', 'EFT', null, null]);
		expect(paymentMethodLabel('payfast')).toBe('PayFast');
		expect(paymentMethodLabel('something-new')).toBe('something-new');
		expect(paymentMethodLabel(null)).toBe('');
	});
});
