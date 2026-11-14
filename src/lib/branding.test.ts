import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	DEFAULT_BRAND_COLOR,
	SURFACES,
	TEXT_TINT,
	brandCss,
	brandPalette,
	brandTheme,
	chipTextColors,
	contrast,
	ensureContrast,
	fromHsl,
	toHsl,
	luminance,
	minContrast,
	mix,
	normalizeHex,
	readBranding,
	readableOn
} from './branding.ts';

describe('colour basics', () => {
	test('normalizeHex accepts #rgb / rrggbb and rejects junk', () => {
		expect(normalizeHex('#FF6A00')).toBe('#ff6a00');
		expect(normalizeHex('f60')).toBe('#ff6600');
		expect(normalizeHex(' #abc ')).toBe('#aabbcc');
		expect(normalizeHex('red')).toBeNull();
		expect(normalizeHex('#12345')).toBeNull();
		expect(normalizeHex('url(x)')).toBeNull();
		expect(normalizeHex(null)).toBeNull();
	});
	test('luminance and WCAG contrast match known values', () => {
		expect(luminance('#000000')).toBe(0);
		expect(luminance('#ffffff')).toBeCloseTo(1, 5);
		expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
		// Reference value: #777777 on white ≈ 4.48:1
		expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
		// Symmetric
		expect(contrast('#ff6a00', '#0b1324')).toBeCloseTo(contrast('#0b1324', '#ff6a00'), 10);
	});
	test('mix interpolates in sRGB', () => {
		expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
		expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
		expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
	});
	test('readableOn picks the label colour with more contrast', () => {
		expect(readableOn('#ff6a00')).toBe('#0b1220'); // orange: dark text
		expect(readableOn('#1e6bff')).toBe('#ffffff');
		expect(readableOn('#14532d')).toBe('#ffffff'); // dark green: white text
		expect(readableOn('#ffeb3b')).toBe('#0b1220');
	});
});

describe('hsl', () => {
	test('round-trips', () => {
		for (const c of ['#ff6a00', '#14532d', '#1e6bff', '#808080', '#000000', '#ffffff']) expect(fromHsl(toHsl(c))).toBe(c);
		expect(Math.round(toHsl('#ff0000').h)).toBe(0);
		expect(Math.round(toHsl('#00ff00').h)).toBe(120);
	});
});

describe('ensureContrast', () => {
	test('leaves passing colours alone', () => {
		const r = ensureContrast('#14532d', SURFACES.light);
		expect(r.adjusted).toBe(false);
		expect(r.color).toBe('#14532d');
	});
	test('darkens on light surfaces / lightens on dark surfaces until ≥ 4.5:1', () => {
		const light = ensureContrast('#ff6a00', SURFACES.light);
		expect(light.adjusted).toBe(true);
		expect(luminance(light.color)).toBeLessThan(luminance('#ff6a00'));
		for (const s of SURFACES.light) expect(contrast(light.color, s)).toBeGreaterThanOrEqual(4.5);

		const dark = ensureContrast('#14532d', SURFACES.dark);
		expect(dark.adjusted).toBe(true);
		expect(luminance(dark.color)).toBeGreaterThan(luminance('#14532d'));
		// hue and saturation preserved (lightness only)
		expect(Math.abs(toHsl(dark.color).h - toHsl('#14532d').h)).toBeLessThan(3);
		expect(Math.abs(toHsl(dark.color).s - toHsl('#14532d').s)).toBeLessThan(0.03);
		for (const s of SURFACES.dark) expect(contrast(dark.color, s)).toBeGreaterThanOrEqual(4.5);
	});
	test('adjusts minimally (lands just above the threshold, keeps the hue)', () => {
		const r = ensureContrast('#ff6a00', SURFACES.light);
		expect(r.ratio).toBeLessThan(5);
		const { r: red, g, b } = { r: parseInt(r.color.slice(1, 3), 16), g: parseInt(r.color.slice(3, 5), 16), b: parseInt(r.color.slice(5, 7), 16) };
		expect(red).toBeGreaterThan(g);
		expect(g).toBeGreaterThanOrEqual(b);
	});
});

describe('brandTheme', () => {
	test('orange: kept in dark mode, darkened (with warning) in light mode, labels ≥ 4.5:1', () => {
		const t = brandTheme('#FF6A00');
		expect(t.base).toBe('#ff6a00');
		expect(t.dark.adjusted).toBe(false);
		expect(t.dark.primary).toBe('#ff6a00');
		expect(t.light.adjusted).toBe(true);
		expect(t.warnings).toHaveLength(1);
		expect(t.warnings[0]).toContain('light backgrounds');
		for (const m of [t.light, t.dark]) {
			expect(m.fgRatio).toBeGreaterThanOrEqual(4.5);
			expect(contrast(m.hover, m.primaryFg)).toBeGreaterThanOrEqual(m.fgRatio - 0.01);
		}
	});
	test('dark green: kept in light mode, lightened in dark mode', () => {
		const t = brandTheme('#14532d');
		expect(t.light.adjusted).toBe(false);
		expect(t.light.primaryFg).toBe('#ffffff');
		expect(t.dark.adjusted).toBe(true);
		expect(t.warnings[0]).toContain('dark backgrounds');
	});
	test('hover moves away from the label colour', () => {
		const orange = brandTheme('#ff6a00').dark; // dark label → hover lighter
		expect(luminance(orange.hover)).toBeGreaterThan(luminance(orange.primary));
		const green = brandTheme('#14532d').light; // white label → hover darker
		expect(luminance(green.hover)).toBeLessThan(luminance(green.primary));
	});
	test('invalid / missing colour falls back to the default', () => {
		expect(brandTheme('nope').isDefault).toBe(true);
		expect(brandTheme(null).base).toBe(DEFAULT_BRAND_COLOR);
	});
	test('palette runs light → dark around the base', () => {
		const p = brandPalette('#ff6a00');
		expect(p[500]).toBe('#ff6a00');
		const order = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => luminance(p[k]));
		for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThan(order[i - 1]);
	});
});

describe('brandCss', () => {
	test('default colour emits nothing; custom colour emits light, dark and system blocks', () => {
		expect(brandCss(null)).toBe('');
		expect(brandCss(DEFAULT_BRAND_COLOR)).toBe('');
		const css = brandCss('#ff6a00');
		expect(css).toStartWith(':root{--dz-primary:');
		expect(css).toContain(':root.dark,.dark{--dz-primary:#ff6a00');
		expect(css).toContain('@media (prefers-color-scheme:dark){:root.system{');
		expect(css).toContain('--dz-primary-fg:#0b1220');
		expect(css).not.toMatch(/[<>]/);
	});
});

describe('readBranding', () => {
	test('sanitises stored settings', () => {
		expect(readBranding({ branding: { color: 'FF6A00', logoFileId: 'f1', theme: 'light' } })).toEqual({ color: '#ff6a00', logoFileId: 'f1', theme: 'light' });
		expect(readBranding({ branding: { color: '</style><script>', theme: 'neon', logoFileId: 3 } })).toEqual({ color: null, logoFileId: null, theme: null });
		expect(readBranding({})).toEqual({ color: null, logoFileId: null, theme: null });
	});
});

describe('default theme tokens (app.css)', () => {
	// The default colour bypasses brandCss (no <style> tag), so app.css must hold the same
	// contrast-safe values the algorithm would generate, or default buttons fail WCAG AA.
	const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
	const blocks = (selector: string) => {
		const out: string[] = [];
		let i = css.indexOf(selector);
		while (i !== -1) {
			const start = css.indexOf('{', i);
			out.push(css.slice(start + 1, css.indexOf('}', start)));
			i = css.indexOf(selector, start);
		}
		return out;
	};
	const token = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
	const t = brandTheme(DEFAULT_BRAND_COLOR);

	test.each([
		[':root {', 'light'],
		['.light-scope {', 'light'],
		['.dark {', 'dark'],
		[':root.system {', 'dark'],
		['.dark-scope {', 'dark']
	] as const)('%s matches brandTheme(default).%s', (selector, mode) => {
		const found = blocks(selector).filter((b) => b.includes('--dz-primary:'));
		expect(found.length).toBeGreaterThan(0);
		for (const b of found) {
			const m = t[mode];
			expect(token(b, '--dz-primary')).toBe(m.primary);
			expect(token(b, '--dz-primary-fg')).toBe(m.primaryFg);
			expect(token(b, '--color-brand-600')).toBe(m.hover);
			expect(token(b, '--color-brand-700')).toBe(m.active);
			expect(contrast(m.primary, m.primaryFg)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(m.hover, m.primaryFg)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test.each([
		[':root {', 'light'],
		['.light-scope {', 'light'],
		['.dark {', 'dark'],
		[':root.system {', 'dark'],
		['.dark-scope {', 'dark']
	] as const)('%s status + primary colours read as text on their own tinted pills (%s)', (selector, mode) => {
		for (const b of blocks(selector).filter((x) => x.includes('--dz-primary:'))) {
			for (const name of ['--dz-primary', '--dz-success', '--dz-warning', '--dz-danger']) {
				const c = token(b, name)!;
				// bg-x/10 and bg-x/15 behind text-x (Badge, notices) on every surface
				expect(minContrast(c, SURFACES[mode], TEXT_TINT)).toBeGreaterThanOrEqual(4.5);
				// solid fills (danger button, "Gear up & go", count badges) are labelled text-bg
				if (name !== '--dz-primary') expect(contrast(c, token(b, '--dz-bg')!)).toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	test.each([
		[':root {', 'light'],
		['.light-scope {', 'light'],
		['.dark {', 'dark'],
		[':root.system {', 'dark'],
		['.dark-scope {', 'dark']
	] as const)('%s text colours read on every surface (%s)', (selector) => {
		const found = blocks(selector).filter((x) => x.includes('--dz-subtle:'));
		expect(found.length).toBeGreaterThan(0);
		for (const b of found) {
			for (const text of ['--dz-fg', '--dz-muted', '--dz-subtle']) {
				for (const surface of ['--dz-bg', '--dz-surface', '--dz-surface-2', '--dz-elevated']) {
					// text-subtle on bg-surface-2 (closed days on the DZ page) was 4.49:1
					const ratio = contrast(token(b, text)!, token(b, surface)!);
					expect({ selector, text, surface, ok: ratio >= 4.5 }).toEqual({ selector, text, surface, ok: true });
				}
			}
		}
	});
});

describe('tinted surfaces', () => {
	test('ensureContrast with a tint also clears the colour mixed into each surface', () => {
		const plain = ensureContrast('#1e6bff', SURFACES.light);
		const tinted = ensureContrast('#1e6bff', SURFACES.light, 4.5, TEXT_TINT);
		expect(minContrast(plain.color, SURFACES.light, TEXT_TINT)).toBeLessThan(4.5);
		for (const s of SURFACES.light) {
			expect(contrast(tinted.color, s)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(tinted.color, mix(s, tinted.color, TEXT_TINT))).toBeGreaterThanOrEqual(4.5);
		}
	});
	test('brandTheme primaries pass on tinted pills in both modes', () => {
		for (const c of ['#ff6a00', '#14532d', '#1e6bff', '#e11d48', '#facc15']) {
			const t = brandTheme(c);
			expect(minContrast(t.light.primary, SURFACES.light, TEXT_TINT)).toBeGreaterThanOrEqual(4.5);
			expect(minContrast(t.dark.primary, SURFACES.dark, TEXT_TINT)).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe('chipTextColors', () => {
	test('instructor colours get readable chip text in both themes', () => {
		// the staff colour palette's purple failed in both themes as raw text (3.1–4.0:1)
		for (const c of ['#a855f7', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#111111', '#fafafa', '#f0f']) {
			const t = chipTextColors(c)!;
			expect(minContrast(t.light, SURFACES.light, TEXT_TINT)).toBeGreaterThanOrEqual(4.5);
			expect(minContrast(t.dark, SURFACES.dark, TEXT_TINT)).toBeGreaterThanOrEqual(4.5);
		}
	});
	test('keeps a colour that already passes and the hue of one that does not', () => {
		expect(chipTextColors('#1d4ed8')!.light).toBe('#1d4ed8');
		const purple = chipTextColors('#a855f7')!;
		expect(Math.abs(toHsl(purple.dark).h - toHsl('#a855f7').h)).toBeLessThan(2);
		expect(Math.abs(toHsl(purple.light).h - toHsl('#a855f7').h)).toBeLessThan(2);
	});
	test('unparseable colours fall back to null', () => {
		expect(chipTextColors(null)).toBeNull();
		expect(chipTextColors('hsl(10 50% 50%)')).toBeNull();
	});
});
