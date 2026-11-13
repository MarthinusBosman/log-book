import { countJumps, listJumps, logbookBreakdown, logbookTotals } from '#lib/server/domain/logbook.ts';
import { requireUser, todayAt } from '#lib/server/jumper/forms.ts';
import { dzNameMap, filtersFromUrl, jumpRow } from '#lib/server/jumper/logbook.ts';
import { JUMP_TYPE_LABELS, type JumpType } from '#lib/domain/constants.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const user = requireUser(locals, url);
	const { current } = await parent();
	const today = await todayAt(locals.db, current?.dropzone.id);
	const filters = filtersFromUrl(url);
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const [totals, breakdown, jumps, matched] = await Promise.all([
		logbookTotals(locals.db, user.id, today),
		logbookBreakdown(locals.db, user.id),
		listJumps(locals.db, user.id, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
		countJumps(locals.db, user.id, filters)
	]);
	// totalJumps = max(highest logged, declared count), the same rule as nextJumpNumber()
	const next = totals.totalJumps + 1;
	const names = await dzNameMap(locals.db, jumps);
	const filtered = !!(filters.q || filters.jumpType || filters.dropzoneId || filters.location || filters.year);
	return {
		totals,
		breakdown: {
			...breakdown,
			byType: breakdown.byType.map((r) => ({ ...r, label: r.key ? (JUMP_TYPE_LABELS[r.key as JumpType] ?? r.key) : 'Not set' }))
		},
		jumps: jumps.map((j) => jumpRow(j, names)),
		matched,
		filtered,
		filters: { q: filters.q ?? '', type: filters.jumpType ?? '', place: url.searchParams.get('place') ?? '', year: filters.year ?? '' },
		page,
		pages: Math.max(1, Math.ceil(matched.count / PAGE_SIZE)),
		next
	};
};
