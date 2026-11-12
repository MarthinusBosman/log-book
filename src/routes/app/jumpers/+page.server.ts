import { jumperDirectory } from '#lib/server/domain/staff-admin.ts';
import { requirePage } from '#lib/server/staffadmin/context.ts';
import { membershipCheckStates } from '#lib/server/memberships/service.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'checkin.manage', 'payments.manage', 'staff.manage', 'manifest');
	const q = event.url.searchParams.get('q')?.slice(0, 100) ?? '';
	const jumpers = await jumperDirectory(event.locals.db, ctx.dz.id, ctx.today);
	return {
		q,
		jumpers,
		pasaStates: await membershipCheckStates(event.locals.db, jumpers.map((j) => j.userId)),
		currency: ctx.dz.currency,
		walletEnabled: ctx.dz.walletEnabled,
		waiverRequired: ctx.dz.indemnitySportActive,
		canPay: ctx.can('payments.manage')
	};
};
