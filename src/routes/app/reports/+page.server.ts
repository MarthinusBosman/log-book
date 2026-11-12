import { reportData, summaryRows } from '#lib/server/staffadmin/reports.ts';
import { rangeFromUrl, requirePage } from '#lib/server/staffadmin/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'reports.view');
	const { from, to } = rangeFromUrl(event.url, ctx.today, 30);
	const data = await reportData(event.locals.db, ctx.dz.id, from, to);
	return {
		...data,
		summary: summaryRows(data.jumps.totals),
		from,
		to,
		today: ctx.today,
		currency: ctx.dz.currency,
		dzName: ctx.dz.name,
		walletEnabled: ctx.dz.walletEnabled
	};
};
