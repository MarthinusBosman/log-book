import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { notifications, users } from '../db/schema.ts';
import { listMemberships } from '../dropzones/index.ts';
import { actorCan, can, canAny, capabilitiesOf, getRoles, grantRole, requireCan, revokeRole, rolesCan } from './permissions.ts';
import { createSession, generateSessionToken, validateSessionToken } from '../auth/session.ts';
import { freshDb, makeDropzone, makeMember, makeUser } from './testing.ts';

let db: Database;
beforeEach(() => {
	db = freshDb();
});

describe('rolesCan', () => {
	test('role → capability map', () => {
		expect(rolesCan(['owner'], 'dz.settings')).toBe(true);
		expect(rolesCan(['manifest'], 'manifest')).toBe(true);
		expect(rolesCan(['manifest'], 'dz.settings')).toBe(false);
		expect(rolesCan(['rigger'], 'gear.manage')).toBe(true);
		expect(rolesCan(['pilot'], 'manifest')).toBe(false);
		expect(rolesCan(['jumper'], 'loads.view')).toBe(false);
		expect(rolesCan([], 'loads.view')).toBe(false);
	});
	test('multiple roles combine', () => {
		expect(rolesCan(['pilot', 'rigger'], 'gear.manage')).toBe(true);
		const caps = capabilitiesOf(['tandem_instructor', 'manifest']);
		expect(caps).toContain('manifest');
		expect(caps).toContain('loads.view');
		expect(new Set(caps).size).toBe(caps.length);
	});
});

describe('db', () => {
	test('a member can hold several roles; memberships expose them', async () => {
		const { dz, owner } = await makeDropzone(db);
		const u = await makeMember(db, dz.id, ['tandem_instructor', 'rigger', 'manifest']);
		expect((await getRoles(db, u.id, dz.id)).sort()).toEqual(['manifest', 'rigger', 'tandem_instructor']);
		const [m] = await listMemberships(db, u.id);
		expect(m.roles).toEqual(['manifest', 'tandem_instructor', 'rigger']);
		expect(m.role).toBe('manifest');
		expect((await listMemberships(db, owner.id))[0].role).toBe('owner');
		expect(await can(db, u.id, dz.id, 'gear.manage')).toBe(true);
		expect(await can(db, u.id, dz.id, 'pricing.manage')).toBe(false);
		await expect(requireCan(db, u.id, dz.id, 'pricing.manage')).rejects.toThrow(/pricing.manage/);
	});

	test('non-members and suspended members have no capabilities; super-admin has all', async () => {
		const { dz } = await makeDropzone(db);
		const stranger = await makeUser(db);
		expect(await can(db, stranger.id, dz.id, 'loads.view')).toBe(false);
		const staff = await makeMember(db, dz.id, ['manifest']);
		const { dropzoneMembers } = await import('../db/schema.ts');
		await db.update(dropzoneMembers).set({ status: 'suspended' }).where(eq(dropzoneMembers.userId, staff.id));
		expect(await can(db, staff.id, dz.id, 'manifest')).toBe(false);
		await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, stranger.id));
		expect(await can(db, stranger.id, dz.id, 'dz.settings')).toBe(true);
	});

	test('actorCan / canAny: session flag answers super-admin without a users read', async () => {
		const { dz } = await makeDropzone(db);
		const staff = await makeMember(db, dz.id, ['manifest']);
		const roles = await getRoles(db, staff.id, dz.id);
		expect(actorCan({ id: staff.id, isSuperAdmin: false }, roles, ['indemnity.manage', 'manifest'])).toBe(true);
		expect(actorCan({ id: staff.id, isSuperAdmin: false }, roles, 'dz.settings')).toBe(false);
		expect(actorCan({ id: 'x', isSuperAdmin: true }, [], 'dz.settings')).toBe(true);
		expect(await canAny(db, { id: staff.id, isSuperAdmin: false }, dz.id, ['pricing.manage', 'manifest'])).toBe(true);
		expect(await canAny(db, { id: staff.id, isSuperAdmin: false }, dz.id, ['pricing.manage'])).toBe(false);
		// The flag from the session is trusted; an actor without it falls back to reading users.
		const admin = await makeUser(db);
		await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, admin.id));
		expect(await canAny(db, { id: admin.id }, dz.id, ['dz.settings'])).toBe(true);
		expect(await canAny(db, { id: admin.id, isSuperAdmin: false }, dz.id, ['dz.settings'])).toBe(false);
		expect(await canAny(db, { id: 'nobody', isSuperAdmin: true }, dz.id, ['dz.settings'])).toBe(true);
	});

	test('session user carries isSuperAdmin', async () => {
		const u = await makeUser(db);
		await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, u.id));
		const token = generateSessionToken();
		await createSession(db, token, u.id);
		const res = await validateSessionToken(db, token);
		expect(res.user?.isSuperAdmin).toBe(true);
	});

	test('grant is idempotent and notifies once; last owner cannot be revoked', async () => {
		const { dz, owner } = await makeDropzone(db);
		const u = await makeUser(db);
		expect(await grantRole(db, { dropzoneId: dz.id, userId: u.id, role: 'pilot', by: owner.id, dropzoneName: dz.name })).toBe(true);
		expect(await grantRole(db, { dropzoneId: dz.id, userId: u.id, role: 'pilot', by: owner.id })).toBe(false);
		const n = await db.select().from(notifications).where(eq(notifications.userId, u.id));
		expect(n.map((x) => x.type)).toEqual(['added_staff']);
		await revokeRole(db, dz.id, u.id, 'pilot');
		expect(await getRoles(db, u.id, dz.id)).toEqual([]);
		await expect(revokeRole(db, dz.id, owner.id, 'owner')).rejects.toThrow(/owner/);
		await grantRole(db, { dropzoneId: dz.id, userId: u.id, role: 'owner' });
		await revokeRole(db, dz.id, owner.id, 'owner');
		expect(await getRoles(db, owner.id, dz.id)).toEqual([]);
	});
});
