import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { dropzones } from '../db/schema.ts';
import { freshDb, makeDropzone } from '../domain/testing.ts';
import { zonedTime, wallClock } from './time.ts';
import { displayTokenOf, newDisplayToken, publicDisplayDropzone, sameToken, setDisplayToken } from './display.ts';
import { needsConfirm } from './context.ts';
import { callPhase, completeConfirm, confirmed, formAction, formatCountdown, pageWithoutAction, removeSlotConfirm, friendlyError, nextStep, shiftDay, slotMoney } from '../../components/manifest/manifest.ts';

describe('confirmed (act confirm option)', () => {
	test('no message = go ahead without asking', () => {
		let asked = 0;
		expect(confirmed(undefined, () => (asked++, false))).toBe(true);
		expect(asked).toBe(0);
	});
	test('dismissing the prompt stops the submit; lazy messages are evaluated at submit time', () => {
		const seen: string[] = [];
		let n = 3;
		expect(confirmed(() => `Cancel load ${n}?`, (m) => (seen.push(m), false))).toBe(false);
		n = 4;
		expect(confirmed(() => `Cancel load ${n}?`, (m) => (seen.push(m), true))).toBe(true);
		expect(seen).toEqual(['Cancel load 3?', 'Cancel load 4?']);
	});
});

describe('needsConfirm (destructive actions without JS)', () => {
	const step = { action: 'complete', message: completeConfirm(3), label: 'Mark completed', fields: { loadId: 'l1' } };
	test('a post without confirmed=1 gets a 409 confirmation step back with the fields to re-post', () => {
		const f = new FormData();
		f.set('loadId', 'l1');
		const r = needsConfirm(f, step);
		expect(r?.status).toBe(409);
		expect(r?.data).toEqual({ action: 'complete', code: 'confirm', message: 'Mark load 3 as completed? Wallets are charged and logbooks written.', confirm: step });
		f.set('confirmed', 'yes');
		expect(needsConfirm(f, step)?.status).toBe(409);
	});
	test('confirmed=1 (added by act() after the dialog, or by the confirmation step) runs the action', () => {
		const f = new FormData();
		f.set('confirmed', '1');
		expect(needsConfirm(f, step)).toBeNull();
	});
	test('remove-slot copy names the jumper and the group', () => {
		expect(removeSlotConfirm('Vera Visitor')).toBe('Remove Vera Visitor from the load?');
		expect(removeSlotConfirm('Vera Visitor', true)).toBe('Remove Vera Visitor and their whole group from the load?');
	});
});

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
	test('formAction keeps the board day, drops a previous action', () => {
		expect(formAction({ search: '' }, 'complete')).toBe('?/complete');
		expect(formAction({ search: '?day=2026-11-20' }, 'complete')).toBe('?/complete&day=2026-11-20');
		expect(formAction({ search: '?/cancel&day=2026-11-20' }, 'cancel')).toBe('?/cancel&day=2026-11-20');
		expect(pageWithoutAction({ pathname: '/app/manifest', search: '?/cancel&day=2026-11-20' })).toBe('/app/manifest?day=2026-11-20');
		expect(pageWithoutAction({ pathname: '/app/manifest', search: '?/cancel' })).toBe('/app/manifest');
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

describe('slotMoney', () => {
	test('wallet-held slots are not outstanding (they are charged when the load completes)', () => {
		const m = slotMoney([
			{ totalMinor: 55000, paid: false, held: false },
			{ totalMinor: 45000, paid: false, held: true },
			{ totalMinor: 45000, paid: true, held: false },
			{ totalMinor: 0, paid: false, held: false }
		]);
		expect(m).toEqual({ totalMinor: 145000, heldMinor: 45000, outstandingMinor: 55000 });
	});
});
