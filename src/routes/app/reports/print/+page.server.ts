import { reportData, summaryRows } from '#lib/server/staffadmin/reports.ts';
import { rangeFromUrl, requirePage } from '#lib/server/staffadmin/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = await requirePage(event, 'reports.view');
	const { from, to } = rangeFromUrl(event.url, ctx.today, 30);
	const d = await reportData(event.locals.db, ctx.dz.id, from, to);
	return {
		from,
		to,
		dzName: ctx.dz.name,
		currency: ctx.dz.currency,
		generatedOn: ctx.today,
		summary: summaryRows(d.jumps.totals),
		loads: d.jumps.totals.loads,
		perDay: d.jumps.perDay,
		perAircraft: d.jumps.perAircraft,
		perStaff: d.jumps.perStaff,
		revenue: d.revenue
	};
};
