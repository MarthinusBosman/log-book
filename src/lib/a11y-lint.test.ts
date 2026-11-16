import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Static accessibility guards over every .svelte file, for patterns axe found in
 * dialogs/drawers that page-level scans and e2e tests didn't open.
 */
const root = join(import.meta.dir, '..');

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		return e.isDirectory() ? svelteFiles(p) : e.name.endsWith('.svelte') ? [p] : [];
	});
}

const files = svelteFiles(root).map((p) => ({ name: relative(root, p), text: readFileSync(p, 'utf8') }));

function lineOf(text: string, index: number) {
	return text.slice(0, index).split('\n').length;
}

describe('svelte a11y lint', () => {
	test('finds the component files', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	test('every <Select> has a visible label or an aria-label', () => {
		const missing: string[] = [];
		for (const f of files) {
			for (const m of f.text.matchAll(/<Select\b([\s\S]*?)\/>/g)) {
				if (!/\b(label|aria-label|aria-labelledby)=/.test(m[1])) missing.push(`${f.name}:${lineOf(f.text, m.index)}`);
			}
		}
		expect(missing).toEqual([]);
	});

	test('pages that reset to the root layout (+page@) render a <main> landmark', () => {
		// The app shell provides <main id="main">; print sheets and the hangar board skip it.
		const withMain = files
			.filter((f) => f.name.startsWith('lib/') && /<main\b/.test(f.text))
			.map((f) => f.name.split('/').pop()!.replace('.svelte', ''));
		const resets = files.filter((f) => /\+(page|layout)@[^/]*\.svelte$/.test(f.name));
		expect(resets.length).toBeGreaterThan(0);
		const missing = resets
			.filter((f) => !/<main\b/.test(f.text) && !withMain.some((c) => new RegExp(`<${c}\\b`).test(f.text)))
			.map((f) => f.name);
		expect(missing).toEqual([]);
	});

	test('<dl> starts with a term, not a heading or paragraph', () => {
		const bad: string[] = [];
		for (const f of files) {
			for (const m of f.text.matchAll(/<dl\b[^>]*>\s*<(p|h[1-6])\b/g)) bad.push(`${f.name}:${lineOf(f.text, m.index)}`);
		}
		expect(bad).toEqual([]);
	});
});
