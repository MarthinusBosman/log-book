import { jumperDirectory } from '#lib/server/domain/staff-admin.ts';
import { requirePage } from '#lib/server/staffadmin/context.ts';
import { membershipCheckStates } from '#lib/server/memberships/service.ts';
import { pendingTopUpTotals } from '#lib/server/domain/payments.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'checkin.manage', 'payments.manage', 'staff.manage', 'manifest');
	const canPay = ctx.can('payments.manage');
	const [jumpers, topUps] = await Promise.all([
		jumperDirectory(event.locals.db, ctx.dz.id, ctx.today),
		canPay && ctx.dz.walletEnabled ? pendingTopUpTotals(event.locals.db, ctx.dz.id) : Promise.resolve({} as Record<string, number>)
	]);
	return {
		jumpers,
		/** Payment staff: pay-at-manifest top-ups waiting per jumper (userId → minor units). */
		topUps,
		pasaStates: await membershipCheckStates(event.locals.db, jumpers.map((j) => j.userId)),
		currency: ctx.dz.currency,
		walletEnabled: ctx.dz.walletEnabled,
		waiverRequired: ctx.dz.indemnitySportActive,
		canPay
	};
};
