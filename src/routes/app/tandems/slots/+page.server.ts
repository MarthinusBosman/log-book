import { addBookingSlots, addWeeklySlot, availabilityRange, deleteBookingSlot, listBookingSlots, updateBookingSlotCapacity } from '#lib/server/domain/tandems.ts';
import { addDays, localDate } from '#lib/server/domain/time.ts';
import { failFrom, optNum, staffContext, str } from '#lib/server/tandems/http.ts';
import type { Actions, PageServerLoad } from './$types';

const HORIZON_DAYS = 45;

export const load: PageServerLoad = async (event) => {
	const { dz } = await staffContext(event, 'tandems.manage');
	const db = event.locals.db;
	const today = localDate(Date.now(), dz.timezone);
	const to = addDays(today, HORIZON_DAYS);
	const [{ dated, recurring }, avail] = await Promise.all([listBookingSlots(db, dz.id, today, to), availabilityRange(db, dz.id, today, to)]);
	const bookedAt = (date: string, time: string) => avail[date]?.find((a) => a.time === time)?.booked ?? 0;
	const days = new Map<string, { id: string; time: string; capacity: number; booked: number }[]>();
	for (const s of dated) {
		const list = days.get(s.date!) ?? [];
		list.push({ id: s.id, time: s.time, capacity: s.capacity, booked: bookedAt(s.date!, s.time) });
		days.set(s.date!, list);
	}
	return {
		dz: { name: dz.name, slug: dz.slug },
		today,
		horizon: HORIZON_DAYS,
		dated: [...days.entries()].map(([date, slots]) => ({ date, slots })),
		recurring: recurring.map((s) => ({ id: s.id, weekday: s.weekday ?? 0, time: s.time, capacity: s.capacity }))
	};
};

export const actions: Actions = {
	add: async (event) => {
		const { dz } = await staffContext(event, 'tandems.manage');
		const f = await event.request.formData();
		try {
			const repeat = str(f, 'repeat');
			const r = await addBookingSlots(event.locals.db, {
				dropzoneId: dz.id,
				date: str(f, 'date'),
				time: str(f, 'time'),
				capacity: optNum(f, 'capacity') ?? 0,
				repeat: repeat === 'daily' || repeat === 'weekly' ? repeat : 'none'
			});
			return { ok: true, message: r.existing ? `${r.added} more slots added, ${r.existing} already existed.` : `${r.added} slot${r.added === 1 ? '' : 's'} added` };
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
