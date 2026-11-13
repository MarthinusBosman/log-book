import { error, redirect } from '@sveltejs/kit';
import { APP_ORIGIN } from '$app/env/private';
import { findByConfirmation, tandemOutstanding } from '#lib/server/domain/tandems.ts';
import { groupCodes, groupDue, loadGroup } from '#lib/server/tandems/group.ts';
import { listSections } from '#lib/server/domain/indemnity.ts';
import { DomainError, isDomainError } from '#lib/server/domain/errors.ts';
import { ageOn } from '#lib/server/domain/time.ts';
import { getStorage } from '#lib/server/storage/index.ts';
import { readAnswerFields, signTandemWaiver } from '#lib/server/tandems/documents.ts';
import { failFrom, publicOrigin, str } from '#lib/server/tandems/http.ts';
import { publicDropzone } from '#lib/server/tandems/public.ts';
import type { Database } from '#lib/server/db/index.ts';
import { getPriceMap } from '#lib/server/domain/pricing.ts';
import { cancelPendingOnlinePayment, getPayment, paymentCovers, pendingTandemCheckout } from '#lib/server/domain/online-payments.ts';
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

/** Per-jumper deposit configured on the DZ's price list. */
async function depositEach(db: Database, dropzoneId: string): Promise<number> {
	return (await getPriceMap(db, dropzoneId)).tandem_deposit ?? 0;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const dz = await publicDropzone(locals.db, params.slug);
	const p = await booking(locals.db, dz.id, params.conf);
	const sections = await listSections(locals.db, dz.id, 'tandem');
	const pid = url.searchParams.get('payment');
	// Back from the provider (?payment=), or back some other way while a checkout is still open.
	const pay = pid ? await getPayment(locals.db, pid) : await pendingTandemCheckout(locals.db, dz.id, p.id);
	const paymentNotice =
		pay && pay.dropzoneId === dz.id && paymentCovers(pay, p.id)
			? {
					id: pay.id,
					status: pay.status,
					amountMinor: pay.amountMinor,
					currency: pay.currency,
					provider: isOnlineProvider(pay.provider) ? PROVIDERS[pay.provider].label : pay.provider
				}
			: url.searchParams.get('payerror')
				? { id: null, status: 'error' as const, amountMinor: 0, currency: p.currency, provider: '' }
				: null;
	const { usable } = await dropzonePayments(locals.db, dz, secretsKey());
	const codes = groupCodes(url.searchParams.get('g'));
	const others = await loadGroup(locals.db, p, codes);
	const dep = await depositEach(locals.db, dz.id);
	const mine = groupDue([p], dep);
	const everyone = others.length ? groupDue([p, ...others], dep) : null;
	const group = others.map((g) => ({
		name: g.name,
		confirmationNumber: g.confirmationNumber,
		signed: !!g.indemnitySignedAt,
		cancelled: g.status === 'cancelled',
		outstandingMinor: g.status === 'cancelled' ? 0 : tandemOutstanding(g),
		priced: g.totalMinor > 0
	}));
	const priced = [p, ...others].some((x) => x.totalMinor > 0);
	const waiver = dz.indemnityTandemActive && sections.length > 0;
	const payable = (d: ReturnType<typeof groupDue>) => ({ balance: d.balanceMinor, deposit: d.depositMinor });
	return {
		waiver,
		groupQuery: others.map((g) => g.confirmationNumber).join(','),
		/** What the whole group (lead included) still owes; null for a single or unpriced booking. */
		groupDueMinor: everyone && priced ? everyone.balanceMinor : null,
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
		payOnline: (() => {
			const me = p.status !== 'cancelled' && mine.balanceMinor > 0 ? payable(mine) : null;
			// Offered only when someone besides the lead still owes something.
			const grp = everyone && everyone.allocations.balance.some((a) => a.passengerId !== p.id) ? { ...payable(everyone), count: everyone.allocations.balance.length } : null;
			return usable.length && (me || grp) ? { providers: providerChoices(usable), me, group: grp } : null;
		})()
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
			const { usable } = await dropzonePayments(locals.db, dz, secretsKey());
			if (!isOnlineProvider(provider) || !usable.includes(provider)) throw new DomainError('invalid', 'Please choose how you would like to pay');
			// "group" pays for every jumper of the booking still owing (listed in the hidden `g`).
			const others = str(f, 'who') === 'group' ? await loadGroup(locals.db, p, groupCodes(str(f, 'g'))) : [];
			if (p.status === 'cancelled' && !others.length) throw new DomainError('invalid', 'This booking was cancelled');
			const due = groupDue([p, ...others], await depositEach(locals.db, dz.id));
			const deposit = str(f, 'pay') === 'deposit' && due.depositMinor > 0;
			const allocations = deposit ? due.allocations.deposit : due.allocations.balance;
			if (!allocations.length) throw new DomainError('invalid', 'Nothing left to pay');
			const g = others.map((o) => o.confirmationNumber).join(',');
			const res = await startTandemCheckout(locals.db, paymentsContext(), {
				dz,
				provider,
				origin: publicOrigin(url, APP_ORIGIN),
				deposit,
				allocations,
				description: `${deposit ? 'Tandem skydive deposit' : 'Tandem skydive'} · ${dz.name}`,
				customer: { name: p.name, email: p.email, phone: p.phone },
				returnTo: `/dz/${dz.slug}/book/${p.confirmationNumber}${g ? `?${new URLSearchParams({ g })}` : ''}`,
				secretsKey: secretsKey()
			});
			next = res.next;
		} catch (e) {
			return failFrom(e);
		}
		redirect(303, next, { external: [new URL(next).origin] });
	},

	/** Give up on an online checkout that never completed (the pending notice's Cancel). */
	cancelPayment: async ({ locals, params, request }) => {
		const dz = await publicDropzone(locals.db, params.slug);
		const p = await booking(locals.db, dz.id, params.conf);
		const f = await request.formData();
		const pay = await getPayment(locals.db, str(f, 'paymentId'));
		if (!pay || pay.dropzoneId !== dz.id || !paymentCovers(pay, p.id)) return failFrom(new DomainError('not_found', 'Payment not found'));
		// Only flips a still-pending row; money that really arrives later is still applied.
		await cancelPendingOnlinePayment(locals.db, pay.id);
		const g = str(f, 'g');
		const q = new URLSearchParams(g ? { g, payment: pay.id } : { payment: pay.id });
		redirect(303, `/dz/${dz.slug}/book/${p.confirmationNumber}?${q}`);
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
