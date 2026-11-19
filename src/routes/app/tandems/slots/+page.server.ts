import { addBookingSlots, addWeeklySlot, availabilityRange, deleteBookingSlot, listBookingSlots, updateBookingSlotCapacity } from '#lib/server/domain/tandems.ts';
import { addDays, localDate } from '#lib/server/domain/time.ts';
import { tandemExtrasOffer } from '#lib/server/tandems/detail.ts';
import { fmtDay } from '#lib/components/tandems/model.ts';
import { BOOKING_HORIZON_DAYS, bookingOpensOn } from '#lib/server/tandems/public.ts';
import { failFrom, optNum, staffContext, str } from '#lib/server/tandems/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { dz } = await staffContext(event, 'tandems.manage');
	const db = event.locals.db;
	const today = localDate(Date.now(), dz.timezone);
	// Every upcoming dated slot (a slot added months ahead must still be listed, or staff can't
	// see or remove it); booked counts only up to the last one.
	const [{ dated, recurring }, offer] = await Promise.all([listBookingSlots(db, dz.id, today), tandemExtrasOffer(db, dz.id)]);
	const last = dated.at(-1)?.date ?? today;
	const avail = await availabilityRange(db, dz.id, today, last);
	const bookedAt = (date: string, time: string) => avail[date]?.find((a) => a.time === time)?.booked ?? 0;
	const days = new Map<string, { id: string; time: string; capacity: number; booked: number }[]>();
	for (const s of dated) {
		const list = days.get(s.date!) ?? [];
		list.push({ id: s.id, time: s.time, capacity: s.capacity, booked: bookedAt(s.date!, s.time) });
		days.set(s.date!, list);
	}
	const bookableUntil = addDays(today, BOOKING_HORIZON_DAYS);
	return {
		dz: { name: dz.name, slug: dz.slug },
		today,
		horizon: BOOKING_HORIZON_DAYS,
		/** No tandem price yet: the booking page can't quote one (customers pay what's set on the day). */
		priced: offer.baseMinor > 0,
		/** Days after `bookableUntil` aren't on the booking page yet: `opensOn` says when they will be. */
		dated: [...days.entries()].map(([date, slots]) => ({ date, slots, opensOn: date > bookableUntil ? bookingOpensOn(date) : null })),
		recurring: recurring.map((s) => ({ id: s.id, weekday: s.weekday ?? 0, time: s.time, capacity: s.capacity }))
	};
};

export const actions: Actions = {
	add: async (event) => {
		const { dz } = await staffContext(event, 'tandems.manage');
		const f = await event.request.formData();
		try {
			const repeat = str(f, 'repeat');
			const date = str(f, 'date');
			const r = await addBookingSlots(event.locals.db, {
				dropzoneId: dz.id,
				date,
				time: str(f, 'time'),
				capacity: optNum(f, 'capacity') ?? 0,
				repeat: repeat === 'daily' || repeat === 'weekly' ? repeat : 'none'
			});
			const added = r.existing ? `${r.added} more slots added, ${r.existing} already existed.` : `${r.added} slot${r.added === 1 ? '' : 's'} added.`;
			// Customers see slots up to BOOKING_HORIZON_DAYS ahead: say when a far-off one opens.
			const today = localDate(Date.now(), dz.timezone);
			const opens = bookingOpensOn(date);
			const later =
				opens > today ? ` ${r.added > 1 ? 'The first opens' : 'It opens'} for booking on ${fmtDay(opens, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} (customers book up to ${BOOKING_HORIZON_DAYS} days ahead).` : '';
			return { ok: true, message: `${added}${later}` };
		} catch (e) {
			return failFrom(e);
		}
	},
	weekly: async (event) => {
		const { dz } = await staffContext(event, 'tandems.manage');
		const f = await event.request.formData();
		try {
			const added = await addWeeklySlot(event.locals.db, {
				dropzoneId: dz.id,
				weekday: optNum(f, 'weekday') ?? -1,
				time: str(f, 'time'),
				capacity: optNum(f, 'capacity') ?? 0
			});
			return { ok: true, message: added ? 'Weekly slot added' : 'That weekly slot already exists' };
		} catch (e) {
			return failFrom(e);
		}
	},
	capacity: async (event) => {
		const { dz } = await staffContext(event, 'tandems.manage');
		const f = await event.request.formData();
		try {
			await updateBookingSlotCapacity(event.locals.db, dz.id, str(f, 'id'), optNum(f, 'capacity') ?? 0);
			return { ok: true, message: 'Capacity updated' };
		} catch (e) {
			return failFrom(e);
		}
	},
	delete: async (event) => {
		const { dz } = await staffContext(event, 'tandems.manage');
		const f = await event.request.formData();
		await deleteBookingSlot(event.locals.db, str(f, 'id'), dz.id);
		return { ok: true, message: 'Slot removed' };
	}
};
