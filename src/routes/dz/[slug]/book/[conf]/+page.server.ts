import { error, redirect } from '@sveltejs/kit';
import { APP_ORIGIN } from '$app/env/private';
import { findByConfirmation, tandemOutstanding } from '#lib/server/domain/tandems.ts';
import { listSections } from '#lib/server/domain/indemnity.ts';
import { DomainError, isDomainError } from '#lib/server/domain/errors.ts';
import { ageOn } from '#lib/server/domain/time.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { readAnswerFields, signTandemWaiver } from '#lib/server/tandems/documents.ts';
import { failFrom, publicOrigin, str } from '#lib/server/tandems/http.ts';
import { publicDropzone } from '#lib/server/tandems/public.ts';
import type { Database } from '#lib/server/db/index.ts';
import type { Payment } from '#lib/server/db/schema.ts';
import { getPriceMap } from '#lib/server/domain/pricing.ts';
import { getPayment, meta } from '#lib/server/domain/online-payments.ts';
import { PROVIDERS, dropzonePayments, isOnlineProvider, providerChoices, startTandemCheckout } from '#lib/server/payments/index.ts';
import { paymentsContext, secretsKey } from '#lib/server/payments/runtime.ts';
import type { Actions, PageServerLoad } from './$types';

/** Confirmation numbers are the access token: normalise and scope to the DZ. */
async function booking(db: Database, dzId: string, conf: string) {
	const code = conf.toUpperCase().replace(/[^A-Z0-9]/g, '');
	const normalised = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : conf;
	const p = await findByConfirmation(db, normalised);
	if (!p || p.dropzoneId !== dzId) error(404, 'Booking not found — check your confirmation number');
	return p;
}

/** A payment may be shown on this booking page only if it paid (part of) this booking. */
function coversPassenger(pay: Payment, passengerId: string): boolean {
	return pay.tandemPassengerId === passengerId || !!meta(pay).allocations?.some((a) => a.passengerId === passengerId);
}

/** Deposit still due (nothing paid yet) and balance, for the "pay online" card. */
async function onlineDue(db: Database, p: { dropzoneId: string; amountPaidMinor: number; totalMinor: number }) {
	const balance = Math.max(0, p.totalMinor - p.amountPaidMinor);
	const deposit = p.amountPaidMinor === 0 ? Math.min(balance, (await getPriceMap(db, p.dropzoneId)).tandem_deposit ?? 0) : 0;
	return { balance, deposit: deposit > 0 && deposit < balance ? deposit : 0 };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const dz = await publicDropzone(locals.db, params.slug);
	const p = await booking(locals.db, dz.id, params.conf);
	const sections = await listSections(locals.db, dz.id, 'tandem');
	const pid = url.searchParams.get('payment');
	const pay = pid ? await getPayment(locals.db, pid) : undefined;
	const paymentNotice =
		pay && coversPassenger(pay, p.id)
			? { status: pay.status, amountMinor: pay.amountMinor, currency: pay.currency, provider: isOnlineProvider(pay.provider) ? PROVIDERS[pay.provider].label : pay.provider }
			: url.searchParams.get('payerror')
				? { status: 'error' as const, amountMinor: 0, currency: p.currency, provider: '' }
				: null;
	const { usable } = await dropzonePayments(locals.db, dz, secretsKey());
	const due = await onlineDue(locals.db, p);
	const groupCodes = (url.searchParams.get('g') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, 4);
	const group = [];
	for (const c of groupCodes) {
		const g = await findByConfirmation(locals.db, c);
		if (g && g.dropzoneId === dz.id && g.jumpDate === p.jumpDate) {
			group.push({ name: g.name, confirmationNumber: g.confirmationNumber, signed: !!g.indemnitySignedAt });
		}
	}
	const waiver = dz.indemnityTandemActive && sections.length > 0;
	return {
		waiver,
		groupQuery: groupCodes.join(','),
		sections: sections.map((s) => ({ title: s.title, content: s.content, type: s.type })),
		booking: {
			name: p.name,
			email: p.email,
			confirmationNumber: p.confirmationNumber,
			jumpDate: p.jumpDate,
			bookingTime: p.bookingTime,
			extras: p.extras,
			status: p.status,
			totalMinor: p.totalMinor,
			amountPaidMinor: p.amountPaidMinor,
			outstandingMinor: tandemOutstanding(p),
			currency: p.currency,
			signedAt: p.indemnitySignedAt,
			minor: !!p.dob && !!p.jumpDate && ageOn(p.dob, p.jumpDate) < 18,
			guardianName: p.guardianName
		},
		group,
		paymentNotice,
		payOnline: p.status !== 'cancelled' && due.balance > 0 && usable.length ? { providers: providerChoices(usable), ...due } : null
	};
};

export const actions: Actions = {
	/** Pay the deposit or the balance of this booking online with one of the DZ's providers. */
	pay: async ({ locals, params, request, url }) => {
		const dz = await publicDropzone(locals.db, params.slug);
		const p = await booking(locals.db, dz.id, params.conf);
		const f = await request.formData();
		const provider = str(f, 'provider');
		let next: string;
		try {
			if (p.status === 'cancelled') throw new DomainError('invalid', 'This booking was cancelled');
			const { usable } = await dropzonePayments(locals.db, dz, secretsKey());
			if (!isOnlineProvider(provider) || !usable.includes(provider)) throw new DomainError('invalid', 'Please choose how you would like to pay');
			const due = await onlineDue(locals.db, p);
			const deposit = str(f, 'pay') === 'deposit' && due.deposit > 0;
			const amountMinor = deposit ? due.deposit : due.balance;
			if (amountMinor <= 0) throw new DomainError('invalid', 'Nothing left to pay');
			const res = await startTandemCheckout(locals.db, paymentsContext(), {
				dz,
				provider,
				origin: publicOrigin(url, APP_ORIGIN),
				deposit,
				allocations: [{ passengerId: p.id, amountMinor }],
				description: `${deposit ? 'Tandem skydive deposit' : 'Tandem skydive'} · ${dz.name}`,
				customer: { name: p.name, email: p.email, phone: p.phone },
				returnTo: `/dz/${dz.slug}/book/${p.confirmationNumber}`,
				secretsKey: secretsKey()
			});
			next = res.next;
		} catch (e) {
			return failFrom(e);
		}
		redirect(303, next, { external: [new URL(next).origin] });
	},

	sign: async ({ locals, params, request }) => {
		const dz = await publicDropzone(locals.db, params.slug);
		const p = await booking(locals.db, dz.id, params.conf);
		if (p.indemnitySignedAt) return { ok: true, message: 'Already signed' };
		if (p.status === 'cancelled') return failFrom(new DomainError('invalid', 'This booking was cancelled'));
		const form = await request.formData();
		const sections = await listSections(locals.db, dz.id, 'tandem');
		try {
			await signTandemWaiver(locals.db, await getStorage(), {
				passengerId: p.id,
				signature: str(form, 'signature'),
				guardianName: str(form, 'guardian_name') || null,
				guardianSignature: str(form, 'guardian_signature') || null,
				answers: readAnswerFields(form, sections.length)
			});
			return { ok: true, message: 'Indemnity signed — see you at the dropzone!' };
		} catch (e) {
			const section = isDomainError(e) ? (e.details as { section?: number } | undefined)?.section : undefined;
			return failFrom(e, { section: section ?? null });
		}
	}
};
