/** Data for the staff tandem detail drawer / page. */
import type { Database } from '../db/index.ts';
import type { Dropzone, Payment } from '../db/schema.ts';
import { EDITABLE_LOAD_STATUSES, TANDEM_EXTRAS, paymentMethodLabel } from '../../domain/constants.ts';
import { pendingTandemCheckout, type PaymentMeta } from '../domain/online-payments.ts';
import { DomainError } from '../domain/errors.ts';
import { getSignature } from '../domain/indemnity.ts';
import { listLoadsForDay } from '../domain/loads.ts';
import { listUsersWithRole } from '../domain/permissions.ts';
import { getPriceMap, quoteTandem } from '../domain/pricing.ts';
import { getPassenger, tandemGroup, tandemOutstanding } from '../domain/tandems.ts';
import { localDate } from '../domain/time.ts';

export function tandemLimits(dz: Pick<Dropzone, 'settings'>) {
	const s = dz.settings ?? {};
	const n = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d);
	const maxWeightKg = n(s.tandemMaxWeightKg, 100);
	return {
		maxWeightKg,
		warnWeightKg: n(s.tandemWarnWeightKg, maxWeightKg - 5),
		minHeightCm: n(s.tandemMinHeightCm, 140),
		maxHeightCm: n(s.tandemMaxHeightCm, 200)
	};
}

/** Tandem add-ons the DZ prices above 0 (original: the list only shows priced options). */
export async function tandemExtrasOffer(db: Database, dzId: string) {
	const prices = await getPriceMap(db, dzId);
	const base = quoteTandem(prices, []).perJumper.totalMinor;
	const extras = TANDEM_EXTRAS.map((e) => ({ code: e, priceMinor: quoteTandem(prices, [e]).perJumper.totalMinor - base })).filter(
		(e) => e.priceMinor > 0
	);
	return { baseMinor: base, depositMinor: prices.tandem_deposit ?? 0, extras };
}

/**
 * An online checkout the customer started but the provider hasn't confirmed (yet): staff see it on
 * the passenger so they don't take the money a second time at the counter without knowing.
 */
export function checkoutSummary(payment: Payment, passengerId: string) {
	const share = (payment.metadata as PaymentMeta | null)?.allocations?.find((a) => a.passengerId === passengerId);
	const people = (payment.metadata as PaymentMeta | null)?.allocations?.length ?? 1;
	return {
		id: payment.id,
		provider: paymentMethodLabel(payment.provider),
		amountMinor: share?.amountMinor ?? payment.amountMinor,
		totalMinor: payment.amountMinor,
		people,
		deposit: payment.purpose === 'tandem_deposit',
		startedAt: payment.createdAt
	};
}

export async function passengerDetail(db: Database, dz: Dropzone, id: string) {
	const p = await getPassenger(db, id);
	if (!p || p.dropzoneId !== dz.id) throw new DomainError('not_found', 'Tandem booking not found');
	const day = p.jumpDate ?? localDate(Date.now(), dz.timezone);
	const [group, signature, dayLoads, instructors, videographers, checkout] = await Promise.all([
		tandemGroup(db, p.id),
		p.indemnitySignatureId ? getSignature(db, p.indemnitySignatureId) : Promise.resolve(undefined),
		listLoadsForDay(db, dz.id, day),
		listUsersWithRole(db, dz.id, 'tandem_instructor'),
		listUsersWithRole(db, dz.id, 'videographer'),
		p.status === 'cancelled' ? Promise.resolve(undefined) : pendingTandemCheckout(db, dz.id, p.id)
	]);
	return {
		passenger: p,
		outstandingMinor: tandemOutstanding(p),
		pendingCheckout: checkout ? checkoutSummary(checkout, p.id) : null,
		group,
		signature: signature
			? { id: signature.id, signedAt: signature.signedAt, signerName: signature.signerName, guardianName: signature.guardianName, pdfFileId: signature.pdfFileId }
			: null,
		loadsDay: day,
		loads: dayLoads
			.filter((l) => EDITABLE_LOAD_STATUSES.includes(l.status))
			.map((l) => ({ id: l.id, loadNumber: l.loadNumber, status: l.status, aircraftName: l.aircraftName, free: l.stats.free, capacity: l.capacity })),
		instructors,
		videographers
	};
}

export type PassengerDetail = Awaited<ReturnType<typeof passengerDetail>>;
