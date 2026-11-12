import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { dropzones } from '../db/schema.ts';
import { freshDb, makeDropzone } from '../domain/testing.ts';
import { zonedTime, wallClock } from './time.ts';
import { displayTokenOf, newDisplayToken, publicDisplayDropzone, sameToken, setDisplayToken } from './display.ts';
import { callPhase, formatCountdown, friendlyError, nextStep, shiftDay } from '../../components/manifest/manifest.ts';

describe('manifest time helpers', () => {
	test('zonedTime converts DZ wall clock to an instant', () => {
		const t = zonedTime('2026-11-11', '08:30', 'Africa/Johannesburg');
		expect(new Date(t!).toISOString()).toBe('2026-11-11T06:30:00.000Z');
		expect(wallClock(t!, 'Africa/Johannesburg')).toBe('08:30');
	});
	test('zonedTime rejects bad input', () => {
		expect(zonedTime('2026-11-11', '25:00', 'UTC')).toBeNull();
		expect(zonedTime('nope', '08:00', 'UTC')).toBeNull();
	});
	test('shiftDay crosses month ends', () => {
		expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
		expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
	});
});

describe('call phases', () => {
	const now = 1_000_000_000;
	test('20/10/5/gear up', () => {
		expect(callPhase('called', now + 19 * 60_000, now)).toBe('call20');
		expect(callPhase('called', now + 9 * 60_000, now)).toBe('call10');
		expect(callPhase('called', now + 4 * 60_000, now)).toBe('call5');
		expect(callPhase('called', now - 1000, now)).toBe('gearup');
		expect(callPhase('boarding', null, now)).toBe('boarding');
		expect(callPhase('open', null, now)).toBe('none');
		expect(callPhase('departed', null, now)).toBe('airborne');
	});
	test('countdown formatting', () => {
		expect(formatCountdown(20 * 60_000)).toBe('20:00');
		expect(formatCountdown(65_500)).toBe('1:05');
		expect(formatCountdown(-12_000)).toBe('+0:12');
	});
	test('next step follows the load lifecycle', () => {
		expect(nextStep('planned')?.action).toBe('call');
		expect(nextStep('called')?.action).toBe('board');
		expect(nextStep('landed')?.action).toBe('complete');
		expect(nextStep('completed')).toBeNull();
	});
});

describe('friendly errors', () => {
	test('insufficient funds shows amounts', () => {
		const m = friendlyError('insufficient_funds', 'x', { availableMinor: 0, requiredMinor: 45000, currency: 'ZAR' });
		expect(m).toContain('Insufficient wallet funds');
		expect(m).toContain('450');
	});
	test('overweight mentions the limit', () => {
		expect(friendlyError('overweight', 'x', { weightKg: 1700, weightLimitKg: 1600 })).toContain('1600 kg');
	});
	test('forbidden is generic', () => {
		expect(friendlyError('forbidden', 'secret detail')).toBe('You do not have permission to do that.');
	});
});

describe('public display token', () => {
	test('tokens are random and url-safe', () => {
		const a = newDisplayToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
		expect(newDisplayToken()).not.toBe(a);
		expect(sameToken(a, a)).toBe(true);
		expect(sameToken(a, a.slice(1) + 'x')).toBe(false);
	});
	test('public lookup requires the configured token', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		expect(await publicDisplayDropzone(db, dz.slug, 'anything')).toBeNull();
		const token = newDisplayToken();
		await setDisplayToken(db, dz.id, token);
		expect((await publicDisplayDropzone(db, dz.slug, token))?.id).toBe(dz.id);
		expect(await publicDisplayDropzone(db, dz.slug, token + 'x')).toBeNull();
		expect(await publicDisplayDropzone(db, dz.slug, null)).toBeNull();
		expect(await publicDisplayDropzone(db, 'other-slug', token)).toBeNull();
		await setDisplayToken(db, dz.id, null);
		const [row] = await db.select().from(dropzones).where(eq(dropzones.id, dz.id));
		expect(displayTokenOf(row)).toBeNull();
		expect(await publicDisplayDropzone(db, dz.slug, token)).toBeNull();
	});
});
