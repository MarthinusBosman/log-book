import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { isDomainError } from './errors.ts';
import {
	addBookingSlots,
	addWeeklySlot,
	availabilityForDate,
	availabilityRange,
	cancelPassenger,
	changeTandemStaff,
	completePassenger,
	countByDay,
	createOnlineBooking,
	createPassenger,
	getPassenger,
	listBookingSlots,
	resetPassenger,
	tandemGroup
} from './tandems.ts';
import {
	addSection,
	isSignatureValid,
	latestSportSignatures,
	listSections,
	listSignatures,
	moveSection,
	needsSportIndemnity,
	setIndemnityActive,
	signIndemnity,
	updateSection,
	validateAnswers,
	WAIVER_VALID_DAYS
} from './indemnity.ts';
import { addTandemGroup, createLoads } from './loads.ts';
import { addDays, DAY_MS } from './time.ts';
import { DAY, NOW, freshDb, makeDropzone, makeMember } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

const code = async (p: Promise<unknown>) => {
	try {
		await p;
		return 'ok';
	} catch (e) {
		return isDomainError(e) ? e.code : String(e);
	}
};

describe('booking slots admin + availability range', () => {
	test('weekly slots dedupe, dated rows override, range matches per-day availability', async () => {
		const { dz } = await makeDropzone(db);
		const wd = 5; // Saturday (DAY 2026-11-14 is a Saturday)
		expect(await addWeeklySlot(db, { dropzoneId: dz.id, weekday: wd, time: '09:00', capacity: 2 })).toBe(true);
		expect(await addWeeklySlot(db, { dropzoneId: dz.id, weekday: wd, time: '09:00', capacity: 2 })).toBe(false);
		expect(await code(addWeeklySlot(db, { dropzoneId: dz.id, weekday: 9, time: '09:00', capacity: 2 }))).toBe('invalid');
		await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '09:00', capacity: 5 });
		await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '13:00', capacity: 1 });
		await createOnlineBooking(db, { dropzoneId: dz.id, date: DAY, time: '13:00', jumpers: [{ name: 'Ann', email: 'a@x.co', extras: ['handcam'], weightKg: 70 }] });

		const range = await availabilityRange(db, dz.id, DAY, addDays(DAY, 7));
		expect(range[DAY]).toEqual(await availabilityForDate(db, dz.id, DAY));
		expect(range[DAY].map((a) => [a.time, a.capacity, a.remaining])).toEqual([
			['09:00', 5, 5],
			['13:00', 1, 0]
		]);
		// next Saturday only has the recurring slot
		expect(range[addDays(DAY, 7)].map((a) => [a.time, a.capacity])).toEqual([['09:00', 2]]);
		expect(range[addDays(DAY, 1)]).toBeUndefined();

		const { dated, recurring } = await listBookingSlots(db, dz.id, DAY);
		expect(dated).toHaveLength(2);
		expect(recurring).toHaveLength(1);
		expect(await countByDay(db, dz.id, DAY, DAY)).toEqual({ [DAY]: 1 });
	});

	test('online booking stores full passenger details and prices extras', async () => {
		const { dz } = await makeDropzone(db);
		await addBookingSlots(db, { dropzoneId: dz.id, date: DAY, time: '10:00', capacity: 2 });
		const { passengers } = await createOnlineBooking(db, {
			dropzoneId: dz.id,
			date: DAY,
			time: '10:00',
			jumpers: [{ name: 'Ben', email: 'b@x.co', extras: ['handcam', 'outside_video'], weightKg: 80, heightCm: 180, emergencyName: 'Mum' }]
		});
		expect(passengers[0]).toMatchObject({ weightKg: 80, emergencyName: 'Mum', totalMinor: 320000 + 80000 + 120000, onlineBooking: true });
	});
});

describe('tandem status + staff changes', () => {
	test('cancel / reset / complete and TI swap on a load', async () => {
		const { dz, owner } = await makeDropzone(db);
		const ti1 = await makeMember(db, dz.id, ['tandem_instructor']);
		const ti2 = await makeMember(db, dz.id, ['tandem_instructor']);
		const vid = await makeMember(db, dz.id, ['videographer']);
		const p = await createPassenger(db, dz.id, { name: 'Cara', email: 'c@x.co', weightKg: 60, jumpDate: DAY, extras: ['handcam'] });

		expect((await cancelPassenger(db, p.id)).status).toBe('cancelled');
		expect((await resetPassenger(db, p.id)).status).toBe('booked');

		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, aircraftName: 'C208', capacity: 4, createdBy: owner.id });
		await addTandemGroup(db, { loadId: load.id, passengerId: p.id, instructorUserId: ti1.id }, { skipWallet: true });
		expect(await code(cancelPassenger(db, p.id))).toBe('conflict');

		await changeTandemStaff(db, { passengerId: p.id, role: 'tandem_instructor', userId: ti2.id });
		await changeTandemStaff(db, { passengerId: p.id, role: 'videographer', userId: vid.id });
		let group = await tandemGroup(db, p.id);
		expect(group.map((g) => [g.staffRole, g.userId])).toEqual([
			[null, null],
			['tandem_instructor', ti2.id],
			['videographer', vid.id]
		]);
		await changeTandemStaff(db, { passengerId: p.id, role: 'videographer', userId: null });
		group = await tandemGroup(db, p.id);
		expect(group).toHaveLength(2);
		expect(await code(changeTandemStaff(db, { passengerId: p.id, role: 'tandem_instructor', userId: null }))).toBe('invalid');
		expect((await getPassenger(db, p.id))!.manifested).toBe(true);
		expect((await completePassenger(db, p.id)).status).toBe('completed');
	});
});

describe('indemnity builder + answers + validity', () => {
	test('reorder, section types, answer validation, listing, expiry', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeMember(db, dz.id, ['jumper']);
		const a = await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Skydiving is dangerous', type: 'acknowledgement' });
		const b = await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Initial here', content: 'I read it', type: 'initials' });
		const c = await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Witness', content: '', type: 'signature' });
		expect(await code(addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Empty', content: ' ', type: 'text' }))).toBe('invalid');
		await moveSection(db, c.id, 'up');
		expect((await listSections(db, dz.id, 'sport')).map((s) => s.id)).toEqual([a.id, c.id, b.id]);
		await moveSection(db, a.id, 'up'); // no-op at top
		expect((await listSections(db, dz.id, 'sport'))[0].id).toBe(a.id);
		await updateSection(db, b.id, { title: '  Initials ' });
		expect(await code(updateSection(db, a.id, { content: '' }))).toBe('invalid');

		const sections = await listSections(db, dz.id, 'sport');
		expect(() => validateAnswers(sections, [])).toThrow(/tick the box/);
		expect(() => validateAnswers(sections, [{ accepted: true }, { signatureFileId: 'f' }, { initials: '' }])).toThrow(/initials/);
		expect(validateAnswers(sections, [{ accepted: true }, { signatureFileId: 'f' }, { initials: 'ab' }])).toEqual([
			{ accepted: true },
			{ signatureFileId: 'f' },
			{ initials: 'AB' }
		]);

		await setIndemnityActive(db, dz.id, 'sport', true);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(true);
		expect(await code(signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: u.id, signerName: 'U', answers: [] }))).toBe('invalid');
		const old = await signIndemnity(db, {
			dropzoneId: dz.id,
			audience: 'sport',
			userId: u.id,
			signerName: 'U',
			answers: [{ accepted: true }, { signatureFileId: 'f' }, { initials: 'u' }],
			signer: { Email: u.email },
			now: Date.now() - (WAIVER_VALID_DAYS + 1) * DAY_MS
		});
		expect(old.snapshot.answers?.[2]).toEqual({ initials: 'U' });
		expect(old.snapshot.signer?.Email).toBe(u.email);
		expect(isSignatureValid(old)).toBe(false);
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(true); // expired
		await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: u.id, signerName: 'U' });
		expect(await needsSportIndemnity(db, dz.id, u.id)).toBe(false);

		const list = await listSignatures(db, dz.id, { audience: 'sport', search: u.email.slice(0, 6) });
		expect(list).toHaveLength(2);
		expect(list[0].email).toBe(u.email);
		expect((await latestSportSignatures(db, dz.id)).get(u.id)!.signedAt.getTime()).toBeGreaterThan(old.signedAt.getTime());
	});
});
