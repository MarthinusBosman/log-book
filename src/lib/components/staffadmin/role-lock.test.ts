import { describe, expect, test } from 'bun:test';
import type { DropzoneRole } from '#lib/domain/constants.ts';
import { roleLock } from './role-lock.ts';

const has = (...r: DropzoneRole[]) => new Set<DropzoneRole>(r);

describe('roleLock', () => {
	test('only owners can touch the owner box', () => {
		expect(roleLock('owner', { isOwner: false, isSelf: false, has: has() })).toBe('Only an owner can change this.');
		expect(roleLock('owner', { isOwner: false, isSelf: false, has: has('owner') })).toBe('Only an owner can change this.');
		expect(roleLock('owner', { isOwner: true, isSelf: false, has: has('owner') })).toBeNull();
		expect(roleLock('admin', { isOwner: false, isSelf: false, has: has('admin') })).toBeNull();
	});
	test('you keep your own owner role', () => {
		expect(roleLock('owner', { isOwner: true, isSelf: true, has: has('owner', 'admin') })).toMatch(/own owner role/);
		// an owner may drop their extra admin role (they stay owner)
		expect(roleLock('admin', { isOwner: true, isSelf: true, has: has('owner', 'admin') })).toBeNull();
	});
	test('an admin keeps their own admin role but can change the rest', () => {
		expect(roleLock('admin', { isOwner: false, isSelf: true, has: has('admin', 'manifest') })).toMatch(/own admin access/);
		expect(roleLock('manifest', { isOwner: false, isSelf: true, has: has('admin', 'manifest') })).toBeNull();
		// not held → nothing to lock (they could add it)
		expect(roleLock('admin', { isOwner: false, isSelf: true, has: has('manifest') })).toBeNull();
	});
});
