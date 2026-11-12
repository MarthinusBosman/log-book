import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	dropzones,
	ledgerEntries,
	slots,
	walletAccounts,
	type LedgerEntry,
	type Slot,
	type WalletAccount
} from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { LedgerType, PaymentProvider } from '../../domain/constants.ts';
import { chunkedInsert, runAtomic, type Statement } from './atomic.ts';
import { DomainError, assertFound } from './errors.ts';

/**
 * Wallet = one account per (user, dropzone) in the DZ currency, integer minor units.
 *   available — spendable; pending — held for manifested slots.
 * Holds are placed on manifest, re-placed when the slot price changes, released when the slot
 * is removed / load deleted, and captured (release + charge) when the load completes.
 * Every movement is an append-only ledger entry recording balances after the entry.
 */

export async function getAccount(db: Database, userId: string, dropzoneId: string): Promise<WalletAccount | undefined> {
	const rows = await db
		.select()
		.from(walletAccounts)
		.where(and(eq(walletAccounts.userId, userId), eq(walletAccounts.dropzoneId, dropzoneId)))
		.limit(1);
	return rows[0];
}

export async function getOrCreateAccount(db: Database, userId: string, dropzoneId: string): Promise<WalletAccount> {
	const existing = await getAccount(db, userId, dropzoneId);
	if (existing) return existing;
	const dz = assertFound(
		(await db.select({ currency: dropzones.currency }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0],
		'Dropzone'
	);
	await db
		.insert(walletAccounts)
		.values({ id: newId(), userId, dropzoneId, currency: dz.currency })
		.onConflictDoNothing();
	return (await getAccount(db, userId, dropzoneId))!;
}

export async function listAccountsForUser(db: Database, userId: string) {
	return db
		.select({ account: walletAccounts, dropzone: { id: dropzones.id, name: dropzones.name, slug: dropzones.slug } })
		.from(walletAccounts)
		.innerJoin(dropzones, eq(dropzones.id, walletAccounts.dropzoneId))
		.where(eq(walletAccounts.userId, userId));
}

export async function listLedger(db: Database, accountId: string, opts: { limit?: number; offset?: number } = {}) {
	return db
		.select()
		.from(ledgerEntries)
		.where(eq(ledgerEntries.accountId, accountId))
		.orderBy(desc(ledgerEntries.createdAt))
		.limit(opts.limit ?? 100)
		.offset(opts.offset ?? 0);
}

// ── internal: an in-memory running balance that emits ledger rows + one account update ──

type EntryInput = {
	type: LedgerType;
	amountMinor: number;
	dAvailable: number;
	dPending: number;
	slotId?: string | null;
	loadId?: string | null;
	relatedEntryId?: string | null;
	provider?: PaymentProvider | null;
	providerTxId?: string | null;
	origin?: string | null;
	reason?: string | null;
	createdBy?: string | null;
};

class Tally {
	available: number;
	pending: number;
	dTopup = 0;
	dSpent = 0;
	entries: (typeof ledgerEntries.$inferInsert)[] = [];
	private tick = 0;
	constructor(
		readonly account: WalletAccount,
		readonly now: number
	) {
		this.available = account.availableMinor;
		this.pending = account.pendingMinor;
	}
	add(e: EntryInput): string {
		this.available += e.dAvailable;
		this.pending += e.dPending;
		if (e.type === 'topup') this.dTopup += e.amountMinor;
		if (e.type === 'charge') this.dSpent += e.amountMinor;
		if (e.type === 'refund') this.dSpent -= e.amountMinor;
		const id = newId();
		this.entries.push({
			id,
			accountId: this.account.id,
			userId: this.account.userId,
			dropzoneId: this.account.dropzoneId,
			type: e.type,
			amountMinor: e.amountMinor,
			currency: this.account.currency,
			availableAfterMinor: this.available,
			pendingAfterMinor: this.pending,
			slotId: e.slotId ?? null,
			loadId: e.loadId ?? null,
			relatedEntryId: e.relatedEntryId ?? null,
			provider: e.provider ?? null,
			providerTxId: e.providerTxId ?? null,
			origin: e.origin ?? null,
			reason: e.reason ?? null,
			createdBy: e.createdBy ?? null,
			// strictly increasing timestamps keep ledger order stable within one operation
			createdAt: new Date(this.now + this.tick++)
		});
		return id;
	}
	statements(db: Database): Statement[] {
		if (this.entries.length === 0) return [];
		const dA = this.available - this.account.availableMinor;
		const dP = this.pending - this.account.pendingMinor;
		return [
			...chunkedInsert(db, ledgerEntries, this.entries),
			db
				.update(walletAccounts)
				.set({
					availableMinor: sql`${walletAccounts.availableMinor} + ${dA}`,
					pendingMinor: sql`${walletAccounts.pendingMinor} + ${dP}`,
					lifetimeTopupMinor: sql`${walletAccounts.lifetimeTopupMinor} + ${this.dTopup}`,
					lifetimeSpentMinor: sql`${walletAccounts.lifetimeSpentMinor} + ${this.dSpent}`,
					lastActivityAt: new Date(this.now)
				})
				.where(eq(walletAccounts.id, this.account.id))
		];
	}
}

async function dzWallet(db: Database, dropzoneId: string) {
	return assertFound(
		(
			await db
				.select({
					name: dropzones.name,
					currency: dropzones.currency,
					walletEnabled: dropzones.walletEnabled,
					allowNegative: dropzones.walletAllowNegative
				})
				.from(dropzones)
				.where(eq(dropzones.id, dropzoneId))
				.limit(1)
		)[0],
		'Dropzone'
	);
}

async function entryById(db: Database, id: string): Promise<LedgerEntry | undefined> {
	return (await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1))[0];
}

function insufficient(availableMinor: number, requiredMinor: number, currency: string): DomainError {
	return new DomainError('insufficient_funds', 'Insufficient funds in wallet', { availableMinor, requiredMinor, currency });
}

// ── public operations ──────────────────────────────────────────────────────

export type TopUpInput = {
	userId: string;
	dropzoneId: string;
	amountMinor: number;
	/** Must match the account currency when given. */
	currency?: string;
	provider: PaymentProvider;
	/** Provider transaction/event id — makes the top-up idempotent. */
	providerTxId?: string | null;
	reason?: string | null;
	createdBy?: string | null;
	now?: number;
};

/** Credit the wallet (Stripe/Payfast webhook or staff "Add funds"). Idempotent on provider+providerTxId. */
export async function topUp(db: Database, input: TopUpInput): Promise<LedgerEntry> {
	if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
		throw new DomainError('invalid', 'Enter a valid amount');
	}
	if (input.providerTxId) {
		const dup = await db
			.select()
			.from(ledgerEntries)
			.where(and(eq(ledgerEntries.provider, input.provider), eq(ledgerEntries.providerTxId, input.providerTxId)))
			.limit(1);
		if (dup[0]) return dup[0];
	}
	const account = await getOrCreateAccount(db, input.userId, input.dropzoneId);
	if (input.currency && input.currency.toUpperCase() !== account.currency.toUpperCase()) {
		throw new DomainError(
			'currency_mismatch',
			`Wallet currency mismatch: account is ${account.currency}, top-up is ${input.currency}`
		);
	}
	const t = new Tally(account, input.now ?? Date.now());
	const id = t.add({
		type: 'topup',
		amountMinor: input.amountMinor,
		dAvailable: input.amountMinor,
		dPending: 0,
		provider: input.provider,
		providerTxId: input.providerTxId ?? null,
		reason: input.reason ?? null,
		createdBy: input.createdBy ?? null,
		origin: input.provider
	});
	await runAtomic(db, t.statements(db));
	return (await entryById(db, id))!;
}

/** Signed manual adjustment ("Account Credit" / correction). */
export async function adjust(
	db: Database,
	input: { userId: string; dropzoneId: string; amountMinor: number; reason: string; createdBy: string; now?: number }
): Promise<LedgerEntry> {
	if (!Number.isInteger(input.amountMinor) || input.amountMinor === 0) throw new DomainError('invalid', 'Enter a valid amount');
	const account = await getOrCreateAccount(db, input.userId, input.dropzoneId);
	const t = new Tally(account, input.now ?? Date.now());
	const id = t.add({
		type: 'adjustment',
		amountMinor: input.amountMinor,
		dAvailable: input.amountMinor,
		dPending: 0,
		provider: 'manual',
		reason: input.reason,
		createdBy: input.createdBy,
		origin: 'manual'
	});
	await runAtomic(db, t.statements(db));
	return (await entryById(db, id))!;
}

/** Refund back into the wallet (e.g. cancelled paid slot). */
export async function refund(
	db: Database,
	input: { userId: string; dropzoneId: string; amountMinor: number; reason?: string; slotId?: string; createdBy?: string; now?: number }
): Promise<LedgerEntry> {
	if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new DomainError('invalid', 'Enter a valid amount');
	const account = await getOrCreateAccount(db, input.userId, input.dropzoneId);
	const t = new Tally(account, input.now ?? Date.now());
	const id = t.add({
		type: 'refund',
		amountMinor: input.amountMinor,
		dAvailable: input.amountMinor,
		dPending: 0,
		slotId: input.slotId,
		reason: input.reason ?? 'Refund',
		createdBy: input.createdBy,
		origin: 'manual'
	});
	await runAtomic(db, t.statements(db));
	return (await entryById(db, id))!;
}

/** Credit staff earnings into the staff member's wallet (when the DZ pays staff via wallet). */
export function staffPayStatements(
	db: Database,
	account: WalletAccount,
	items: { amountMinor: number; slotId?: string | null; loadId?: string | null; reason?: string }[],
	now: number
): Statement[] {
	const t = new Tally(account, now);
	for (const i of items) {
		if (i.amountMinor <= 0) continue;
		t.add({
			type: 'staff_pay',
			amountMinor: i.amountMinor,
			dAvailable: i.amountMinor,
			dPending: 0,
			slotId: i.slotId,
			loadId: i.loadId,
			reason: i.reason ?? 'Staff pay',
			origin: 'load_completed'
		});
	}
	return t.statements(db);
}

async function getSlot(db: Database, slotId: string): Promise<Slot> {
	return assertFound((await db.select().from(slots).where(eq(slots.id, slotId)).limit(1))[0], 'Slot');
}

/** Does this slot need a wallet hold? */
function holdable(slot: Slot): slot is Slot & { userId: string } {
	return !!slot.userId && !slot.paid && !slot.staffRole && slot.totalMinor > 0;
}

/**
 * Hold the slot total on manifest. No-op (returns null) when the DZ wallet is off, the slot has no
 * user, is free, paid or already held. Throws `insufficient_funds` unless the DZ allows negative.
 */
export async function placeHold(db: Database, slotId: string, opts: { now?: number; by?: string | null } = {}): Promise<LedgerEntry | null> {
	const slot = await getSlot(db, slotId);
	if (slot.walletHoldId) return updateHold(db, slotId, opts);
	if (!holdable(slot)) return null;
	const dz = await dzWallet(db, slot.dropzoneId);
	if (!dz.walletEnabled) return null;
	const account = await getOrCreateAccount(db, slot.userId, slot.dropzoneId);
	if (account.currency !== slot.currency) {
		throw new DomainError('currency_mismatch', `Wallet is ${account.currency}, slot is ${slot.currency}`);
	}
	if (account.availableMinor < slot.totalMinor && !dz.allowNegative) {
		throw insufficient(account.availableMinor, slot.totalMinor, account.currency);
	}
	const now = opts.now ?? Date.now();
	const t = new Tally(account, now);
	const holdId = t.add({
		type: 'hold',
		amountMinor: slot.totalMinor,
		dAvailable: -slot.totalMinor,
		dPending: slot.totalMinor,
		slotId: slot.id,
		loadId: slot.loadId,
		origin: 'manifest',
		createdBy: opts.by ?? null
	});
	await runAtomic(db, [
		...t.statements(db),
		db.update(slots).set({ walletHoldId: holdId }).where(eq(slots.id, slot.id))
	]);
	return (await entryById(db, holdId))!;
}

/**
 * Re-hold after the slot price/extras changed: releases the old hold and places a new one for the
 * new total (original: "Hold Adjusted" + "Hold Updated"). Returns the new hold (null if none needed).
 */
export async function updateHold(db: Database, slotId: string, opts: { now?: number; by?: string | null } = {}): Promise<LedgerEntry | null> {
	const slot = await getSlot(db, slotId);
	if (!slot.walletHoldId) return placeHold(db, slotId, opts);
	if (slot.paid || !slot.userId) return null;
	const hold = assertFound(await entryById(db, slot.walletHoldId), 'Hold');
	const wantHold = holdable(slot) ? slot.totalMinor : 0;
	if (hold.amountMinor === wantHold) return hold;
	const dz = await dzWallet(db, slot.dropzoneId);
	const account = assertFound(await getAccount(db, slot.userId, slot.dropzoneId), 'Wallet');
	if (wantHold > 0 && account.availableMinor + hold.amountMinor < wantHold && !dz.allowNegative) {
		throw insufficient(account.availableMinor + hold.amountMinor, wantHold, account.currency);
	}
	const now = opts.now ?? Date.now();
	const t = new Tally(account, now);
	t.add({
		type: 'hold_release',
		amountMinor: hold.amountMinor,
		dAvailable: hold.amountMinor,
		dPending: -hold.amountMinor,
		slotId: slot.id,
		loadId: slot.loadId,
		relatedEntryId: hold.id,
		origin: 'hold_update',
		createdBy: opts.by ?? null
	});
	let newHoldId: string | null = null;
	if (wantHold > 0) {
		newHoldId = t.add({
			type: 'hold',
			amountMinor: wantHold,
			dAvailable: -wantHold,
			dPending: wantHold,
			slotId: slot.id,
			loadId: slot.loadId,
			origin: 'hold_update',
			createdBy: opts.by ?? null
		});
	}
	await runAtomic(db, [...t.statements(db), db.update(slots).set({ walletHoldId: newHoldId }).where(eq(slots.id, slot.id))]);
	return newHoldId ? (await entryById(db, newHoldId))! : null;
}

/** Release the slot's hold (slot removed, load deleted/cancelled). No-op when none or already captured. */
export async function releaseHold(
	db: Database,
	slotId: string,
	opts: { now?: number; by?: string | null; origin?: string } = {}
): Promise<LedgerEntry | null> {
	const stmts = await releaseHoldStatements(db, slotId, opts);
	if (!stmts) return null;
	await runAtomic(db, stmts.statements);
	return (await entryById(db, stmts.entryId))!;
}

/** Statements for releasing a hold — lets callers combine with a slot delete atomically. */
export async function releaseHoldStatements(
	db: Database,
	slotId: string,
	opts: { now?: number; by?: string | null; origin?: string } = {}
): Promise<{ statements: Statement[]; entryId: string } | null> {
	const slot = await getSlot(db, slotId);
	if (!slot.walletHoldId || slot.paid || !slot.userId) return null;
	const hold = await entryById(db, slot.walletHoldId);
	if (!hold) return null;
	const account = assertFound(await getAccount(db, slot.userId, slot.dropzoneId), 'Wallet');
	const t = new Tally(account, opts.now ?? Date.now());
	const entryId = t.add({
		type: 'hold_release',
		amountMinor: hold.amountMinor,
		dAvailable: hold.amountMinor,
		dPending: -hold.amountMinor,
		slotId: slot.id,
		loadId: slot.loadId,
		relatedEntryId: hold.id,
		origin: opts.origin ?? 'slot_removed',
		createdBy: opts.by ?? null
	});
	return {
		entryId,
		statements: [...t.statements(db), db.update(slots).set({ walletHoldId: null }).where(eq(slots.id, slot.id))]
	};
}

/**
 * Settle slots from wallets: for each slot release its hold (if any) and charge its total.
 * Returns statements so load completion can commit everything in one batch.
 * `requireFunds` refuses (throws) when un-held slots exceed the available balance.
 */
async function settleStatements(
	db: Database,
	slotList: Slot[],
	opts: { now: number; origin: string; requireFunds: boolean; by?: string | null }
): Promise<{ statements: Statement[]; settledSlotIds: string[] }> {
	const byAccount = new Map<string, Slot[]>();
	for (const s of slotList) {
		if (!s.userId || s.paid) continue;
		const key = `${s.userId}|${s.dropzoneId}`;
		byAccount.set(key, [...(byAccount.get(key) ?? []), s]);
	}
	const statements: Statement[] = [];
	const settledSlotIds: string[] = [];
	for (const [key, list] of byAccount) {
		const [userId, dropzoneId] = key.split('|');
		const dz = await dzWallet(db, dropzoneId);
		const account = await getOrCreateAccount(db, userId, dropzoneId);
		const t = new Tally(account, opts.now);
		const paidIds: string[] = [];
		for (const s of list) {
			const hold = s.walletHoldId ? await entryById(db, s.walletHoldId) : undefined;
			if (!hold && !opts.requireFunds) continue; // capture only touches held slots
			if (hold) {
				t.add({
					type: 'hold_release',
					amountMinor: hold.amountMinor,
					dAvailable: hold.amountMinor,
					dPending: -hold.amountMinor,
					slotId: s.id,
					loadId: s.loadId,
					relatedEntryId: hold.id,
					origin: opts.origin,
					createdBy: opts.by ?? null
				});
			}
			if (opts.requireFunds && !dz.allowNegative && t.available < s.totalMinor) {
				throw insufficient(t.available, s.totalMinor, account.currency);
			}
			if (s.totalMinor > 0) {
				t.add({
					type: 'charge',
					amountMinor: s.totalMinor,
					dAvailable: -s.totalMinor,
					dPending: 0,
					slotId: s.id,
					loadId: s.loadId,
					relatedEntryId: hold?.id ?? null,
					provider: 'wallet',
					origin: opts.origin,
					createdBy: opts.by ?? null
				});
			}
			paidIds.push(s.id);
		}
		statements.push(...t.statements(db));
		if (paidIds.length) {
			statements.push(
				db
					.update(slots)
					.set({ paid: true, paidAt: new Date(opts.now), paidVia: 'wallet' })
					.where(inArray(slots.id, paidIds))
			);
			settledSlotIds.push(...paidIds);
		}
	}
	return { statements, settledSlotIds };
}

/** Statements capturing every held slot on a load (used by completeLoad). */
export async function captureLoadHoldsStatements(db: Database, loadId: string, now: number) {
	const list = await db.select().from(slots).where(eq(slots.loadId, loadId));
	return settleStatements(db, list, { now, origin: 'load_completed', requireFunds: false });
}

/** Capture (charge) all wallet holds on a load. Returns the slot ids that were settled. */
export async function captureLoadHolds(db: Database, loadId: string, now = Date.now()): Promise<string[]> {
	const { statements, settledSlotIds } = await captureLoadHoldsStatements(db, loadId, now);
	await runAtomic(db, statements);
	return settledSlotIds;
}

/** "Pay with Wallet" for unpaid slots belonging to the user. */
export async function paySlotsFromWallet(
	db: Database,
	input: { userId: string; dropzoneId: string; slotIds: string[]; now?: number }
): Promise<{ paidSlotIds: string[]; totalMinor: number }> {
	if (input.slotIds.length === 0) return { paidSlotIds: [], totalMinor: 0 };
	const list = await db
		.select()
		.from(slots)
		.where(
			and(
				inArray(slots.id, input.slotIds),
				eq(slots.userId, input.userId),
				eq(slots.dropzoneId, input.dropzoneId),
				eq(slots.paid, false)
			)
		);
	const dz = await dzWallet(db, input.dropzoneId);
	if (!dz.walletEnabled) throw new DomainError('wallet_disabled', 'Wallet is not enabled at this dropzone');
	const { statements, settledSlotIds } = await settleStatements(db, list, {
		now: input.now ?? Date.now(),
		origin: 'wallet_payment',
		requireFunds: true,
		by: input.userId
	});
	await runAtomic(db, statements);
	return { paidSlotIds: settledSlotIds, totalMinor: list.reduce((a, s) => a + s.totalMinor, 0) };
}
