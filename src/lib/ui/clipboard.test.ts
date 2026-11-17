import { describe, expect, test } from 'bun:test';
import { copyText } from './clipboard.ts';

describe('copyText', () => {
	test('uses the async clipboard when it works', async () => {
		const got: string[] = [];
		let prompted = false;
		const r = await copyText('abc', 'Copy', {
			clipboard: { writeText: async (t) => void got.push(t) },
			legacyCopy: () => false,
			prompt: () => (prompted = true)
		});
		expect(r).toBe('copied');
		expect(got).toEqual(['abc']);
		expect(prompted).toBe(false);
	});

	test('falls back to the legacy copy when the clipboard is denied or missing', async () => {
		const legacy: string[] = [];
		const denied = await copyText('x', 'Copy', {
			clipboard: { writeText: async () => Promise.reject(new Error('NotAllowedError')) },
			legacyCopy: (t) => (legacy.push(t), true)
		});
		const missing = await copyText('y', 'Copy', { clipboard: null, legacyCopy: (t) => (legacy.push(t), true) });
		expect([denied, missing]).toEqual(['copied', 'copied']);
		expect(legacy).toEqual(['x', 'y']);
	});

	test('shows the text in a prompt when nothing can copy it', async () => {
		const shown: [string, string][] = [];
		const r = await copyText('https://log-book.app/dz/x', 'Copy the link', {
			clipboard: { writeText: async () => Promise.reject(new Error('denied')) },
			legacyCopy: () => false,
			prompt: (m, v) => shown.push([m, v])
		});
		expect(r).toBe('shown');
		expect(shown).toEqual([['Copy the link', 'https://log-book.app/dz/x']]);
	});

	test('never throws outside a browser', async () => {
		expect(await copyText('z')).toBe('shown');
	});
});
