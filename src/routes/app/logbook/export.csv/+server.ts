import { listJumps } from '#lib/server/domain/logbook.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import { dzInfoMap, filtersFromUrl } from '#lib/server/jumper/logbook.ts';
import { logbookCsv } from '#lib/server/jumper/csv.ts';
import { currentMembership, requestDropzone } from '#lib/server/request-cache.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { locals, url } = event;
	const user = requireUser(locals, url);
	const jumps = await listJumps(locals.db, user.id, { ...filtersFromUrl(url), limit: 100_000, order: 'asc' });
	const info = await dzInfoMap(locals.db, jumps);
	/** Jumps without a dropzone (and the file name) use the active dropzone's calendar, like the app's pages. */
	const current = await currentMembership(event, user.id);
	const timezone = (current ? (await requestDropzone(locals, current.dropzone.id))?.timezone : undefined) ?? 'UTC';
	const csv = logbookCsv(
		jumps.map((j) => {
			const dz = j.dropzoneId ? info.get(j.dropzoneId) : undefined;
			return { ...j, dropzoneName: dz?.name ?? null, dropzoneTimezone: dz?.timezone ?? null };
		}),
		timezone
	);
	const stamp = localDate(Date.now(), timezone);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="logbook-${stamp}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
