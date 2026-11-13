import { describe, expect, test } from 'bun:test';
import type { Database } from '../db/index.ts';
import { DAY, NOW, freshDb, makeDropzone, makeMember, makeUser } from '../domain/testing.ts';
import { addSlots, addTandemGroup, createLoads } from '../domain/loads.ts';
import { createPassenger } from '../domain/tandems.ts';
import { flagMembershipWarnings, slotPeople } from '../memberships/service.ts';
import { avatarsOf, boardLoads, staffToday } from './board.ts';

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
});
