import { redirect } from '@sveltejs/kit';
import { createPassenger, countByDay, listPassengers } from '#lib/server/domain/tandems.ts';
import { addDays, isIsoDate, localDate, weekdayIndex } from '#lib/server/domain/time.ts';
import { DomainError } from '#lib/server/domain/errors.ts';
import { passengersWithPendingCheckout } from '#lib/server/domain/online-payments.ts';
import { failFrom, moneyToMinor, staffContext, str } from '#lib/server/tandems/http.ts';
import { parsePassengerForm } from '#lib/server/tandems/forms.ts';
import { passengerDetail, tandemExtrasOffer, tandemLimits } from '#lib/server/tandems/detail.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { dz } = await staffContext(event, 'tandems.manage');
	const db = event.locals.db;
	const today = localDate(Date.now(), dz.timezone);
	const qDay = event.url.searchParams.get('day');
	const day = isIsoDate(qDay) ? qDay : today;
	const q = event.url.searchParams.get('q')?.trim() ?? '';
	const weekStart = addDays(day, -weekdayIndex(day));
	const stripFrom = weekStart;
	const stripTo = addDays(weekStart, 13);

	const [rows, counts, offer] = await Promise.all([
		q ? listPassengers(db, dz.id, { tab: 'all', search: q, limit: 100 }) : listPassengers(db, dz.id, { tab: 'all', date: day }),
		countByDay(db, dz.id, stripFrom, stripTo),
		tandemExtrasOffer(db, dz.id)
	]);

	// Rows whose customer has an online checkout open (staff shouldn't also take cash).
	const checkout = await passengersWithPendingCheckout(
		db,
		dz.id,
		rows.filter((p) => p.status !== 'cancelled' && p.paymentStatus !== 'paid').map((p) => p.id)
	);

	const pid = event.url.searchParams.get('p');
	let detail = null;
	if (pid) {
		try {
			detail = await passengerDetail(db, dz, pid);
		} catch {
			detail = null;
		}
	}

	return {
		dz: { id: dz.id, name: dz.name, slug: dz.slug, currency: dz.currency, emailNotices: dz.emailNotices },
		today,
		day,
		q,
		strip: Array.from({ length: 14 }, (_, i) => {
			const d = addDays(stripFrom, i);
			return { date: d, count: counts[d] ?? 0 };
		}),
		passengers: rows.map((p) => ({ ...p, checkoutOpen: checkout.has(p.id) })),
		offer,
		limits: tandemLimits(dz),
		detail
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { dz } = await staffContext(event, 'tandems.manage');
		const f = await event.request.formData();
		let id: string;
		try {
			const input = parsePassengerForm(f);
			if (!input.name) throw new DomainError('invalid', 'Passenger name is required');
			const deposit = moneyToMinor(str(f, 'deposit')) ?? 0;
			if (!Number.isFinite(deposit) || deposit < 0) throw new DomainError('invalid', 'Enter the deposit as an amount, like 450.00');
			const p = await createPassenger(event.locals.db, dz.id, { ...input, name: input.name, depositMinor: deposit });
			id = p.id;
		} catch (e) {
			return failFrom(e);
		}
		const day = str(f, 'jumpDate') || event.url.searchParams.get('day') || '';
		redirect(303, `/app/tandems?${new URLSearchParams({ ...(day ? { day } : {}), p: id, created: '1' })}`);
	}
};
