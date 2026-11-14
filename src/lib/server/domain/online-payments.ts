/**
 * Online payments through a dropzone's own provider account (PayFast, Paystack, Yoco, Stripe).
 * A checkout first creates a `pending` payments row; the provider's verified webhook (or a
 * server-side status check on return) then confirms it exactly once:
 *   - wallet_topup  → credits the wallet (ledger idempotent on provider + tx id)
 *   - tandem / tandem_deposit → adds the amount to each booked passenger's paid / deposit
 * Confirmation is idempotent: a payment already `succeeded`, or a provider tx id already recorded,
 * is a no-op. Money that arrives after a cancel/fail is still applied (it really was paid).
 */
import { and, desc, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { payments, tandemPassengers, type Payment } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { PaymentProvider } from '../../domain/constants.ts';
import { runAtomic, type Statement } from './atomic.ts';
import { DomainError, assertFound } from './errors.ts';
import { completeTopUpRequest, requestTopUp } from './payments.ts';
import { paymentStatusFor } from './tandems.ts';

export type OnlinePurpose = 'wallet_topup' | 'tandem' | 'tandem_deposit';

export type PaymentMeta = {
	/** Where to send the customer after the provider (our own path, e.g. /dz/x/book/ABCD-1234). */
	returnTo?: string;
	cancelTo?: string;
	/** tandem purposes: how the amount is split over passengers. */
	allocations?: { passengerId: string; amountMinor: number }[];
	/** PayFast: the signed form to auto-post. */
	form?: { action: string; fields: [string, string][] };
	failureReason?: string;
	confirmedVia?: 'webhook' | 'return';
};

export const meta = (p: Payment): PaymentMeta => (p.metadata ?? {}) as PaymentMeta;

export async function getPayment(db: Database, id: string): Promise<Payment | undefined> {
	return (await db.select().from(payments).where(eq(payments.id, id)).limit(1))[0];
}

export async function findPaymentByProviderRef(db: Database, dropzoneId: string, provider: PaymentProvider, ref: string) {
	return (
		await db
			.select()
			.from(payments)
			.where(and(eq(payments.dropzoneId, dropzoneId), eq(payments.provider, provider), eq(payments.providerRef, ref)))
			.limit(1)
	)[0];
}

/**
 * Start an online wallet top-up: a pending wallet_topup payment (same row as "pay at manifest"
 * requests, so it shows in the jumper's request list).
 */
export async function createOnlineTopUp(
	db: Database,
	input: { userId: string; dropzoneId: string; amountMinor: number; provider: PaymentProvider; returnTo: string; cancelTo?: string; now?: number }
): Promise<Payment> {
	const p = await requestTopUp(db, { userId: input.userId, dropzoneId: input.dropzoneId, amountMinor: input.amountMinor, provider: input.provider, now: input.now });
	return (
		await db
			.update(payments)
			.set({ metadata: { returnTo: input.returnTo, cancelTo: input.cancelTo ?? input.returnTo } satisfies PaymentMeta })
			.where(eq(payments.id, p.id))
			.returning()
	)[0];
}

/**
 * Start an online tandem payment for one or more passengers of the same dropzone. `amounts` is
 * the per-passenger amount (deposit or outstanding balance).
 */
export async function createOnlineTandemPayment(
	db: Database,
	input: {
		dropzoneId: string;
		provider: PaymentProvider;
		deposit: boolean;
		allocations: { passengerId: string; amountMinor: number }[];
		returnTo: string;
		cancelTo?: string;
		now?: number;
	}
): Promise<Payment> {
	const allocs = input.allocations.filter((a) => a.amountMinor > 0);
	if (allocs.length === 0) throw new DomainError('invalid', 'Nothing to pay');
	if (allocs.some((a) => !Number.isInteger(a.amountMinor))) throw new DomainError('invalid', 'Invalid amount');
	const list = await db.select().from(tandemPassengers).where(inArray(tandemPassengers.id, allocs.map((a) => a.passengerId)));
	if (list.length !== allocs.length || list.some((p) => p.dropzoneId !== input.dropzoneId)) throw new DomainError('not_found', 'Booking not found');
	const currencies = new Set(list.map((p) => p.currency));
	if (currencies.size !== 1) throw new DomainError('currency_mismatch', 'Bookings use different currencies');
	const now = input.now ?? Date.now();
	return (
		await db
			.insert(payments)
			.values({
				id: newId(),
				dropzoneId: input.dropzoneId,
				tandemPassengerId: allocs[0].passengerId,
				purpose: input.deposit ? 'tandem_deposit' : 'tandem',
				provider: input.provider,
				status: 'pending',
				amountMinor: allocs.reduce((a, x) => a + x.amountMinor, 0),
				currency: list[0].currency,
				metadata: { returnTo: input.returnTo, cancelTo: input.cancelTo ?? input.returnTo, allocations: allocs } satisfies PaymentMeta,
				createdAt: new Date(now)
			})
			.returning()
	)[0];
}

export async function updatePaymentMeta(db: Database, id: string, patch: Partial<PaymentMeta> & { providerRef?: string | null }): Promise<void> {
	const p = assertFound(await getPayment(db, id), 'Payment');
	const { providerRef, ...m } = patch;
	await db
		.update(payments)
		.set({ metadata: { ...meta(p), ...m }, ...(providerRef !== undefined ? { providerRef } : {}) })
		.where(eq(payments.id, id));
}

export type ConfirmInput = {
	paymentId: string;
	provider: PaymentProvider;
	outcome: 'succeeded' | 'failed' | 'cancelled';
	providerTxId: string;
	amountMinor: number;
	currency: string;
	via?: 'webhook' | 'return';
	now?: number;
};

export type ConfirmResult = { payment: Payment; applied: boolean; reason?: string };

/** Apply a verified provider statement to our payment (idempotent). */
export async function confirmOnlinePayment(db: Database, input: ConfirmInput): Promise<ConfirmResult> {
	const p = assertFound(await getPayment(db, input.paymentId), 'Payment');
	if (p.provider !== input.provider) throw new DomainError('invalid', `Payment ${p.id} isn't a ${input.provider} payment`);
	const now = input.now ?? Date.now();

	if (p.status === 'succeeded' || p.status === 'refunded') return { payment: p, applied: false, reason: 'already confirmed' };
	const dup = (
		await db
			.select({ id: payments.id })
			.from(payments)
			.where(and(eq(payments.provider, input.provider), eq(payments.providerEventId, input.providerTxId)))
			.limit(1)
	)[0];
	if (dup) return { payment: p, applied: false, reason: 'transaction already recorded' };

	if (input.outcome !== 'succeeded') {
		if (p.status !== 'pending') return { payment: p, applied: false, reason: `already ${p.status}` };
		const updated = (
			await db
				.update(payments)
				.set({ status: input.outcome === 'failed' ? 'failed' : 'cancelled', metadata: { ...meta(p), failureReason: `${input.provider}: ${input.outcome}` } })
				.where(eq(payments.id, p.id))
				.returning()
		)[0];
		return { payment: updated, applied: true };
	}

	if (input.currency.toUpperCase() !== p.currency.toUpperCase() || Math.abs(input.amountMinor - p.amountMinor) > 1) {
		throw new DomainError('invalid', `Amount mismatch: provider reported ${input.amountMinor} ${input.currency}, expected ${p.amountMinor} ${p.currency}`, {
			expected: p.amountMinor,
			got: input.amountMinor
		});
	}
	// Paid after a cancel/fail on our side: the money is real, so apply it.
	if (p.status !== 'pending') await db.update(payments).set({ status: 'pending' }).where(eq(payments.id, p.id));
	const m: PaymentMeta = { ...meta(p), confirmedVia: input.via ?? 'webhook' };

	if (p.purpose === 'wallet_topup') {
		await db.update(payments).set({ metadata: m }).where(eq(payments.id, p.id));
		const done = await completeTopUpRequest(db, { paymentId: p.id, provider: input.provider, providerEventId: input.providerTxId, now });
		return { payment: done, applied: true };
	}

	if (p.purpose === 'tandem' || p.purpose === 'tandem_deposit') {
		const allocs = m.allocations ?? (p.tandemPassengerId ? [{ passengerId: p.tandemPassengerId, amountMinor: p.amountMinor }] : []);
		const list = allocs.length ? await db.select().from(tandemPassengers).where(inArray(tandemPassengers.id, allocs.map((a) => a.passengerId))) : [];
		const statements: Statement[] = [];
		for (const a of allocs) {
			const tp = list.find((x) => x.id === a.passengerId);
			if (!tp) continue; // passenger deleted since — payment still recorded
			const paid = tp.amountPaidMinor + a.amountMinor;
			const deposit = p.purpose === 'tandem_deposit' ? tp.depositMinor + a.amountMinor : tp.depositMinor;
			statements.push(
				db
					.update(tandemPassengers)
					.set({ amountPaidMinor: paid, depositMinor: deposit, paymentMethod: input.provider, paidAt: new Date(now), paymentStatus: paymentStatusFor(tp.totalMinor, paid, deposit) })
					.where(eq(tandemPassengers.id, tp.id))
			);
		}
		statements.push(
			db
				.update(payments)
				.set({ status: 'succeeded', providerEventId: input.providerTxId, completedAt: new Date(now), metadata: m })
				.where(and(eq(payments.id, p.id), eq(payments.status, 'pending')))
		);
		await runAtomic(db, statements);
		return { payment: assertFound(await getPayment(db, p.id), 'Payment'), applied: true };
	}

	throw new DomainError('invalid', `Online confirmation isn't supported for ${p.purpose} payments`);
}

/** Customer came back via the provider's cancel link: mark still-pending payment cancelled. */
export async function cancelPendingOnlinePayment(db: Database, id: string): Promise<Payment | undefined> {
	const p = await getPayment(db, id);
	if (!p || p.status !== 'pending') return p;
	return (
		await db
			.update(payments)
			.set({ status: 'cancelled', metadata: { ...meta(p), failureReason: 'cancelled by customer' } })
			.where(and(eq(payments.id, id), eq(payments.status, 'pending')))
			.returning()
	)[0];
}

/** How long an online checkout may stay `pending` before housekeeping calls it abandoned. */
export const ABANDONED_CHECKOUT_MS = 48 * 3_600_000;

/**
 * Online checkouts the customer never finished (closed the provider tab, went back): still
 * `pending` after ABANDONED_CHECKOUT_MS → `cancelled` ("expired"), so they stop showing as
 * "waiting for <provider>" in the jumper's wallet and in Settings → Payments. Pay-at-manifest
 * requests are left alone (staff collect those). A genuine success that arrives later is still
 * applied by `confirmOnlinePayment`. Returns how many were expired (≤ `limit` per run).
 */
export async function expireAbandonedCheckouts(db: Database, now = Date.now(), limit = 200): Promise<number> {
	const stale = await db
		.select()
		.from(payments)
		.where(and(eq(payments.status, 'pending'), ne(payments.provider, 'manual'), lt(payments.createdAt, new Date(now - ABANDONED_CHECKOUT_MS))))
		.limit(limit);
	let n = 0;
	for (const p of stale) {
		const r = await db
			.update(payments)
			.set({ status: 'cancelled', metadata: { ...meta(p), failureReason: 'expired: checkout not completed' } })
			.where(and(eq(payments.id, p.id), eq(payments.status, 'pending')))
			.returning({ id: payments.id });
		n += r.length;
	}
	return n;
}

/** True when a tandem payment paid (part of) this passenger's booking (group payments via allocations). */
export function paymentCovers(p: Payment, passengerId: string): boolean {
	return p.tandemPassengerId === passengerId || !!meta(p).allocations?.some((a) => a.passengerId === passengerId);
}

/**
 * The newest online tandem checkout covering this passenger that is still `pending` and not yet
 * old enough for housekeeping to expire. Lets the booking page show "not confirmed yet" with
 * Check / Cancel when the customer comes back without the provider's redirect (closed the tab,
 * went back, opened the emailed link).
 */
export async function pendingTandemCheckout(db: Database, dropzoneId: string, passengerId: string, now = Date.now()): Promise<Payment | undefined> {
	const rows = await db
		.select()
		.from(payments)
		.where(
			and(
				eq(payments.dropzoneId, dropzoneId),
				eq(payments.status, 'pending'),
				ne(payments.provider, 'manual'),
				inArray(payments.purpose, ['tandem', 'tandem_deposit']),
				gte(payments.createdAt, new Date(now - ABANDONED_CHECKOUT_MS))
			)
		)
		.orderBy(desc(payments.createdAt))
		.limit(50);
	return rows.find((p) => paymentCovers(p, passengerId));
}

/**
 * Which of these passengers have an open online checkout (see `pendingTandemCheckout`): one
 * query for the whole tandem list, so staff can spot "customer is paying online" on a row
 * before taking money at the counter.
 */
export async function passengersWithPendingCheckout(db: Database, dropzoneId: string, passengerIds: string[], now = Date.now()): Promise<Set<string>> {
	const out = new Set<string>();
	if (!passengerIds.length) return out;
	const rows = await db
		.select()
		.from(payments)
		.where(
			and(
				eq(payments.dropzoneId, dropzoneId),
				eq(payments.status, 'pending'),
				ne(payments.provider, 'manual'),
				inArray(payments.purpose, ['tandem', 'tandem_deposit']),
				gte(payments.createdAt, new Date(now - ABANDONED_CHECKOUT_MS))
			)
		)
		.orderBy(desc(payments.createdAt))
		.limit(200);
	for (const id of passengerIds) if (rows.some((p) => paymentCovers(p, id))) out.add(id);
	return out;
}

/** Online payments for a dropzone, newest first (settings page "recent payments"). */
export async function listOnlinePayments(db: Database, dropzoneId: string, providers: PaymentProvider[], limit = 20) {
	return db
		.select()
		.from(payments)
		.where(and(eq(payments.dropzoneId, dropzoneId), inArray(payments.provider, providers)))
		.orderBy(desc(payments.createdAt))
		.limit(limit);
}
