import { eq } from 'drizzle-orm';
import { dropzones, users } from '#lib/server/db/schema.ts';
import { listJumps, logbookTotals } from '#lib/server/domain/logbook.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import { dzNameMap, filterSummary, filtersFromUrl, jumpRow } from '#lib/server/jumper/logbook.ts';
import { currentMembership, requestDropzone } from '#lib/server/request-cache.ts';
import { ASSOCIATION_LABELS } from '#lib/domain/constants.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { locals, url } = event;
	const user = requireUser(locals, url);
	const filters = filtersFromUrl(url);
	/** "Printed" day and the 30/365-day totals use the active dropzone's calendar, like the app's pages (this sheet has no app layout). */
	const current = await currentMembership(event, user.id);
	const timezone = (current ? (await requestDropzone(locals, current.dropzone.id))?.timezone : undefined) ?? 'UTC';
	const today = localDate(Date.now(), timezone);
	const [u, jumps, totals] = await Promise.all([
		locals.db.select().from(users).where(eq(users.id, user.id)).limit(1),
		listJumps(locals.db, user.id, { ...filters, limit: 100_000, order: 'asc' }),
		logbookTotals(locals.db, user.id, today)
	]);
	const me = u[0];
	const names = await dzNameMap(locals.db, jumps);
	let filterDz = filters.dropzoneId ? names.get(filters.dropzoneId) : undefined;
	if (filters.dropzoneId && !filterDz) {
		const [dz] = await locals.db.select({ name: dropzones.name }).from(dropzones).where(eq(dropzones.id, filters.dropzoneId)).limit(1);
		filterDz = dz?.name;
	}
	return {
		owner: {
			name: me.name,
			licence: me.licence,
			association: me.association ? `${ASSOCIATION_LABELS[me.association]}${me.associationNumber ? ` #${me.associationNumber}` : ''}` : null
		},
		totals,
		filters,
		/** Set when the print holds only some jumps: the sheet says which, and its stats cover just those. */
		filterSummary: filterSummary(filters, filterDz),
		jumps: jumps.map((j) => jumpRow(j, names)),
		printedOn: today
	};
};
