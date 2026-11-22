import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { dropzones } from '../db/schema.ts';
import { freshDb, makeDropzone } from '../domain/testing.ts';
import { zonedTime, wallClock } from './time.ts';
import { displayTokenOf, newDisplayToken, publicDisplayDropzone, sameToken, setDisplayToken } from './display.ts';
import { needsConfirm } from './context.ts';
import { callPhase, completeConfirm, confirmed, formAction, formatCountdown, loadTimesPreview, pageWithoutAction, pickedOverFree, rentalApplies, rentalLabel, rentalLine, teamOptionLabel, totalLabel, slotExtrasFor, tandemOverFree, tandemVideoHint, pilotOptions, removeSlotConfirm, friendlyError, nextStep, shiftDay, slotMoney } from '../../components/manifest/manifest.ts';

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
	test('formAction drops the ?new=1 that opened the New load dialog', () => {
		expect(formAction({ search: '?day=2026-11-20&new=1' }, 'createLoad')).toBe('?/createLoad&day=2026-11-20');
		expect(formAction({ search: '?new=1' }, 'createLoad')).toBe('?/createLoad');
		expect(pageWithoutAction({ pathname: '/app/manifest', search: '?/createLoad&new=1' })).toBe('/app/manifest');
	});
	test('formAction drops the ?slot= that opened the slot editor', () => {
		expect(formAction({ search: '?slot=abc' }, 'moveSlot')).toBe('?/moveSlot');
		expect(formAction({ search: '?day=2026-11-20&slot=abc' }, 'updateSlot')).toBe('?/updateSlot&day=2026-11-20');
		expect(pageWithoutAction({ pathname: '/app/manifest/l1', search: '?/removeSlot&slot=abc' })).toBe('/app/manifest/l1');
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
		expect(m).not.toContain('Nobody was added');
	});
	test('insufficient funds in a group names the jumper', () => {
		const m = friendlyError('insufficient_funds', 'x', { availableMinor: 0, requiredMinor: 45000, currency: 'ZAR', name: 'Anika Fourie' });
		expect(m.startsWith('Anika Fourie: Insufficient wallet funds')).toBe(true);
		expect(m).toContain('Nobody was added.');
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
		expect(m).toEqual({ totalMinor: 145000, paidMinor: 45000, heldMinor: 45000, outstandingMinor: 55000 });
		expect(m.paidMinor + m.heldMinor + m.outstandingMinor).toBe(m.totalMinor);
	});
});

describe('loadTimesPreview (New load dialog)', () => {
	test('lists each load time, shortens long runs', () => {
		expect(loadTimesPreview('13:30', 3, 20)).toEqual({ kind: 'times', times: ['13:30', '13:50', '14:10'], text: '13:30, 13:50, 14:10' });
		const long = loadTimesPreview('08:00', '8', '45');
		expect(long.kind === 'times' && long.text).toBe('08:00, 08:45, 09:30 … 13:15');
		expect(loadTimesPreview('09:05', 2, '')).toMatchObject({ text: 'All at 09:05' });
	});
	test('one load or no time and no gap says nothing', () => {
		expect(loadTimesPreview('13:30', 1, 20).kind).toBe('none');
		expect(loadTimesPreview('', 3, '').kind).toBe('none');
		expect(loadTimesPreview('', '', 20).kind).toBe('none');
	});
	test('mirrors the two cases createLoads refuses', () => {
		expect(loadTimesPreview('', 3, 20).kind).toBe('needsTime');
		expect(loadTimesPreview('23:00', 4, 20)).toEqual({ kind: 'pastMidnight', count: 4, spacing: 20 });
		expect(loadTimesPreview('23:00', 3, 29).kind).toBe('times'); // last at 23:58
		expect(loadTimesPreview('23:00', 3, 30).kind).toBe('pastMidnight'); // last at 00:00
	});
});

describe('pickedOverFree (add-to-load picker)', () => {
	test('quiet while the selection fits', () => {
		expect(pickedOverFree(0, 0)).toBeNull();
		expect(pickedOverFree(3, 4)).toBeNull();
		expect(pickedOverFree(4, 4)).toBeNull();
	});
	test('says how many to untick, or that the load is full', () => {
		expect(pickedOverFree(5, 4)).toBe('5 picked, but only 4 slots left. Untick 1 so the rest fit.');
		expect(pickedOverFree(3, 1)).toBe('3 picked, but only 1 slot left. Untick 2 so the rest fit.');
		expect(pickedOverFree(2, 0)).toBe('This load is full. Pick another load or make space first.');
	});
});

describe('tandemOverFree (Tandem tab)', () => {
	test('quiet while passenger + TI (+ video) fit', () => {
		expect(tandemOverFree(false, 2)).toBeNull();
		expect(tandemOverFree(true, 3)).toBeNull();
	});
	test('says what is short: video needs a third seat, a full load, one seat left', () => {
		expect(tandemOverFree(true, 2)).toBe('A tandem with outside video needs 3 slots, but only 2 slots are left. Drop the video or pick another load.');
		expect(tandemOverFree(false, 1)).toBe('A tandem needs 2 slots, but only 1 slot is left. Pick another load or make space first.');
		expect(tandemOverFree(true, 1)).toBe('A tandem needs 3 slots, but only 1 slot is left. Pick another load or make space first.');
		expect(tandemOverFree(false, 0)).toBe('This load is full. Pick another load or make space first.');
	});
});

describe('tandemVideoHint (Tandem tab)', () => {
	test('quiet when the booking and the picked camera flyer agree', () => {
		expect(tandemVideoHint('Kyle', ['outside_video', 'max_altitude'], true)).toBeNull();
		expect(tandemVideoHint('Kyle', ['handcam'], false)).toBeNull();
	});
	test('booked video with nobody filming, and filming nobody pays for', () => {
		expect(tandemVideoHint('Kyle', ['outside_video'], false)).toBe('Kyle booked outside video: pick who films them under 3. Outside video.');
		expect(tandemVideoHint('Sarah', ['beach_landing'], true)).toBe("Sarah didn't book outside video, so it isn't charged. Add the extra in their slot afterwards if they want it.");
	});
});

describe('pilotOptions (Plane, pilot & time)', () => {
	const pilots = [
		{ id: 'p1', name: 'Palesa' },
		{ id: 'p2', name: 'Olga' }
	];
	test('someone jumping on the load is listed but disabled', () => {
		const opts = pilotOptions(pilots, [{ userId: 'p2' }, { userId: null }], { pilotUserId: 'p1', pilotName: 'Palesa' });
		expect(opts).toEqual([
			{ value: '', label: 'Other / none' },
			{ value: 'p1', label: 'Palesa' },
			{ value: 'p2', label: 'Olga · jumping on this load', disabled: true }
		]);
	});
	test('the current pilot stays selectable; a typed-in pilot name labels the empty option', () => {
		expect(pilotOptions(pilots, [{ userId: 'p1' }], { pilotUserId: 'p1', pilotName: 'Palesa' })[1]).toEqual({ value: 'p1', label: 'Palesa' });
		expect(pilotOptions(pilots, [], { pilotUserId: null, pilotName: 'Guest pilot' })[0]).toEqual({ value: '', label: 'Guest pilot' });
	});
});

describe('gear rental from check-in (slotExtrasFor / rentalLabel)', () => {
	test('a renter on a sport jump gets gear rental on top of the shared extras', () => {
		expect(slotExtrasFor(['extra_altitude'], 'belly', null, true)).toEqual(['extra_altitude', 'gear_rental']);
		expect(slotExtrasFor(['extra_altitude'], 'belly', null, false)).toEqual(['extra_altitude']);
		expect(slotExtrasFor(['gear_rental'], 'hop_pop', null, true)).toEqual(['gear_rental']);
	});
	test('never on tandem, student training jumps or staff slots (their price covers the gear)', () => {
		for (const jt of ['tandem', 'aff_1_3', 'aff_8_10', 'static_line', 'isp'] as const) expect(slotExtrasFor([], jt, null, true)).toEqual([]);
		expect(slotExtrasFor([], 'belly', 'coach', true)).toEqual([]);
		expect(rentalApplies('coaching')).toBe(true);
		expect(rentalApplies('aff_4_7')).toBe(false);
	});
	test('names the renters', () => {
		expect(rentalLabel(['Johan'])).toBe('Add gear rental for Johan (checked in with rental gear)');
		expect(rentalLabel(['Johan', 'Mia', 'Lee'])).toBe('Add gear rental for Johan, Mia and Lee (checked in with rental gear)');
	});
	test('team picker labels: a jumper’s own team says how many of its members are here', () => {
		expect(teamOptionLabel({ name: 'Sharks', discipline: '4 way FS' })).toBe('Sharks · 4 way FS');
		expect(teamOptionLabel({ name: 'Zoo Crew', discipline: null, personal: true, jumping: 2, size: 3 })).toBe("Zoo Crew · jumper's team, 2 of 3 here");
	});
	test('price preview labels: renters make the per-jumper total uneven', () => {
		expect(rentalLine(1)).toBe('Gear rental');
		expect(rentalLine(2)).toBe('Gear rental × 2');
		expect(totalLabel(1)).toBe('Slot price');
		expect(totalLabel(1, true)).toBe('Slot price');
		expect(totalLabel(3)).toBe('Total × 3');
		expect(totalLabel(3, true)).toBe('Total for 3 jumpers');
	});
});
