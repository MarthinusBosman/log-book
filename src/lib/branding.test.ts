import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_BRAND_COLOR,
	SURFACES,
	brandCss,
	brandPalette,
	brandTheme,
	contrast,
	ensureContrast,
	fromHsl,
	toHsl,
	luminance,
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
