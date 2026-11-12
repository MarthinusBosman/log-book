import { error } from '@sveltejs/kit';
import { CSV_KINDS, reportCsv, reportData, type CsvKind } from '#lib/server/staffadmin/reports.ts';
import { csvResponse } from '#lib/server/staffadmin/csv.ts';
import { rangeFromUrl, requirePage } from '#lib/server/staffadmin/context.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const ctx = await requirePage(event, 'reports.view');
	const kind = event.url.searchParams.get('kind') as CsvKind;
	if (!CSV_KINDS.includes(kind)) error(400, 'Unknown report');
	const { from, to } = rangeFromUrl(event.url, ctx.today, 30);
	const data = await reportData(event.locals.db, ctx.dz.id, from, to);
	return csvResponse(`${kind}-${ctx.dz.slug}-${from}_${to}.csv`, reportCsv(kind, data, ctx.dz.currency));
};
