import { staffOverview } from '#lib/server/domain/staff-admin.ts';
import { rangeFromUrl, requirePage } from '#lib/server/staffadmin/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'staff.manage', 'reports.view');
	const { from, to } = rangeFromUrl(event.url, ctx.today, 30);
	const staff = await staffOverview(event.locals.db, ctx.dz.id, from, to, ctx.today);
	return {
		staff,
		from,
		to,
		today: ctx.today,
		currency: ctx.dz.currency,
		staffPayToWallet: !!ctx.dz.settings.staffPayToWallet,
		canManage: ctx.can('staff.manage')
	};
};
