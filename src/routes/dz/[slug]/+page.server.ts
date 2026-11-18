import { tandemExtrasOffer } from '#lib/server/tandems/detail.ts';
import { BOOKING_HORIZON_DAYS, bookableDays } from '#lib/server/tandems/public.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { dz } = await parent();
	// Same horizon as the booking page, so "Book a tandem" shows exactly when that page has a day to pick.
	const [{ today, days }, offer] = await Promise.all([bookableDays(locals.db, dz, BOOKING_HORIZON_DAYS), tandemExtrasOffer(locals.db, dz.id)]);
	const upcoming = Object.entries(days)
		.map(([date, slots]) => ({ date, remaining: slots.reduce((n, s) => n + s.remaining, 0) }))
		.slice(0, 6);
	return { today, upcoming, offer };
};
