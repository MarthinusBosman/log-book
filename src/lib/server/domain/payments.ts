import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, loads, payments, slots, users, type Payment } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { PaymentProvider } from '../../domain/constants.ts';
import { runAtomic, type Statement } from './atomic.ts';
import { DomainError, assertFound } from './errors.ts';
import { notify } from './notifications.ts';
import { getOrCreateAccount, releaseHoldStatements, topUp } from './wallet.ts';

/** Unpaid slots of a user at a DZ (Jumper Account "Unpaid" tab), with load info. */
export async function unpaidSlots(db: Database, userId: string, dropzoneId: string) {
	return db
		.select({ slot: slots, load: { id: loads.id, day: loads.day, loadNumber: loads.loadNumber, status: loads.status } })
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(and(eq(slots.userId, userId), eq(slots.dropzoneId, dropzoneId), eq(slots.paid, false)))
		.orderBy(asc(loads.day), asc(loads.loadNumber));
}

export async function paidSlots(db: Database, userId: string, dropzoneId: string) {
	return db
		.select({ slot: slots, load: { id: loads.id, day: loads.day, loadNumber: loads.loadNumber, status: loads.status } })
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(and(eq(slots.userId, userId), eq(slots.dropzoneId, dropzoneId), eq(slots.paid, true)))
		.orderBy(asc(loads.day), asc(loads.loadNumber));
}

/** Jump Payments "Sporties" tab: unpaid non-tandem slots per jumper for a day. */
export async function outstandingByJumper(db: Database, dropzoneId: string, day: string) {
	const rows = await db
		.select({ slot: slots, loadNumber: loads.loadNumber })
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(and(eq(slots.dropzoneId, dropzoneId), eq(loads.day, day), eq(slots.paid, false)));
	const by = new Map<string, { key: string; userId: string | null; name: string; slots: typeof rows; totalMinor: number }>();
	for (const r of rows) {
		if (r.slot.tandemPassengerId || r.slot.staffRole || r.slot.totalMinor <= 0) continue;
		const key = r.slot.userId ?? `name:${r.slot.displayName}`;
		const e = by.get(key) ?? { key, userId: r.slot.userId, name: r.slot.displayName, slots: [], totalMinor: 0 };
		e.slots.push(r);
		e.totalMinor += r.slot.totalMinor;
		by.set(key, e);
	}
	return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Staff "Mark as Paid" (cash/card/EFT at manifest). Releases any wallet hold so the wallet isn't
 * charged as well, records one `payments` row.
 */
export async function markSlotsPaid(
	db: Database,
	input: { dropzoneId: string; slotIds: string[]; provider: Exclude<PaymentProvider, 'wallet'>; by: string; now?: number; providerRef?: string | null }
): Promise<Payment | null> {
	const now = input.now ?? Date.now();
	if (input.slotIds.length === 0) return null;
	const list = await db
		.select()
		.from(slots)
		.where(and(inArray(slots.id, input.slotIds), eq(slots.dropzoneId, input.dropzoneId), eq(slots.paid, false)));
	if (list.length === 0) return null;
	const dz = assertFound((await db.select({ c: dropzones.currency }).from(dropzones).where(eq(dropzones.id, input.dropzoneId)).limit(1))[0], 'Dropzone');
	const statements: Statement[] = [];
	for (const s of list) {
		const rel = await releaseHoldStatements(db, s.id, { origin: 'paid_at_manifest', by: input.by, now });
		if (rel) statements.push(...rel.statements);
	}
	const userIds = [...new Set(list.map((s) => s.userId))];
	const payment = {
		id: newId(),
		dropzoneId: input.dropzoneId,
		userId: userIds.length === 1 ? userIds[0] : null,
		purpose: 'slots' as const,
		provider: input.provider,
		status: 'succeeded' as const,
		amountMinor: list.reduce((a, s) => a + s.totalMinor, 0),
		currency: dz.c,
		providerRef: input.providerRef ?? null,
		slotIds: list.map((s) => s.id),
		createdBy: input.by,
		createdAt: new Date(now),
		completedAt: new Date(now)
	};
	statements.push(db.insert(payments).values(payment));
	statements.push(
		db
			.update(slots)
			.set({ paid: true, paidAt: new Date(now), paidVia: input.provider })
			.where(inArray(slots.id, list.map((s) => s.id)))
	);
	await runAtomic(db, statements);
	return (await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1))[0];
}

/** "Send Payment Reminder" → payment_notice notification. */
export async function sendPaymentReminder(db: Database, input: { dropzoneId: string; userId: string; by: string; now?: number }): Promise<void> {
	const dz = assertFound((await db.select({ n: dropzones.name }).from(dropzones).where(eq(dropzones.id, input.dropzoneId)).limit(1))[0], 'Dropzone');
	const u = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
	if (!u) throw new DomainError('not_found', 'User not found');
	await notify(db, {
		userIds: [input.userId],
		type: 'payment_notice',
		dropzoneId: input.dropzoneId,
		actorUserId: input.by,
		payload: { dropzoneName: dz.n },
		now: input.now
	});
}

/** Staff tab of Jump Payments: per staff member slots worked and total earned for a day. */
export async function staffEarnings(db: Database, dropzoneId: string, day: string) {
	const rows = await db
		.select({ slot: slots })
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.where(and(eq(slots.dropzoneId, dropzoneId), eq(loads.day, day)));
	const dayLoads = await db.select().from(loads).where(and(eq(loads.dropzoneId, dropzoneId), eq(loads.day, day)));
	const by = new Map<string, { userId: string | null; name: string; slots: number; totalMinor: number }>();
	for (const { slot } of rows) {
		if (!slot.staffRole) continue;
		const key = slot.userId ?? slot.displayName;
		const e = by.get(key) ?? { userId: slot.userId, name: slot.displayName, slots: 0, totalMinor: 0 };
		e.slots++;
		e.totalMinor += slot.staffPayMinor;
		by.set(key, e);
	}
	for (const l of dayLoads) {
		if (!l.pilotPayMinor) continue;
		const key = l.pilotUserId ?? l.pilotName ?? 'pilot';
		const e = by.get(key) ?? { userId: l.pilotUserId, name: l.pilotName ?? 'Pilot', slots: 0, totalMinor: 0 };
		e.totalMinor += l.pilotPayMinor;
		by.set(key, e);
	}
	return [...by.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

// ── wallet top-up requests (jumper side) ───────────────────────────────────

/**
 * A jumper asks to top up their wallet. Creates a `pending` wallet_topup payment. For 'manual'
 * (pay at manifest) staff complete it with `completeTopUpRequest`; online providers complete it
 * from their webhook with the provider event id.
 */
export async function requestTopUp(
	db: Database,
	input: { userId: string; dropzoneId: string; amountMinor: number; provider: PaymentProvider; providerRef?: string | null; now?: number }
): Promise<Payment> {
	if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new DomainError('invalid', 'Enter a valid amount');
	const dz = assertFound(
		(await db.select({ walletEnabled: dropzones.walletEnabled }).from(dropzones).where(eq(dropzones.id, input.dropzoneId)).limit(1))[0],
		'Dropzone'
	);
	if (!dz.walletEnabled) throw new DomainError('wallet_disabled', 'Wallet is not enabled at this dropzone');
	const account = await getOrCreateAccount(db, input.userId, input.dropzoneId);
	const now = input.now ?? Date.now();
	return (
		await db
			.insert(payments)
			.values({
				id: newId(),
				dropzoneId: input.dropzoneId,
				userId: input.userId,
				purpose: 'wallet_topup',
				provider: input.provider,
				status: 'pending',
				amountMinor: input.amountMinor,
				currency: account.currency,
				providerRef: input.providerRef ?? null,
				createdBy: input.userId,
				createdAt: new Date(now)
			})
			.returning()
	)[0];
}

/** A user's wallet top-up requests at a DZ, newest first (optionally only pending). */
export async function listTopUpRequests(db: Database, userId: string, dropzoneId: string, opts: { pendingOnly?: boolean } = {}) {
	return db
		.select()
		.from(payments)
		.where(
			and(
				eq(payments.userId, userId),
				eq(payments.dropzoneId, dropzoneId),
				eq(payments.purpose, 'wallet_topup'),
				opts.pendingOnly ? eq(payments.status, 'pending') : undefined
			)
		)
		.orderBy(desc(payments.createdAt));
}

/** Pending pay-at-manifest top-up requests at a DZ (manifest's "to collect" list; online ones confirm themselves). */
export async function listPendingTopUpsForDropzone(db: Database, dropzoneId: string) {
	return db
		.select({ payment: payments, user: { id: users.id, name: users.name, email: users.email } })
		.from(payments)
		.innerJoin(users, eq(users.id, payments.userId))
		.where(and(eq(payments.dropzoneId, dropzoneId), eq(payments.purpose, 'wallet_topup'), eq(payments.status, 'pending'), eq(payments.provider, 'manual')))
		.orderBy(asc(payments.createdAt));
}

/** The requesting user cancels their own pending request. */
export async function cancelTopUpRequest(db: Database, paymentId: string, userId: string): Promise<void> {
	const p = assertFound((await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0], 'Top-up request');
	if (p.userId !== userId || p.purpose !== 'wallet_topup') throw new DomainError('forbidden', 'Not your top-up request');
	if (p.status !== 'pending') throw new DomainError('invalid_transition', 'This top-up is no longer pending');
	await db.update(payments).set({ status: 'cancelled' }).where(eq(payments.id, paymentId));
}

/**
 * Complete a pending top-up: credits the wallet (idempotent on provider + payment id) and marks the
 * payment succeeded. `by` is the staff member (manual) or null (webhook).
 */
export async function completeTopUpRequest(
	db: Database,
	input: { paymentId: string; by?: string | null; provider?: PaymentProvider; providerEventId?: string | null; now?: number }
): Promise<Payment> {
	const p = assertFound((await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1))[0], 'Top-up request');
	if (p.purpose !== 'wallet_topup' || !p.userId) throw new DomainError('invalid', 'Not a wallet top-up');
	if (p.status === 'succeeded') return p;
	if (p.status !== 'pending') throw new DomainError('invalid_transition', 'This top-up is no longer pending');
	const now = input.now ?? Date.now();
	const provider = input.provider ?? p.provider;
	const entry = await topUp(db, {
		userId: p.userId,
		dropzoneId: p.dropzoneId,
		amountMinor: p.amountMinor,
		currency: p.currency,
		provider,
		providerTxId: input.providerEventId ?? `payment:${p.id}`,
		reason: 'Top-up',
		createdBy: input.by ?? null,
		now
	});
	return (
		await db
			.update(payments)
			.set({ status: 'succeeded', provider, providerEventId: input.providerEventId ?? null, ledgerEntryId: entry.id, completedAt: new Date(now) })
			.where(eq(payments.id, p.id))
			.returning()
	)[0];
}
