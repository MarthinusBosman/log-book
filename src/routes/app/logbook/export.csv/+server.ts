import { listJumps } from '#lib/server/domain/logbook.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import { dzNameMap, filtersFromUrl } from '#lib/server/jumper/logbook.ts';
import { logbookCsv } from '#lib/server/jumper/csv.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals, url);
	const jumps = await listJumps(locals.db, user.id, { ...filtersFromUrl(url), limit: 100_000, order: 'asc' });
	const names = await dzNameMap(locals.db, jumps);
	const csv = logbookCsv(jumps.map((j) => ({ ...j, dropzoneName: j.dropzoneId ? (names.get(j.dropzoneId) ?? null) : null })));
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="logbook-${stamp}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
