import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { isDomainError } from './errors.ts';
import { checkIn, checkOut, checkOutAll, currentCheckin, listCheckedIn, rentingUserIds } from './checkins.ts';
import { listNotifications, markRead, notify, unreadCount } from './notifications.ts';
import { addTeamMember, checkinRentalExtras, createTeam, listManifestTeams, manifestTeam, manifestTeamFor, addBuddy } from './teams.ts';
import { addSlot, completeLoad, createLoads, getLoad } from './loads.ts';
import {
	addBookingSlots,
	applyCurrentTandemPrice,
	availabilityForDate,
	createOnlineBooking,
	createPassenger,
	recordTandemPayment,
	tandemOutstanding
} from './tandems.ts';
import { setPrices } from './pricing.ts';
import { addSection, addStarterSections, listSections, needsSportIndemnity, setIndemnityActive, signIndemnity } from './indemnity.ts';
import { getDropzone } from './dropzone-admin.ts';
import { WAIVER_STARTER } from '../../domain/waiver-starter.ts';
import { jumpReport } from './reports.ts';
import { decodeDataUrl, readFileBlob, saveFile } from './files.ts';
import { MemoryStorage } from '../storage/memory.ts';
import { DAY, NOW, TEST_PRICES as P, freshDb, makeDropzone, makeMember, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('check-in', () => {
	test('idempotent, one open check-in per user, staff verify + notify, check everyone out', async () => {
		const { dz, owner } = await makeDropzone(db);
		const { dz: other } = await makeDropzone(db);
		const u = await makeUser(db, { loadingWeightKg: 92 });
		const c1 = await checkIn(db, { dropzoneId: dz.id, userId: u.id, now: NOW });
		const c2 = await checkIn(db, { dropzoneId: dz.id, userId: u.id, now: NOW });
		expect(c2.id).toBe(c1.id);
		expect(c1).toMatchObject({ weightKg: 92, verified: false, day: DAY });
		const verified = await checkIn(db, { dropzoneId: dz.id, userId: u.id, by: owner.id });
		expect(verified.verified).toBe(true);
		await checkIn(db, { dropzoneId: other.id, userId: u.id });
		expect((await currentCheckin(db, u.id))!.dropzone.id).toBe(other.id);
		expect(await listCheckedIn(db, dz.id)).toHaveLength(0);
		await checkIn(db, { dropzoneId: dz.id, userId: u.id, by: owner.id });
		const v = await makeUser(db);
		await checkIn(db, { dropzoneId: dz.id, userId: v.id });
		expect(await listCheckedIn(db, dz.id)).toHaveLength(2);
		expect(await checkOut(db, { dropzoneId: dz.id, userId: v.id, by: owner.id })).toBe(true);
		expect(await checkOutAll(db, dz.id, owner.id)).toBe(1);
		expect(await listCheckedIn(db, dz.id)).toHaveLength(0);
		expect((await listNotifications(db, v.id)).map((n) => n.type)).toEqual(['checked_out']);
	});
});

describe('notifications', () => {
	test('create, render, count, mark read', async () => {
		const u = await makeUser(db);
		await notify(db, { userIds: [u.id, u.id, null], type: 'payment_notice', payload: { dropzoneName: 'Skydive Demo DZ' }, now: NOW });
		await notify(db, { userIds: [u.id], type: 'friend_add', payload: { actorName: 'Ann' }, now: NOW + 1 });
		const list = await listNotifications(db, u.id);
		expect(list).toHaveLength(2);
		expect(list[0].title).toBe('New jump buddy');
		expect(list[1].body).toContain('outstanding payments at Skydive Demo DZ');
		expect(await unreadCount(db, u.id)).toBe(2);
		await markRead(db, u.id, [list[0].id]);
		expect(await unreadCount(db, u.id)).toBe(1);
		await markRead(db, u.id);
		expect(await unreadCount(db, u.id)).toBe(0);
	});

	test('large fan-out is chunked under the D1 parameter limit', async () => {
		const ids = [];
		for (let i = 0; i < 25; i++) ids.push((await makeUser(db)).id);
		expect(await notify(db, { userIds: ids, type: 'general', payload: { title: 'Hi' } })).toBe(25);
	});
});

describe('teams', () => {
	test('manifest a whole team as one group with coach; members notified on add', async () => {
		const { dz, owner } = await makeDropzone(db);
		const coach = await makeMember(db, dz.id, ['coach']);
		const [a, b, c] = [await makeUser(db), await makeUser(db), await makeUser(db)];
		const team = await createTeam(db, { dropzoneId: dz.id }, { name: 'Sky Sharks', discipline: '4 way FS', colour: '#ff0', coachUserId: coach.id, memberIds: [a.id, b.id] }, { by: owner.id });
		await addTeamMember(db, team.id, c.id, { by: owner.id });
		expect((await listNotifications(db, c.id)).map((n) => n.type)).toEqual(['team_add']);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 4 });
		const created = await manifestTeam(db, { teamId: team.id, loadId: load.id, jumpType: 'belly' }, { by: owner.id });
		expect(created).toHaveLength(4);
		expect(new Set(created.map((s) => s.groupId)).size).toBe(1);
		expect(created.find((s) => s.userId === coach.id)).toMatchObject({ staffRole: 'coach', staffPayMinor: P.pay_coach!, totalMinor: 0 });
		expect(created.every((s) => s.teamName === 'Sky Sharks')).toBe(true);
		const [load2] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 3 });
		expect(isDomainError(await manifestTeam(db, { teamId: team.id, loadId: load2.id, jumpType: 'belly' }).catch((e) => e), 'load_full')).toBe(true);
		const res = await completeLoad(db, load.id);
		expect(res.logbookEntries).toBe(4);
	});

	test('team manifest: members who checked in with rental gear get gear rental, the coach and others do not', async () => {
		const { dz, owner } = await makeDropzone(db);
		const coach = await makeMember(db, dz.id, ['coach']);
		const [renter, ownRig, elsewhere] = [await makeUser(db), await makeUser(db), await makeUser(db)];
		const { dz: other } = await makeDropzone(db);
		const team = await createTeam(db, { dropzoneId: dz.id }, { name: 'Rental Sharks', coachUserId: coach.id, memberIds: [renter.id, ownRig.id, elsewhere.id] }, { by: owner.id, now: NOW });
		await checkIn(db, { dropzoneId: dz.id, userId: renter.id, gearRental: true, now: NOW });
		await checkIn(db, { dropzoneId: dz.id, userId: ownRig.id, now: NOW });
		await checkIn(db, { dropzoneId: other.id, userId: elsewhere.id, gearRental: true, now: NOW });
		await checkIn(db, { dropzoneId: dz.id, userId: coach.id, gearRental: true, now: NOW });
		const renters = await rentingUserIds(db, dz.id);
		expect([...renters].sort()).toEqual([renter.id, coach.id].sort());
		const extrasOf = await checkinRentalExtras(db, dz.id, [], 'belly');
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 6 });
		const created = await manifestTeam(db, { teamId: team.id, loadId: load.id, jumpType: 'belly', extras: [], extrasOf }, { by: owner.id, now: NOW });
		const of = (id: string) => created.find((s) => s.userId === id)!;
		expect(of(renter.id).extras).toEqual(['gear_rental']);
		expect(of(renter.id).totalMinor).toBe(P.sport_slot! + P.gear_rental!);
		expect(of(ownRig.id).extras).toEqual([]);
		expect(of(elsewhere.id).extras).toEqual([]);
		expect(of(coach.id)).toMatchObject({ staffRole: 'coach', extras: [] });
	});

	test('manifest teams: DZ teams plus jumpers’ own teams with someone checked in here (only those members jump)', async () => {
		const { dz, owner } = await makeDropzone(db);
		const { dz: other } = await makeDropzone(db);
		const [a, b, c, d] = [await makeUser(db), await makeUser(db), await makeUser(db), await makeUser(db)];
		const dzTeam = await createTeam(db, { dropzoneId: dz.id }, { name: 'Sharks', memberIds: [c.id] }, { now: NOW });
		const otherDzTeam = await createTeam(db, { dropzoneId: other.id }, { name: 'Elsewhere', memberIds: [a.id] }, { now: NOW });
		const zoo = await createTeam(db, { userId: a.id }, { name: 'Zoo Crew', discipline: 'Freefly', memberIds: [a.id, b.id, c.id] }, { now: NOW });
		const away = await createTeam(db, { userId: d.id }, { name: 'Away Team', memberIds: [d.id] }, { now: NOW });
		// nobody checked in: only the dropzone's own teams
		expect((await listManifestTeams(db, dz.id)).map((t) => t.name)).toEqual(['Sharks']);
		await checkIn(db, { dropzoneId: dz.id, userId: a.id, now: NOW });
		await checkIn(db, { dropzoneId: dz.id, userId: c.id, now: NOW });
		await checkIn(db, { dropzoneId: other.id, userId: d.id, now: NOW });
		const list = await listManifestTeams(db, dz.id);
		expect(list.map((t) => [t.name, t.personal, t.memberIds.length, t.memberCount])).toEqual([
			['Sharks', false, 1, 1],
			['Zoo Crew', true, 2, 3]
		]);
		expect((await manifestTeamFor(db, dz.id, zoo.id)).memberIds.sort()).toEqual([a.id, c.id].sort());
		expect((await manifestTeamFor(db, dz.id, dzTeam.id)).memberIds).toEqual([c.id]);
		// another dropzone's team, or a jumper's team with nobody here, can't be manifested
		for (const t of [otherDzTeam, away]) expect(isDomainError(await manifestTeamFor(db, dz.id, t.id).catch((e) => e), 'not_found')).toBe(true);
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 6 });
		const created = await manifestTeam(db, { teamId: zoo.id, loadId: load.id, jumpType: 'belly', memberIds: (await manifestTeamFor(db, dz.id, zoo.id)).memberIds }, { by: owner.id, now: NOW });
		expect(created.map((s) => s.userId).sort()).toEqual([a.id, c.id].sort());
		expect(created.every((s) => s.teamName === 'Zoo Crew')).toBe(true);
		// checking out drops them again
		await checkOut(db, { dropzoneId: dz.id, userId: a.id, now: NOW + 1000 });
		expect((await manifestTeamFor(db, dz.id, zoo.id)).memberIds).toEqual([c.id]);
	});

	test('buddies', async () => {
		const [a, b] = [await makeUser(db), await makeUser(db, { name: 'Bea' })];
		expect(await addBuddy(db, a.id, b.id)).toBe(true);
		expect(await addBuddy(db, a.id, b.id)).toBe(false);
		await expect(addBuddy(db, a.id, a.id)).rejects.toThrow();
		expect((await listNotifications(db, b.id))[0].type).toBe('friend_add');
	});
});

describe('tandems & online booking', () => {
	test('booking slots: times that have already passed are skipped, never added', async () => {
		const { dz } = await makeDropzone(db);
		const notBefore = { date: DAY, time: '10:30' };
		const err = await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 2, notBefore }).catch((e) => e);
		expect(isDomainError(err) && err.message).toBe('09:00 today has already passed. Pick a later time or another day.');
		const old = await addBookingSlots(db, { dropzoneId: dz.id, date: '2026-11-13', time: '12:00', capacity: 2, notBefore }).catch((e) => e);
		expect(isDomainError(old) && old.message).toBe('That date has already passed. Pick today or a later date.');
		// A repeat starting today drops only today's passed time; a later time today stays.
		expect(await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 2, repeat: 'weekly', notBefore })).toEqual({ added: 4, existing: 0, past: 1, first: '2026-11-21' });
		expect(await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '11:00', capacity: 2, notBefore })).toEqual({ added: 1, existing: 0, past: 0, first: DAY });
		expect((await availabilityForDate(db, dz.id, DAY)).map((s) => s.time)).toEqual(['11:00']);
	});

	test('booking slots: repeats dedupe, capacity enforced, deposit per jumper', async () => {
		const { dz } = await makeDropzone(db);
		expect(await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 3, repeat: 'weekly' })).toEqual({ added: 5, existing: 0, past: 0, first: DAY });
		expect(await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 3, repeat: 'daily' })).toEqual({ added: 25, existing: 5, past: 0, first: DAY });
		const r = await createOnlineBooking(db, {
			dropzoneId: dz.id,
			date: DAY,
			time: '09:00',
			jumpers: [
				{ name: 'A', email: 'a@x.co' },
				// A fellow jumper booked without their own contact details (the lead's email lists them).
				{ name: 'B' }
			],
			depositPaid: true
		});
		expect(r.passengers[1]).toMatchObject({ name: 'B', email: null, phone: null, onlineBooking: true });
		expect(r.depositMinor).toBe(2 * P.tandem_deposit!);
		expect(r.passengers[0]).toMatchObject({ onlineBooking: true, depositMinor: P.tandem_deposit, paymentStatus: 'deposit_paid', bookingTime: '09:00' });
		expect(r.passengers[0].confirmationNumber).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
		expect((await availabilityForDate(db, dz.id, DAY))[0].remaining).toBe(1);
		const full = await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '09:00', jumpers: [{ name: 'C', email: 'c@x.co' }, { name: 'D', email: 'd@x.co' }] }).catch((e) => e);
		expect(isDomainError(full, 'booking_full')).toBe(true);
	});

	test('passenger rules and payments', async () => {
		const { dz, owner } = await makeDropzone(db);
		await expect(createPassenger(db, dz.id, { name: 'Kid', dob: '2018-01-01', jumpDate: DAY })).rejects.toThrow(/too young/);
		await expect(createPassenger(db, dz.id, { name: 'Teen', dob: '2010-01-01', jumpDate: DAY })).rejects.toThrow(/Guardian/);
		const p = await createPassenger(db, dz.id, { name: 'Ann', extras: ['handcam'], depositMinor: P.tandem_deposit });
		expect(p.totalMinor).toBe(P.tandem_slot! + P.tandem_handcam!);
		expect(tandemOutstanding(p)).toBe(P.tandem_slot! + P.tandem_handcam! - P.tandem_deposit!);
		const paid = await recordTandemPayment(db, { passengerId: p.id, amountMinor: tandemOutstanding(p), provider: 'card', by: owner.id });
		expect(paid.paymentStatus).toBe('paid');
		expect(tandemOutstanding(paid)).toBe(0);
	});

	test('a booking made before the DZ priced tandems is unpaid, not paid, and takes the price once it is set', async () => {
		const { dz, owner } = await makeDropzone(db, {}, {});
		const p = await createPassenger(db, dz.id, { name: 'Early Bird', extras: ['handcam'] });
		expect(p).toMatchObject({ totalMinor: 0, paymentStatus: 'unpaid' });
		await expect(applyCurrentTandemPrice(db, p.id)).rejects.toThrow(/Tandem jump price/);
		await setPrices(db, dz.id, { tandem_slot: P.tandem_slot, tandem_handcam: P.tandem_handcam });
		const priced = await applyCurrentTandemPrice(db, p.id);
		expect(priced).toMatchObject({ totalMinor: P.tandem_slot! + P.tandem_handcam!, paymentStatus: 'unpaid' });
		await expect(applyCurrentTandemPrice(db, p.id)).rejects.toThrow(/already has a price/);
		// money taken at the counter on an unpriced booking counts as paid
		await setPrices(db, dz.id, { tandem_slot: 0 });
		const q = await createPassenger(db, dz.id, { name: 'Cash', extras: [] });
		expect(q.totalMinor).toBe(0);
		const cash = await recordTandemPayment(db, { passengerId: q.id, amountMinor: 250000, provider: 'cash', by: owner.id });
		expect(cash.paymentStatus).toBe('paid');
	});
});

describe('indemnity', () => {
	test('sport jumpers must sign when the form is active; snapshot stored', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Skydiving is dangerous.' });
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(false);
		await setIndemnityActive(db, dz.id, 'sport', true);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(true);
		const sig = await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: u.id, signerName: u.name });
		expect(sig.snapshot.sections).toEqual([{ title: 'Risk', content: 'Skydiving is dangerous.', type: 'text' }]);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(false);
	});

	test('an active sport form without sections does not block jumpers', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeUser(db);
		await setIndemnityActive(db, dz.id, 'sport', true);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(false);
		await addSection(db, { dropzoneId: dz.id, audience: 'tandem', title: 'Risk', content: 'Tandem only.' });
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(false);
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Sport.' });
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(true);
	});

	test('sample wording fills an empty form once, in order, and leaves it off', async () => {
		const { dz } = await makeDropzone(db);
		const added = await addStarterSections(db, dz.id, 'tandem');
		expect(added.map((s) => [s.title, s.type, s.position])).toEqual(WAIVER_STARTER.tandem.map((s, i) => [s.title, s.type, i]));
		expect(added.every((s) => s.content.trim().length > 0)).toBe(true);
		// the other form is untouched; a second tap is refused instead of doubling the set
		expect(await listSections(db, dz.id, 'sport')).toHaveLength(0);
		await expect(addStarterSections(db, dz.id, 'tandem')).rejects.toThrow('already has sections');
		expect(await listSections(db, dz.id, 'tandem')).toHaveLength(WAIVER_STARTER.tandem.length);
		expect((await getDropzone(db, dz.id)).indemnityTandemActive).toBe(false);
		// sport sample signs like any hand-written form
		await addStarterSections(db, dz.id, 'sport');
		const u = await makeUser(db);
		await setIndemnityActive(db, dz.id, 'sport', true);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(true);
	});
});

describe('reports', () => {
	test('counts, per-day/aircraft/staff and revenue over completed loads', async () => {
		const { dz } = await makeDropzone(db);
		const ti = await makeMember(db, dz.id, ['tandem_instructor']);
		const [l1, l2] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 8, count: 2, aircraftName: 'C182', pilotName: 'Pat' });
		const [a, b] = [await makeUser(db), await makeUser(db)];
		await addSlot(db, l1.id, { userId: a.id, jumpType: 'belly', extras: ['gear_rental', 'extra_altitude'] });
		await addSlot(db, l1.id, { userId: b.id, jumpType: 'aff_1_3' });
		// the instructor's slot carries the student's jump type: a sport jump, but not a second student
		const affi = await makeMember(db, dz.id, ['aff_instructor']);
		await addSlot(db, l1.id, { userId: affi.id, jumpType: 'aff_1_3', staffRole: 'aff_instructor' });
		const pax = await createPassenger(db, dz.id, { name: 'P', extras: ['handcam', 'beach_landing'] });
		const { addTandemGroup } = await import('./loads.ts');
		await addTandemGroup(db, { loadId: l1.id, passengerId: pax.id, instructorUserId: ti.id });
		await addSlot(db, l2.id, { userId: a.id, jumpType: 'static_line' }); // l2 not completed
		await addSlot(db, l2.id, { userId: affi.id, jumpType: 'static_line', staffRole: 'jumpmaster' });
		await completeLoad(db, l1.id);
		const r = await jumpReport(db, dz.id, DAY, DAY);
		expect(r.totals).toMatchObject({
			loads: 1,
			slots: 5,
			tandems: 1,
			handcam: 1,
			beachLanding: 1,
			sporties: 3,
			aff: 1,
			staticLine: 0,
			gearRental: 1,
			extraAltitude: 1
		});
		expect(r.perAircraft).toEqual([{ aircraft: 'C182', loads: 1, slots: 5 }]);
		const tiRow = r.perStaff.find((s) => s.userId === ti.id)!;
		expect(tiRow.payMinor).toBe(P.pay_tandem! + P.pay_handcam!);
		const expected = P.sport_slot! + P.gear_rental! + P.extra_altitude! + P.aff_1_3! + P.tandem_slot! + P.tandem_handcam! + P.tandem_beach_landing!;
		expect(r.revenue.totalMinor).toBe(expected);
		expect(r.revenue.pilotPayMinor).toBe(P.pay_pilot!);
		// the (named, non-member) pilot is a staff row of their own: loads flown, no jumps
		expect(r.perStaff.find((s) => s.name === 'Pat')).toMatchObject({ userId: null, slots: 0, loads: 1, payMinor: P.pay_pilot! });
		expect(tiRow).toMatchObject({ slots: 1, loads: 0 });
		expect(r.perDay).toEqual([{ day: DAY, loads: 1, slots: 5, revenueMinor: expected }]);
		const all = await jumpReport(db, dz.id, DAY, DAY, { statuses: ['completed', 'planned'] });
		expect(all.totals.staticLine).toBe(1); // the student, not the jumpmaster
		expect((await getLoad(db, l2.id)).status).toBe('planned');
	});
});

describe('files', () => {
	test('save + read via storage; signature data URLs', async () => {
		const storage = new MemoryStorage();
		const u = await makeUser(db);
		const { data, mime } = decodeDataUrl('data:image/png;base64,iVBORw0KGgo=');
		const row = await saveFile(db, storage, { data, mime, purpose: 'signature', ownerUserId: u.id });
		expect(row.key).toMatch(/^signature\/.+\.png$/);
		const blob = await readFileBlob(db, storage, row.id);
		expect(blob!.data).toEqual(data);
		await expect(saveFile(db, storage, { data, mime: 'text/html', purpose: 'other' })).rejects.toThrow(/Unsupported/);
		expect(() => decodeDataUrl('')).toThrow(/empty/);
	});
});
