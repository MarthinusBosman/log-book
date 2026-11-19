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

	test('every page renders exactly one <main> landmark (itself, a component, or a layout above it)', () => {
		// The app/auth/marketing/public-DZ layouts provide <main id="main">; +page@ pages
		// (print sheets, hangar boards) bring their own. Nesting one inside another was how the
		// public hangar TV board ended up inside the booking site's header and footer.
		const withMain = files
			.filter((f) => f.name.startsWith('lib/') && /<main\b/.test(f.text))
			.map((f) => f.name.split('/').pop()!.replace('.svelte', ''));
		expect(withMain).toContain('HangarBoard');
		const hasMain = (text: string) => /<main\b/.test(text) || withMain.some((c) => new RegExp(`<${c}\\b`).test(text));
		const byName = new Map(files.map((f) => [f.name, f.text]));
		const pages = files.filter((f) => /\+page(@[^/]*)?\.svelte$/.test(f.name) && !f.text.includes('never rendered'));
		expect(pages.length).toBeGreaterThan(30);
		const bad: string[] = [];
		for (const f of pages) {
			let count = hasMain(f.text) ? 1 : 0;
			if (!f.name.includes('+page@')) {
				const dirs = f.name.split('/').slice(0, -1);
				for (let i = dirs.length; i >= 1; i--) {
					const layout = byName.get([...dirs.slice(0, i), '+layout.svelte'].join('/'));
					if (layout && hasMain(layout)) count++;
				}
			}
			if (count !== 1) bad.push(`${f.name} (${count})`);
		}
		expect(bad).toEqual([]);
	});

	test('responsive grids set a base column (grid-cols-1), so long text cannot widen phones', () => {
		// A bare `grid sm:grid-cols-2` sizes its one implicit column to min-content: a `truncate`
		// child (a long dropzone or jumper name) then pushes the card past the viewport.
		const bad: string[] = [];
		for (const f of files) {
			for (const m of f.text.matchAll(/(?:class="|['`])([^"'`{}\n]*)["'`]/g)) {
				const toks = m[1].split(/\s+/);
				if (!toks.includes('grid')) continue;
				if (!toks.some((t) => /^[@\w[\]-]+:grid-cols-/.test(t))) continue;
				if (toks.some((t) => t.startsWith('grid-cols-'))) continue;
				bad.push(`${f.name}:${lineOf(f.text, m.index)}`);
			}
		}
		expect(bad).toEqual([]);
	});

	test('light-mode chips on a pale colour tint use a dark enough text shade (WCAG 4.5:1)', () => {
		// `bg-amber-500/12 text-amber-700` measures 4.2–4.6:1 on the light page/surface-2
		// colours; sky-600 on a sky tint is 3.4:1. Warm hues need -800, cool hues -700.
		const minShade: Record<string, number> = { amber: 800, yellow: 800, orange: 800, lime: 800, sky: 700, cyan: 700, teal: 700, emerald: 700, green: 700 };
		const bad: string[] = [];
		for (const f of files) {
			for (const m of f.text.matchAll(/(?:class="|['`])([^"'`{}\n]*)["'`]/g)) {
				const toks = m[1].split(/\s+/);
				if (!toks.some((t) => /^bg-\w+-[1-5]00\/\d+$/.test(t))) continue;
				for (const t of toks) {
					const c = /^text-(\w+)-(\d+)$/.exec(t);
					if (c && minShade[c[1]] && Number(c[2]) < minShade[c[1]]) bad.push(`${f.name}:${lineOf(f.text, m.index)} ${t}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	test('horizontally scrollable <pre> blocks can take keyboard focus', () => {
		const bad: string[] = [];
		for (const f of files) {
			for (const m of f.text.matchAll(/<pre\b([^>]*)>/g)) {
				if (/overflow-(x-)?auto/.test(m[1]) && !/tabindex="0"/.test(m[1])) bad.push(`${f.name}:${lineOf(f.text, m.index)}`);
			}
		}
		expect(bad).toEqual([]);
	});

	test('primary-coloured links inside a sentence are underlined (axe link-in-text-block)', () => {
		// Blue link text next to muted text is ~1.1:1 apart in dark mode: colour alone doesn't
		// mark it as a link, so in-sentence links need `underline` (not just hover:underline).
		const bad: string[] = [];
		for (const f of files) {
			for (const line of f.text.split('\n').map((l, i) => ({ l, i }))) {
				for (const m of line.l.matchAll(/<a\b[^>]*\bclass="([^"]*)"[^>]*>[^<]*<\/a/g)) {
					const toks = m[1].split(/\s+/);
					if (!toks.includes('text-primary') || toks.includes('underline')) continue;
					const before = line.l.slice(0, m.index).replace(/<[^>]*>|\{[^}]*\}/g, '');
					const after = line.l.slice(m.index + m[0].length).replace(/^[^>]*>/, '').replace(/<[^>]*>|\{[^}]*\}/g, '');
					if (/[A-Za-z]{2}/.test(before) || /[A-Za-z]{2}/.test(after)) bad.push(`${f.name}:${line.i + 1}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	test('<dl> starts with a term, not a heading or paragraph', () => {
		const bad: string[] = [];
		for (const f of files) {
			for (const m of f.text.matchAll(/<dl\b[^>]*>\s*<(p|h[1-6])\b/g)) bad.push(`${f.name}:${lineOf(f.text, m.index)}`);
		}
		expect(bad).toEqual([]);
	});

	test('every page renders an <h1> (itself, through a component, or from a layout above it)', () => {
		// axe page-has-heading-one: the full-page tandem booking and the /pay hand-off had none.
		const h1Components = files
			.filter((f) => f.name.startsWith('lib/') && /<h1\b/.test(f.text))
			.map((f) => f.name.split('/').pop()!.replace('.svelte', ''));
		const hasH1 = (text: string) =>
			/<h1\b|\blevel=\{1\}/.test(text) || h1Components.some((c) => new RegExp(`<${c}\\b`).test(text));
		const byName = new Map(files.map((f) => [f.name, f.text]));
		const pages = files.filter((f) => /\+page(@[^/]*)?\.svelte$/.test(f.name) && !f.text.includes('never rendered'));
		expect(pages.length).toBeGreaterThan(30);
		const missing = pages
			.filter((f) => {
				if (hasH1(f.text)) return false;
				if (f.name.includes('+page@')) return true; // resets the layouts: must carry its own
				const dirs = f.name.split('/').slice(0, -1);
				for (let i = dirs.length; i >= 1; i--) {
					const layout = byName.get([...dirs.slice(0, i), '+layout.svelte'].join('/'));
					if (layout && hasH1(layout)) return false;
				}
				return true;
			})
			.map((f) => f.name);
		expect(missing).toEqual([]);
	});
});
