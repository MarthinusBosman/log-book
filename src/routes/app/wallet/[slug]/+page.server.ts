import { error, fail, redirect } from '@sveltejs/kit';
import { APP_ORIGIN } from '$app/env/private';
import { eq } from 'drizzle-orm';
import { dropzones } from '#lib/server/db/schema.ts';
import { getAccount, listLedger, paySlotsFromWallet } from '#lib/server/domain/wallet.ts';
import { cancelTopUpRequest, listTopUpRequests, paidSlots, requestTopUp, unpaidSlots } from '#lib/server/domain/payments.ts';
import { describeJump } from '#lib/server/domain/loads.ts';
import { domainFail, moneyMinor, requireUser, str } from '#lib/server/jumper/forms.ts';
import { getPayment } from '#lib/server/domain/online-payments.ts';
import { PROVIDERS, dropzonePayments, isOnlineProvider, providerChoices, startTopUpCheckout } from '#lib/server/payments/index.ts';
import { paymentsContext, secretsKey } from '#lib/server/payments/runtime.ts';
import { publicOrigin } from '#lib/server/tandems/http.ts';
import type { Dropzone } from '#lib/server/db/schema.ts';
import { formatMoney } from '#lib/domain/constants.ts';
import type { Slot } from '#lib/server/db/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const MANUAL = { id: 'manual', label: 'Pay at manifest', description: 'Pay cash or card at the manifest desk. Your wallet is credited as soon as manifest confirms it.' };

/** Top-up options: pay at manifest + every online provider the DZ has connected. */
async function topUpOptions(db: App.Locals['db'], dz: Dropzone) {
	if (!dz.walletEnabled) return { options: [], usable: [] };
	const { usable } = await dropzonePayments(db, dz, secretsKey());
	return { options: [...providerChoices(usable), MANUAL], usable };
}

const providerLabel = (id: string) => (isOnlineProvider(id) ? PROVIDERS[id].label : 'manifest');

async function dzBySlug(locals: App.Locals, slug: string) {
	const dz = (await locals.db.select().from(dropzones).where(eq(dropzones.slug, slug)).limit(1))[0];
	if (!dz) error(404, 'Dropzone not found');
	return dz;
}

const slotView = (s: { slot: Slot; load: { id: string; day: string; loadNumber: number; status: string } }) => ({
	id: s.slot.id,
	day: s.load.day,
	loadNumber: s.load.loadNumber,
	loadStatus: s.load.status,
	title: describeJump(s.slot.jumpType, 1, s.slot.staffRole),
	lines: s.slot.priceBreakdown,
	totalMinor: s.slot.totalMinor,
	currency: s.slot.currency,
	held: !!s.slot.walletHoldId,
	paidVia: s.slot.paidVia
});

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals, url);
	const dz = await dzBySlug(locals, params.slug);
	const account = await getAccount(locals.db, user.id, dz.id);
	const pid = url.searchParams.get('payment');
	const [ledger, unpaid, paid, requests, topup, notice] = await Promise.all([
		account ? listLedger(locals.db, account.id, { limit: 200 }) : Promise.resolve([]),
		unpaidSlots(locals.db, user.id, dz.id),
		paidSlots(locals.db, user.id, dz.id),
		listTopUpRequests(locals.db, user.id, dz.id),
		topUpOptions(locals.db, dz),
		pid ? getPayment(locals.db, pid) : Promise.resolve(undefined)
	]);
	return {
		dz: { id: dz.id, slug: dz.slug, name: dz.name, currency: dz.currency, walletEnabled: dz.walletEnabled, paymentsOn: dz.paymentsOn, allowNegative: dz.walletAllowNegative },
		account: account
			? { availableMinor: account.availableMinor, pendingMinor: account.pendingMinor, currency: account.currency, updatedAt: (account.lastActivityAt ?? account.createdAt).getTime() }
			: null,
		ledger: ledger.map((e) => ({ id: e.id, type: e.type, amountMinor: e.amountMinor, availableAfterMinor: e.availableAfterMinor, reason: e.reason, origin: e.origin, provider: e.provider, createdAt: e.createdAt.getTime() })),
		unpaid: unpaid.map(slotView).filter((s) => s.totalMinor > 0),
		paid: paid.map(slotView).reverse(),
		requests: requests.map((p) => ({ id: p.id, amountMinor: p.amountMinor, currency: p.currency, status: p.status, provider: p.provider, providerLabel: providerLabel(p.provider), createdAt: p.createdAt.getTime() })),
		providers: topup.options,
		paymentNotice:
			notice && notice.userId === user.id && notice.dropzoneId === dz.id && notice.purpose === 'wallet_topup'
				? { status: notice.status, amountMinor: notice.amountMinor, currency: notice.currency, provider: providerLabel(notice.provider) }
				: null
	};
};

export const actions: Actions = {
	topup: async ({ locals, params, request, url }) => {
		const user = requireUser(locals);
		const dz = await dzBySlug(locals, params.slug);
		const form = await request.formData();
		const amountMinor = moneyMinor(form, 'amount');
		if (!Number.isFinite(amountMinor) || amountMinor <= 0) return fail(400, { action: 'topup', message: 'Enter a valid amount' });
		if (amountMinor > 10_000_000) return fail(400, { action: 'topup', message: 'That amount is too large for one top-up' });
		const providerId = str(form, 'provider') || 'manual';
		let next: string | null = null;
		try {
			const { options } = await topUpOptions(locals.db, dz);
			if (!options.some((o) => o.id === providerId)) return fail(400, { action: 'topup', message: 'Choose how you want to pay' });
			if (isOnlineProvider(providerId)) {
				const res = await startTopUpCheckout(locals.db, paymentsContext(), {
					dz,
					provider: providerId,
					userId: user.id,
					amountMinor,
					origin: publicOrigin(url, APP_ORIGIN),
					description: `Wallet top-up · ${dz.name}`,
					customer: { name: user.name, email: user.email },
					returnTo: `/app/wallet/${dz.slug}`,
					secretsKey: secretsKey()
				});
				next = res.next;
			} else {
				await requestTopUp(locals.db, { userId: user.id, dropzoneId: dz.id, amountMinor, provider: 'manual' });
			}
		} catch (e) {
			return domainFail(e, { action: 'topup' });
		}
		if (next) redirect(303, next, { external: [new URL(next).origin] });
		return { action: 'topup', success: `Top-up requested. Pay at manifest at ${dz.name} and they'll credit your wallet.`, amount: formatMoney(amountMinor, dz.currency) };
	},
	cancel: async ({ locals, request }) => {
		const user = requireUser(locals);
		try {
			await cancelTopUpRequest(locals.db, str(await request.formData(), 'paymentId'), user.id);
		} catch (e) {
			return domainFail(e, { action: 'cancel' });
		}
		return { action: 'cancel', success: 'Top-up request cancelled' };
	},
	pay: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const dz = await dzBySlug(locals, params.slug);
		const ids = (await request.formData()).getAll('slotIds').map(String);
		try {
			const res = await paySlotsFromWallet(locals.db, { userId: user.id, dropzoneId: dz.id, slotIds: ids });
			if (!res.paidSlotIds.length) return fail(400, { action: 'pay', message: 'Nothing to pay' });
			return { action: 'pay', success: `Your payment of ${formatMoney(res.totalMinor, dz.currency)} to ${dz.name} has succeeded. Slots paid: ${res.paidSlotIds.length}` };
		} catch (e) {
			return domainFail(e, { action: 'pay' });
		}
	}
};
