import { eq } from 'drizzle-orm';
import { users } from '#lib/server/db/schema.ts';
import { listJumps, logbookTotals } from '#lib/server/domain/logbook.ts';
import { localDate } from '#lib/server/domain/time.ts';
import { requireUser } from '#lib/server/jumper/forms.ts';
import { dzNameMap, filtersFromUrl, jumpRow } from '#lib/server/jumper/logbook.ts';
import { ASSOCIATION_LABELS } from '#lib/domain/constants.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals, url);
	const filters = filtersFromUrl(url);
	const [u, jumps, totals] = await Promise.all([
		locals.db.select().from(users).where(eq(users.id, user.id)).limit(1),
		listJumps(locals.db, user.id, { ...filters, limit: 100_000, order: 'asc' }),
		logbookTotals(locals.db, user.id, localDate(Date.now(), 'UTC'))
	]);
	const me = u[0];
	const names = await dzNameMap(locals.db, jumps);
	return {
		owner: {
			name: me.name,
			licence: me.licence,
			association: me.association ? `${ASSOCIATION_LABELS[me.association]}${me.associationNumber ? ` #${me.associationNumber}` : ''}` : null
		},
		totals,
		filters,
		jumps: jumps.map((j) => jumpRow(j, names)),
		printedOn: localDate(Date.now(), 'UTC')
	};
};
