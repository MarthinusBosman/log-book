import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formOutcome, successNotice } from './no-js-outcome.ts';

describe('successNotice', () => {
	test('success line on an ok answer', () => {
		expect(successNotice({ action: 'update', success: ' Check-in updated ' }, 200)).toBe('Check-in updated');
	});
	test('nothing without a string success, on failures, or when the page shows it inline', () => {
		expect(successNotice(null, 200)).toBeNull();
		expect(successNotice({ success: true, message: 'x' }, 200)).toBeNull();
		expect(successNotice({ success: '  ' }, 200)).toBeNull();
		expect(successNotice({ success: 'Saved' }, 400)).toBeNull();
		expect(successNotice({ success: 'Jump has been signed', successShownInline: true }, 200)).toBeNull();
	});
});

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
	test('untaggedOnly skips answers a card shows inline (tagged with action)', () => {
		expect(formOutcome({ action: 'logo', message: 'Use a PNG, JPG or WebP image' }, 400, { untaggedOnly: true })).toBeNull();
		expect(formOutcome({ action: 'style', ok: true, message: 'Branding saved' }, 200, { untaggedOnly: true })).toBeNull();
		expect(formOutcome({ message: 'You need the Settings permission.' }, 403, { untaggedOnly: true })).toEqual({ ok: false, text: 'You need the Settings permission.' });
		expect(formOutcome({ action: 'logo', message: 'x' }, 400)).toEqual({ ok: false, text: 'x' });
	});
});

describe('no-JS outcome coverage', () => {
	// Toast-only staff forms lose their answer without JS unless the page renders <NoJsOutcome />.
	test('every route using toastEnhance renders NoJsOutcome', () => {
		const routes = join(import.meta.dir, '../../../routes');
		const walk = (dir: string): string[] =>
			readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
				const p = join(dir, e.name);
				return e.isDirectory() ? walk(p) : e.name.endsWith('.svelte') ? [p] : [];
			});
		const missing = walk(routes)
			.filter((p) => {
				const text = readFileSync(p, 'utf8');
				return /\btoastEnhance\(/.test(text) && !/<NoJsOutcome\b/.test(text);
			})
			.map((p) => relative(routes, p));
		expect(missing).toEqual([]);
	});
});
