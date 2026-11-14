import { describe, expect, test } from 'bun:test';
import { formOutcome } from './no-js-outcome.ts';

describe('formOutcome', () => {
	test('no form → nothing', () => {
		expect(formOutcome(null, 200)).toBeNull();
		expect(formOutcome(undefined, 200)).toBeNull();
	});
	test('success message', () => {
		expect(formOutcome({ message: 'Caravan added to the fleet' }, 200)).toEqual({ ok: true, text: 'Caravan added to the fleet' });
	});
	test('success without a message → nothing', () => {
		expect(formOutcome({ ok: true }, 200)).toBeNull();
		expect(formOutcome({ message: '  ' }, 200)).toBeNull();
	});
	test('failure message', () => {
		expect(formOutcome({ message: 'Plane name is required.' }, 400)).toEqual({ ok: false, text: 'Plane name is required.' });
	});
	test('failure without a message still says something', () => {
		expect(formOutcome({}, 400)).toEqual({ ok: false, text: 'Please check the form and try again.' });
		expect(formOutcome({ message: 42 }, 404)?.ok).toBe(false);
	});
});
