import { and, asc, eq, gte, inArray, isNull, isNotNull, like, lte, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { bookingSlots, dropzones, loads, payments, slots, tandemPassengers, users, type BookingSlot, type TandemPassenger } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { PaymentProvider, PaymentStatus, SlotExtra } from '../../domain/constants.ts';
import { TANDEM_EXTRAS } from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';
import { getPriceMap, quoteTandem } from './pricing.ts';
import { addDays, ageOn, isIsoDate, weekdayIndex } from './time.ts';
import { addSlot, removeSlot } from './loads.ts';

const CONF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 8-char unambiguous confirmation code, e.g. "K7M2-QX9P". */
export function generateConfirmationNumber(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const s = [...bytes].map((b) => CONF_ALPHABET[b % CONF_ALPHABET.length]).join('');
	return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export type PassengerInput = Partial<
	Omit<
		TandemPassenger,
		'id' | 'dropzoneId' | 'confirmationNumber' | 'currency' | 'totalMinor' | 'createdAt' | 'manifested' | 'paymentStatus' | 'amountPaidMinor'
	>
> & { name: string };

/** Minimum age (original: under 12 blocked) and guardian requirement (under 18). */
export function validatePassenger(p: Partial<PassengerInput>, jumpDate?: string | null): void {
	if (p.dob && jumpDate && isIsoDate(p.dob) && isIsoDate(jumpDate)) {
		const age = ageOn(p.dob, jumpDate);
		if (age < 12) throw new DomainError('invalid', 'This person is legally too young to jump.');
		if (age < 18 && (!p.guardianName || !p.guardianEmail || !p.guardianIdNumber)) {
			throw new DomainError('invalid', 'Guardian name, email and ID are required for passengers under 18');
		}
	}
	if (p.extras?.some((e) => !TANDEM_EXTRAS.includes(e))) throw new DomainError('invalid', 'Unknown tandem add-on');
}

export function paymentStatusFor(total: number, paid: number, deposit: number): PaymentStatus {
	if (total > 0 && paid >= total) return 'paid';
	if (paid > 0) return paid <= deposit ? 'deposit_paid' : 'partially_paid';
	return total === 0 ? 'paid' : 'unpaid';
}

/** Create a tandem passenger (manifest "Create Tandem Passenger", online booking or registration). */
export async function createPassenger(
	db: Database,
	dropzoneId: string,
	input: PassengerInput,
	opts: { now?: number; onlineBooking?: boolean } = {}
): Promise<TandemPassenger> {
	if (!input.name?.trim()) throw new DomainError('invalid', 'Passenger name is required');
	validatePassenger(input, input.jumpDate);
	const dz = assertFound((await db.select().from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0], 'Dropzone');
	const prices = await getPriceMap(db, dropzoneId);
	const extras = [...new Set(input.extras ?? [])] as SlotExtra[];
	const quote = quoteTandem(prices, extras);
	const deposit = input.depositMinor ?? 0;
	const rows = await db
		.insert(tandemPassengers)
		.values({
			...input,
			id: newId(),
			dropzoneId,
			name: input.name.trim(),
			confirmationNumber: generateConfirmationNumber(),
			extras,
			currency: dz.currency,
			totalMinor: quote.perJumper.totalMinor,
			depositMinor: deposit,
			amountPaidMinor: deposit,
			paymentStatus: paymentStatusFor(quote.perJumper.totalMinor, deposit, deposit),
			onlineBooking: opts.onlineBooking ?? input.onlineBooking ?? false,
			status: input.status ?? 'booked',
			createdAt: new Date(opts.now ?? Date.now())
		})
		.returning();
	return rows[0];
}

/** Update passenger/registration fields; re-prices when extras change. */
export async function updatePassenger(db: Database, passengerId: string, patch: Partial<PassengerInput>): Promise<TandemPassenger> {
	const p = assertFound(await getPassenger(db, passengerId), 'Tandem passenger');
	validatePassenger({ ...p, ...patch }, patch.jumpDate ?? p.jumpDate);
	const set: Partial<TandemPassenger> = { ...patch };
	if (patch.extras) {
		const prices = await getPriceMap(db, p.dropzoneId);
		set.extras = [...new Set(patch.extras)];
		set.totalMinor = quoteTandem(prices, set.extras).perJumper.totalMinor;
		set.paymentStatus = paymentStatusFor(set.totalMinor, p.amountPaidMinor, p.depositMinor);
	}
	return (await db.update(tandemPassengers).set(set).where(eq(tandemPassengers.id, passengerId)).returning())[0];
}

export async function getPassenger(db: Database, id: string): Promise<TandemPassenger | undefined> {
	return (await db.select().from(tandemPassengers).where(eq(tandemPassengers.id, id)).limit(1))[0];
}

export async function findByConfirmation(db: Database, code: string): Promise<TandemPassenger | undefined> {
	return (await db.select().from(tandemPassengers).where(eq(tandemPassengers.confirmationNumber, code.trim().toUpperCase())).limit(1))[0];
}

/** Tandem Manager list: tab 'ready' (not completed) or 'completed', optional search & date. */
export async function listPassengers(
	db: Database,
	dropzoneId: string,
	opts: { tab?: 'ready' | 'completed' | 'all'; date?: string; search?: string; limit?: number } = {}
) {
	const q = opts.search?.trim();
	return db
		.select()
		.from(tandemPassengers)
		.where(
			and(
				eq(tandemPassengers.dropzoneId, dropzoneId),
				opts.tab === 'completed'
					? eq(tandemPassengers.status, 'completed')
					: opts.tab === 'ready'
						? and(ne(tandemPassengers.status, 'completed'), ne(tandemPassengers.status, 'cancelled'))
						: undefined,
				opts.date ? eq(tandemPassengers.jumpDate, opts.date) : undefined,
				q
					? or(
							like(tandemPassengers.name, `%${q}%`),
							like(tandemPassengers.email, `%${q}%`),
							like(tandemPassengers.confirmationNumber, `%${q.toUpperCase()}%`)
						)
					: undefined
			)
		)
		.orderBy(asc(tandemPassengers.jumpDate), asc(tandemPassengers.bookingTime), asc(tandemPassengers.name))
		.limit(opts.limit ?? 200);
}

/** Record a manual tandem payment (cash/card/EFT at manifest) or provider payment. */
export async function recordTandemPayment(
	db: Database,
	input: { passengerId: string; amountMinor: number; provider: PaymentProvider; isDeposit?: boolean; providerRef?: string | null; by?: string | null; now?: number }
): Promise<TandemPassenger> {
	if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new DomainError('invalid', 'Enter a valid amount');
	const p = assertFound(await getPassenger(db, input.passengerId), 'Tandem passenger');
	const now = input.now ?? Date.now();
	const paid = p.amountPaidMinor + input.amountMinor;
	const deposit = input.isDeposit ? p.depositMinor + input.amountMinor : p.depositMinor;
	await db.insert(payments).values({
		id: newId(),
		dropzoneId: p.dropzoneId,
		tandemPassengerId: p.id,
		purpose: input.isDeposit ? 'tandem_deposit' : 'tandem',
		provider: input.provider,
		status: 'succeeded',
		amountMinor: input.amountMinor,
		currency: p.currency,
		providerRef: input.providerRef ?? null,
		createdBy: input.by ?? null,
		createdAt: new Date(now),
		completedAt: new Date(now)
	});
	return (
		await db
			.update(tandemPassengers)
			.set({
				amountPaidMinor: paid,
				depositMinor: deposit,
				paymentMethod: input.provider,
				paidAt: new Date(now),
				paymentStatus: paymentStatusFor(p.totalMinor, paid, deposit)
			})
			.where(eq(tandemPassengers.id, p.id))
			.returning()
	)[0];
}

/** Outstanding = total − amount paid (deposit counts as paid). */
export function tandemOutstanding(p: Pick<TandemPassenger, 'totalMinor' | 'amountPaidMinor'>): number {
	return Math.max(0, p.totalMinor - p.amountPaidMinor);
}

// ── booking slots (online booking availability) ──

/**
 * Add booking time slots. `repeat`: 'none' | 'daily' (30 days) | 'weekly' (5 weeks).
 * Existing (date,time) rows are skipped — returns { added, existing }.
 */
export async function addBookingSlots(
	db: Database,
	input: { dropzoneId: string; date: string; time: string; capacity: number; repeat?: 'none' | 'daily' | 'weekly' }
): Promise<{ added: number; existing: number }> {
	if (!/^\d{2}:\d{2}$/.test(input.time)) throw new DomainError('invalid', 'Please set a time for the booking slot');
	if (!isIsoDate(input.date)) throw new DomainError('invalid', 'Please choose a date');
	if (!Number.isInteger(input.capacity) || input.capacity < 1) throw new DomainError('invalid', 'Amount of slots must be at least 1');
	const dates =
		input.repeat === 'daily'
			? Array.from({ length: 30 }, (_, i) => addDays(input.date, i))
			: input.repeat === 'weekly'
				? Array.from({ length: 5 }, (_, i) => addDays(input.date, i * 7))
				: [input.date];
	let added = 0;
	for (const date of dates) {
		const r = await db
			.insert(bookingSlots)
			// weekday is filled for dated rows too so the unique index (NULLs are distinct) dedupes repeats
			.values({ id: newId(), dropzoneId: input.dropzoneId, date, weekday: weekdayIndex(date), time: input.time, capacity: input.capacity })
			.onConflictDoNothing()
			.returning({ id: bookingSlots.id });
		added += r.length;
	}
	return { added, existing: dates.length - added };
}

/** Delete a booking slot (scoped to the dropzone when given). Existing bookings keep their date/time. */
export async function deleteBookingSlot(db: Database, id: string, dropzoneId?: string): Promise<void> {
	await db.delete(bookingSlots).where(and(eq(bookingSlots.id, id), dropzoneId ? eq(bookingSlots.dropzoneId, dropzoneId) : undefined));
}

export type Availability = BookingSlot & { booked: number; remaining: number };

/** Time slots for a date (specific-date rows + weekly recurring rows) with remaining capacity. */
export async function availabilityForDate(db: Database, dropzoneId: string, date: string): Promise<Availability[]> {
	const wd = weekdayIndex(date);
	const list = await db
		.select()
		.from(bookingSlots)
		.where(
			and(
				eq(bookingSlots.dropzoneId, dropzoneId),
				or(eq(bookingSlots.date, date), and(isNull(bookingSlots.date), eq(bookingSlots.weekday, wd)))
			)
		)
		.orderBy(asc(bookingSlots.time));
	if (list.length === 0) return [];
	const counts = await db
		.select({ time: tandemPassengers.bookingTime, n: sql<number>`count(*)` })
		.from(tandemPassengers)
		.where(
			and(
				eq(tandemPassengers.dropzoneId, dropzoneId),
				eq(tandemPassengers.jumpDate, date),
				ne(tandemPassengers.status, 'cancelled'),
				inArray(tandemPassengers.bookingTime, list.map((s) => s.time))
			)
		)
		.groupBy(tandemPassengers.bookingTime);
	const byTime = new Map(counts.map((c) => [c.time, Number(c.n)]));
	// a specific-date row overrides a recurring row at the same time
	const byKey = new Map<string, BookingSlot>();
	for (const s of list) if (!byKey.has(s.time) || s.date) byKey.set(s.time, s);
	return [...byKey.values()].map((s) => {
		const booked = byTime.get(s.time) ?? 0;
		return { ...s, booked, remaining: Math.max(0, s.capacity - booked) };
	});
}

/** Dates in [from, to] that have at least one booking slot with space. */
export async function bookableDates(db: Database, dropzoneId: string, from: string, to: string): Promise<string[]> {
	const out: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) {
		if ((await availabilityForDate(db, dropzoneId, d)).some((a) => a.remaining > 0)) out.push(d);
	}
	return out;
}

/**
 * Public online booking for up to 5 jumpers on one date/time. Refuses when the time slot lacks
 * space. Deposit = tandem_deposit × jumpers (paid via provider later; `depositPaid` marks it paid).
 */
export async function createOnlineBooking(
	db: Database,
	input: {
		dropzoneId: string;
		date: string;
		time: string;
		/** name/email/phone required; any other passenger fields (extras, DOB, emergency…) are stored too. */
		jumpers: (Partial<PassengerInput> & { name: string; email: string; phone?: string | null })[];
		depositPaid?: boolean;
		now?: number;
	}
): Promise<{ passengers: TandemPassenger[]; depositMinor: number }> {
	if (input.jumpers.length < 1 || input.jumpers.length > 5) throw new DomainError('invalid', 'Book between 1 and 5 jumpers');
	const slot = (await availabilityForDate(db, input.dropzoneId, input.date)).find((a) => a.time === input.time);
	if (!slot) throw new DomainError('not_found', 'No jumps available at that time');
	if (slot.remaining < input.jumpers.length) {
		throw new DomainError('booking_full', `Only ${slot.remaining} place/s left at ${input.time}`, { remaining: slot.remaining });
	}
	const prices = await getPriceMap(db, input.dropzoneId);
	const depositEach = prices.tandem_deposit ?? 0;
	const passengers: TandemPassenger[] = [];
	for (const j of input.jumpers) {
		passengers.push(
			await createPassenger(
				db,
				input.dropzoneId,
				{
					...j,
					name: j.name,
					email: j.email,
					phone: j.phone ?? null,
					jumpDate: input.date,
					bookingTime: input.time,
					bookingSlotId: slot.id,
					depositMinor: input.depositPaid ? depositEach : 0
				},
				{ now: input.now, onlineBooking: true }
			)
		);
	}
	return { passengers, depositMinor: depositEach * input.jumpers.length };
}

// ── booking-slot admin + range availability ──

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Add a recurring weekly slot (date = null). Returns false when that weekday/time already exists. */
export async function addWeeklySlot(
	db: Database,
	input: { dropzoneId: string; weekday: number; time: string; capacity: number }
): Promise<boolean> {
	if (!TIME_RE.test(input.time)) throw new DomainError('invalid', 'Please set a time for the booking slot');
	if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new DomainError('invalid', 'Choose a weekday');
	if (!Number.isInteger(input.capacity) || input.capacity < 1) throw new DomainError('invalid', 'Amount of slots must be at least 1');
	// NULL dates are distinct in the unique index, so dedupe by hand
	const dup = await db
		.select({ id: bookingSlots.id })
		.from(bookingSlots)
		.where(and(eq(bookingSlots.dropzoneId, input.dropzoneId), isNull(bookingSlots.date), eq(bookingSlots.weekday, input.weekday), eq(bookingSlots.time, input.time)))
		.limit(1);
	if (dup.length) return false;
	await db.insert(bookingSlots).values({ id: newId(), dropzoneId: input.dropzoneId, date: null, weekday: input.weekday, time: input.time, capacity: input.capacity });
	return true;
}

export async function updateBookingSlotCapacity(db: Database, dropzoneId: string, id: string, capacity: number): Promise<void> {
	if (!Number.isInteger(capacity) || capacity < 1) throw new DomainError('invalid', 'Amount of slots must be at least 1');
	await db.update(bookingSlots).set({ capacity }).where(and(eq(bookingSlots.id, id), eq(bookingSlots.dropzoneId, dropzoneId)));
}

/** Dated slots from `from` onwards (by date/time) and recurring weekly slots. */
export async function listBookingSlots(db: Database, dropzoneId: string, from: string, to?: string) {
	const dated = await db
		.select()
		.from(bookingSlots)
		.where(and(eq(bookingSlots.dropzoneId, dropzoneId), isNotNull(bookingSlots.date), gte(bookingSlots.date, from), to ? lte(bookingSlots.date, to) : undefined))
		.orderBy(asc(bookingSlots.date), asc(bookingSlots.time));
	const recurring = await db
		.select()
		.from(bookingSlots)
		.where(and(eq(bookingSlots.dropzoneId, dropzoneId), isNull(bookingSlots.date)))
		.orderBy(asc(bookingSlots.weekday), asc(bookingSlots.time));
	return { dated, recurring };
}

/**
 * Availability for every date in [from, to] in two queries (the per-date `availabilityForDate`
 * would be 2 queries per day). Same rules: a dated row overrides a recurring row at that time.
 */
export async function availabilityRange(db: Database, dropzoneId: string, from: string, to: string): Promise<Record<string, Availability[]>> {
	const all = await db
		.select()
		.from(bookingSlots)
		.where(and(eq(bookingSlots.dropzoneId, dropzoneId), or(isNull(bookingSlots.date), and(gte(bookingSlots.date, from), lte(bookingSlots.date, to)))));
	const counts = await db
		.select({ date: tandemPassengers.jumpDate, time: tandemPassengers.bookingTime, n: sql<number>`count(*)` })
		.from(tandemPassengers)
		.where(
			and(
				eq(tandemPassengers.dropzoneId, dropzoneId),
				gte(tandemPassengers.jumpDate, from),
				lte(tandemPassengers.jumpDate, to),
				ne(tandemPassengers.status, 'cancelled')
			)
		)
		.groupBy(tandemPassengers.jumpDate, tandemPassengers.bookingTime);
	const booked = new Map(counts.map((c) => [`${c.date} ${c.time}`, Number(c.n)]));
	const recurring = all.filter((s) => !s.date);
	const out: Record<string, Availability[]> = {};
	for (let d = from; d <= to; d = addDays(d, 1)) {
		const wd = weekdayIndex(d);
		const byTime = new Map<string, BookingSlot>();
		for (const s of recurring) if (s.weekday === wd) byTime.set(s.time, s);
		for (const s of all) if (s.date === d) byTime.set(s.time, s);
		if (!byTime.size) continue;
		out[d] = [...byTime.values()]
			.sort((a, b) => a.time.localeCompare(b.time))
			.map((s) => {
				const n = booked.get(`${d} ${s.time}`) ?? 0;
				return { ...s, booked: n, remaining: Math.max(0, s.capacity - n) };
			});
	}
	return out;
}

/** Bookings per day in [from, to] (calendar strip), excluding cancelled. */
export async function countByDay(db: Database, dropzoneId: string, from: string, to: string): Promise<Record<string, number>> {
	const rows = await db
		.select({ date: tandemPassengers.jumpDate, n: sql<number>`count(*)` })
		.from(tandemPassengers)
		.where(
			and(
				eq(tandemPassengers.dropzoneId, dropzoneId),
				gte(tandemPassengers.jumpDate, from),
				lte(tandemPassengers.jumpDate, to),
				ne(tandemPassengers.status, 'cancelled')
			)
		)
		.groupBy(tandemPassengers.jumpDate);
	return Object.fromEntries(rows.map((r) => [r.date, Number(r.n)]));
}

// ── status changes (Tandem Manager row actions) ──

/** Cancel a booking (frees its booking-slot place). Must be off any load first. */
export async function cancelPassenger(db: Database, passengerId: string): Promise<TandemPassenger> {
	const p = assertFound(await getPassenger(db, passengerId), 'Tandem passenger');
	if (p.manifested) throw new DomainError('conflict', `Remove ${p.name} from the load before cancelling`);
	if (p.status === 'completed') throw new DomainError('invalid_transition', 'This tandem has already jumped');
	return (await db.update(tandemPassengers).set({ status: 'cancelled' }).where(eq(tandemPassengers.id, p.id)).returning())[0];
}

/** "Reset Tandem": back to booked/registered (signed) — e.g. undo a cancel or a manual completion. */
export async function resetPassenger(db: Database, passengerId: string): Promise<TandemPassenger> {
	const p = assertFound(await getPassenger(db, passengerId), 'Tandem passenger');
	if (p.manifested) throw new DomainError('conflict', `Remove ${p.name} from the load first`);
	const status = p.indemnitySignedAt ? 'registered' : 'booked';
	return (await db.update(tandemPassengers).set({ status }).where(eq(tandemPassengers.id, p.id)).returning())[0];
}

/** "Mark as Completed" (jumped) without going through load completion. */
export async function completePassenger(db: Database, passengerId: string): Promise<TandemPassenger> {
	const p = assertFound(await getPassenger(db, passengerId), 'Tandem passenger');
	if (p.status === 'cancelled') throw new DomainError('invalid_transition', 'Reset the cancelled booking first');
	return (await db.update(tandemPassengers).set({ status: 'completed' }).where(eq(tandemPassengers.id, p.id)).returning())[0];
}

// ── tandem group on a load (TI / videographer) ──

export type TandemGroupSlot = {
	slotId: string;
	loadId: string;
	loadNumber: number;
	day: string;
	loadStatus: string;
	staffRole: string | null;
	userId: string | null;
	name: string;
};

/** The passenger's slots (passenger + TI + video) with their load. */
export async function tandemGroup(db: Database, passengerId: string): Promise<TandemGroupSlot[]> {
	const rows = await db
		.select({
			slotId: slots.id,
			loadId: slots.loadId,
			loadNumber: loads.loadNumber,
			day: loads.day,
			loadStatus: loads.status,
			staffRole: slots.staffRole,
			userId: slots.userId,
			displayName: slots.displayName,
			userName: users.name
		})
		.from(slots)
		.innerJoin(loads, eq(loads.id, slots.loadId))
		.leftJoin(users, eq(users.id, slots.userId))
		.where(eq(slots.tandemPassengerId, passengerId))
		.orderBy(asc(slots.position));
	return rows.map((r) => ({ ...r, name: r.userName ?? r.displayName ?? '—' }));
}

/**
 * Change (or add/remove with userId null) the TI or videographer of a manifested tandem.
 * Implemented as remove + add on the same load and group so pricing/staff pay stay consistent.
 */
export async function changeTandemStaff(
	db: Database,
	input: { passengerId: string; role: 'tandem_instructor' | 'videographer'; userId: string | null; by?: string | null; now?: number }
): Promise<void> {
	const p = assertFound(await getPassenger(db, input.passengerId), 'Tandem passenger');
	const group = await tandemGroup(db, p.id);
	const pax = group.find((g) => !g.staffRole);
	if (!pax) throw new DomainError('conflict', `${p.name} is not on a load yet`);
	if (input.role === 'tandem_instructor' && !input.userId) throw new DomainError('invalid', 'A tandem needs an instructor');
	const current = group.find((g) => g.staffRole === input.role);
	if (current?.userId === input.userId) return;
	const groupId = (await db.select({ groupId: slots.groupId }).from(slots).where(eq(slots.id, pax.slotId)).limit(1))[0]?.groupId ?? null;
	const add = (userId: string) =>
		addSlot(
			db,
			pax.loadId,
			{
				userId,
				jumpType: 'tandem',
				staffRole: input.role,
				groupId,
				tandemPassengerId: p.id,
				...(input.role === 'tandem_instructor' ? { groupExtras: p.extras } : {})
			},
			{ by: input.by, now: input.now }
		);
	// remove first so a full load can still swap staff; put the old one back if the add fails
	if (current) await removeSlot(db, current.slotId, { by: input.by, now: input.now });
	if (!input.userId) return;
	try {
		await add(input.userId);
	} catch (e) {
		if (current?.userId) await add(current.userId).catch(() => {});
		throw e;
	}
}
