import { describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { DAY, NOW, freshDb, makeDropzone, makeMember, makeUser } from '../domain/testing.ts';
import { addSlots, addTandemGroup, boardLoad, cancelLoad, createLoads, departLoad, listLoadsForDay } from '../domain/loads.ts';
import { createPassenger } from '../domain/tandems.ts';
import { flagMembershipWarnings, slotPeople } from '../memberships/service.ts';
import { avatarsOf, boardLoads, otherLoadsByUser, staffToday } from './board.ts';
import { alsoOnLabel } from '../../components/manifest/manifest.ts';

describe('manifest board view-models', () => {
	test('staffToday counts paying slots from the board loads; slots carry avatar + membership warning', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		const ti = await makeMember(db, dz.id, ['tandem_instructor']);
		const lapsed = await makeUser(db, { avatar: '/files/a.webp', association: 'pasa', associationExpiry: '2026-03-31' });
		const fine = await makeUser(db, { association: 'pasa', associationExpiry: '2027-03-31' });
		const [load] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 10, aircraftName: 'Caravan' });
		await addSlots(db, load.id, [
			{ userId: lapsed.id, jumpType: 'belly' },
			{ userId: fine.id, jumpType: 'belly' }
		], { allowExpired: true });
		const pax = await createPassenger(db, dz.id, { name: 'Pax', weightKg: 70 });
		await addTandemGroup(db, { loadId: load.id, passengerId: pax.id, instructorUserId: ti.id });

		const today = await staffToday(db, dz, NOW);
		// 2 fun jumpers + the passenger; the TI's staff slot isn't sold
		expect(today).toMatchObject({ day: DAY, loadsPlanned: 1, slotsSold: 3 });

		const [vm] = await boardLoads(db, dz, DAY);
		const byUser = Object.fromEntries(vm.slots.filter((s) => s.userId).map((s) => [s.userId, s]));
		expect(byUser[lapsed.id]).toMatchObject({ avatar: '/files/a.webp', membershipWarning: 'PASA expired' });
		expect(byUser[fine.id]).toMatchObject({ avatar: null, membershipWarning: null });
	});

	test('flagMembershipWarnings uses the passed people (no query) and judges each load on its own day', async () => {
		const db = freshDb();
		const u = await makeUser(db, { avatar: '/files/u.webp', association: 'uspa', associationExpiry: '2026-11-10' });
		const people = await slotPeople(db, [u.id, null, u.id]);
		expect([...people.keys()]).toEqual([u.id]);
		expect(avatarsOf(people)).toEqual({ [u.id]: '/files/u.webp' });

		const loads = [
			{ day: '2026-11-09', slots: [{ userId: u.id } as { userId: string | null; membershipWarning?: string | null }] },
			{ day: '2026-11-14', slots: [{ userId: u.id }, { userId: null }] as { userId: string | null; membershipWarning?: string | null }[] }
		];
		const noDb = null as unknown as Database; // would throw if queried
		await flagMembershipWarnings(noDb, loads, people);
		expect(loads[0].slots[0].membershipWarning).toBeNull();
		expect(loads[1].slots.map((s) => s.membershipWarning)).toEqual(['USPA expired', null]);
	});

	test('otherLoadsByUser lists the other still-open loads per jumper (departed/cancelled are free again)', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		const a = await makeUser(db);
		const b = await makeUser(db);
		const c = await makeUser(db);
		const [l1, l2, l3, l4, l5] = await createLoads(db, { dropzoneId: dz.id, day: DAY, capacity: 10, aircraftName: 'Caravan', count: 5 });
		await addSlots(db, l1.id, [{ userId: a.id, jumpType: 'belly' }, { userId: b.id, jumpType: 'belly' }]);
		await addSlots(db, l2.id, [{ userId: a.id, jumpType: 'belly' }]);
		await addSlots(db, l3.id, [{ userId: a.id, jumpType: 'belly' }, { userId: c.id, jumpType: 'belly' }]);
		await addSlots(db, l4.id, [{ userId: c.id, jumpType: 'belly' }]);
		await addSlots(db, l5.id, [{ userId: b.id, jumpType: 'belly' }]);
		await boardLoad(db, l4.id, { now: NOW });
		await departLoad(db, l4.id, NOW);
		await cancelLoad(db, l5.id, { now: NOW });

		const day = await listLoadsForDay(db, dz.id, DAY, { includeCancelled: true });
		const others = otherLoadsByUser(day.reverse(), l2.id);
		expect(others).toEqual({ [a.id]: [1, 3], [b.id]: [1], [c.id]: [3] });
		expect(alsoOnLabel(others[a.id])).toBe('on loads 1, 3');
		expect(alsoOnLabel(others[b.id], true)).toBe('On load 1');
	});
});
