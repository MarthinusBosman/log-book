import { error, fail } from '@sveltejs/kit';
import { jumperDetail } from '#lib/server/domain/staff-admin.ts';
import { adjust, refund, topUp } from '#lib/server/domain/wallet.ts';
import { DESK_TOPUP_PROVIDERS, listTopUpRequests, settleTopUpRequest } from '#lib/server/domain/payments.ts';
import { isDomainError } from '#lib/server/domain/errors.ts';
import { parseMoney } from '#lib/components/staffadmin/money.ts';
import { formatMoney } from '#lib/domain/constants.ts';
import { requirePage, runAction, str } from '#lib/server/staffadmin/context.ts';
import { pasaCheckVM } from '#lib/server/memberships/web.ts';
import { reviewMembership } from '#lib/server/memberships/service.ts';
import type { Actions, PageServerLoad } from './$types';

const TOPUP_PROVIDERS = DESK_TOPUP_PROVIDERS;

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'checkin.manage', 'payments.manage', 'staff.manage', 'manifest');
	try {
		const canPay = ctx.can('payments.manage');
		const [detail, requests] = await Promise.all([
			jumperDetail(event.locals.db, ctx.dz.id, event.params.id, ctx.today),
			canPay && ctx.dz.walletEnabled ? listTopUpRequests(event.locals.db, event.params.id, ctx.dz.id, { pendingOnly: true }) : Promise.resolve([])
		]);
		return {
			...detail,
			/** The jumper's pay-at-manifest top-up requests still waiting for the desk (online ones confirm themselves). */
			topUpRequests: requests.filter((r) => r.provider === 'manual').map((r) => ({ id: r.id, amountMinor: r.amountMinor, createdAt: r.createdAt.getTime() })),
			currency: ctx.dz.currency,
			walletEnabled: ctx.dz.walletEnabled,
			allowNegative: ctx.dz.walletAllowNegative,
			waiverRequired: ctx.dz.indemnitySportActive,
			canPay,
			isSelf: ctx.user.id === event.params.id,
			pasa: await pasaCheckVM(event.locals.db, event.params.id),
			pasaToday: ctx.today,
			canReviewPasa: ctx.can('checkin.manage') || ctx.can('staff.manage')
		};
	} catch (e) {
		if (isDomainError(e)) error(404, 'This person is not a member of your dropzone.');
		throw e;
	}
};

export const actions: Actions = {
	pasaReview: (event) =>
		runAction(event, ['checkin.manage', 'staff.manage'], async ({ dz, user }) => {
			const approve = str(await event.request.formData(), 'approve') === '1';
			// Must be a member here (throws not_found otherwise).
			await jumperDetail(event.locals.db, dz.id, event.params.id, '1970-01-01');
			const status = await reviewMembership(event.locals.db, { reviewerId: user.id, userId: event.params.id, approve, dropzoneName: dz.name });
			return { message: status === 'rejected' ? 'PASA link declined' : 'PASA membership confirmed' };
		}),
	topUpRequest: (event) =>
		runAction(event, 'payments.manage', async ({ dz, user }) => {
			const f = await event.request.formData();
			const outcome = str(f, 'outcome') === 'decline' ? 'declined' : 'paid';
			const provider = str(f, 'provider') as (typeof DESK_TOPUP_PROVIDERS)[number];
			if (outcome === 'paid' && !DESK_TOPUP_PROVIDERS.includes(provider)) return fail(400, { message: 'Pick how the money was paid.' });
			const p = await settleTopUpRequest(event.locals.db, {
				paymentId: str(f, 'id'),
				dropzoneId: dz.id,
				userId: event.params.id,
				by: user.id,
				outcome,
				provider: outcome === 'paid' ? provider : undefined
			});
			return { message: outcome === 'paid' ? `${formatMoney(p.amountMinor, p.currency)} added to the wallet` : 'Top-up request declined' };
		}),
	wallet: (event) =>
		runAction(event, 'payments.manage', async ({ dz, user }) => {
			const f = await event.request.formData();
			const kind = str(f, 'kind');
			const reason = str(f, 'reason');
			if (!reason) return fail(400, { message: 'Add a reason so the ledger explains this entry.' });
			if (reason.length > 200) return fail(400, { message: 'Keep the reason under 200 characters.' });
			const amountMinor = parseMoney(str(f, 'amount'), { allowNegative: kind === 'adjust' });
			if (amountMinor === null || amountMinor === 0) return fail(400, { message: 'Enter a valid amount, e.g. 450 or 450.00.' });
			if (Math.abs(amountMinor) > 100_000_000) return fail(400, { message: 'That amount is too large.' });
			const userId = event.params.id;
			// Must be a member here (throws not_found otherwise).
			const member = await jumperDetail(event.locals.db, dz.id, userId, '1970-01-01');
			const db = event.locals.db;
			const available = member.account?.availableMinor ?? 0;
			if (kind === 'adjust' && amountMinor < 0 && !dz.walletAllowNegative && available + amountMinor < 0) {
				return fail(400, {
					message: `That would take the wallet below zero (available ${formatMoney(available, dz.currency)}). Negative balances are off in Settings → Features.`
				});
			}
			if (kind === 'topup') {
				const provider = str(f, 'provider') as (typeof TOPUP_PROVIDERS)[number];
				if (!TOPUP_PROVIDERS.includes(provider)) return fail(400, { message: 'Pick how the money was paid.' });
				await topUp(db, { userId, dropzoneId: dz.id, amountMinor, provider, reason, createdBy: user.id });
				return { message: 'Funds added to the wallet' };
			}
			if (kind === 'adjust') {
				await adjust(db, { userId, dropzoneId: dz.id, amountMinor, reason, createdBy: user.id });
				return { message: amountMinor > 0 ? 'Wallet credited' : 'Wallet debited' };
			}
			if (kind === 'refund') {
				await refund(db, { userId, dropzoneId: dz.id, amountMinor, reason, createdBy: user.id });
				return { message: 'Refund recorded' };
			}
			return fail(400, { message: 'Unknown wallet action.' });
		})
};
