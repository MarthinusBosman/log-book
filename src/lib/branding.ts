/**
 * Per-dropzone branding: colour maths + the CSS custom properties that re-skin the app.
 * Client-safe (the settings page runs the same code for its live preview); the server
 * computes the CSS for SSR so there's no flash of the default blue.
 *
 * Contrast follows WCAG 2.x relative luminance. The brand colour is used both as a fill
 * (buttons, with an automatically chosen white / near-black label) and as text/links on
 * the page background (`text-primary`), so per theme we nudge it darker (light mode) or
 * lighter (dark mode) until it reaches 4.5:1 against every surface.
 */

export type Rgb = { r: number; g: number; b: number };
export type ThemeChoice = 'system' | 'dark' | 'light';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'dark', 'light'];

/** Stored in `dropzones.settings.branding` (free-form JSON; no schema change). */
export type DropzoneBranding = {
	/** Brand colour as #rrggbb; null/absent = app default blue. */
	color?: string | null;
	/** `files.id` of the uploaded logo (purpose `dz_logo`). */
	logoFileId?: string | null;
	/** Default theme for the DZ's public pages and hangar display (visitors without a choice). */
	theme?: ThemeChoice | null;
};

export const DEFAULT_BRAND_COLOR = '#1e6bff';
export const MIN_CONTRAST = 4.5;

/** Light / dark surfaces the colour must read on (bg, surface, surface-2 from app.css). */
export const SURFACES = {
	light: ['#f6f8fc', '#ffffff', '#f0f3f9'],
	dark: ['#060b17', '#0b1324', '#111b31']
} as const;
const DARK_FG = '#0b1220';

export function normalizeHex(input: string | null | undefined): string | null {
	if (!input) return null;
	const s = input.trim().replace(/^#/, '').toLowerCase();
	if (/^[0-9a-f]{3}$/.test(s)) return '#' + [...s].map((c) => c + c).join('');
	if (/^[0-9a-f]{6}$/.test(s)) return '#' + s;
	return null;
}

export function hexToRgb(hex: string): Rgb {
	const h = normalizeHex(hex);
	if (!h) throw new Error(`Invalid colour ${hex}`);
	const n = parseInt(h.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
	const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	const lin = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

/** Linear mix in sRGB: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
	const p = hexToRgb(a);
	const q = hexToRgb(b);
	return rgbToHex({ r: p.r + (q.r - p.r) * t, g: p.g + (q.g - p.g) * t, b: p.b + (q.b - p.b) * t });
}

/** White or near-black, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
	return contrast(bg, '#ffffff') >= contrast(bg, DARK_FG) ? '#ffffff' : DARK_FG;
}

const minContrast = (color: string, against: readonly string[]) => Math.min(...against.map((s) => contrast(color, s)));

/** sRGB ↔ HSL (h 0–360, s/l 0–1). */
export function toHsl(hex: string): { h: number; s: number; l: number } {
	const { r, g, b } = hexToRgb(hex);
	const [R, G, B] = [r / 255, g / 255, b / 255];
	const max = Math.max(R, G, B);
	const min = Math.min(R, G, B);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
	return { h: h * 60, s, l };
}

export function fromHsl({ h, s, l }: { h: number; s: number; l: number }): string {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

/**
 * Nudge `color` towards black (light surfaces) or white (dark surfaces) in small steps until it
 * reaches `min` contrast against every surface. Returns the original when it already passes.
 */
export function ensureContrast(color: string, against: readonly string[], min = MIN_CONTRAST): { color: string; ratio: number; adjusted: boolean } {
	const base = normalizeHex(color) ?? DEFAULT_BRAND_COLOR;
	const start = minContrast(base, against);
	if (start >= min) return { color: base, ratio: start, adjusted: false };
	// Move lightness only (hue and saturation stay), so a dark green becomes a brighter green on
	// dark backgrounds instead of a washed-out grey-green.
	const lightSurfaces = luminance(against[0]) > 0.5;
	const hsl = toHsl(base);
	for (let step = 1; step <= 100; step++) {
		const l = lightSurfaces ? hsl.l - step * 0.01 : hsl.l + step * 0.01;
		if (l < 0 || l > 1) break;
		const c = fromHsl({ ...hsl, l });
		const r = minContrast(c, against);
		if (r >= min) return { color: c, ratio: r, adjusted: true };
	}
	const target = lightSurfaces ? '#000000' : '#ffffff';
	return { color: target, ratio: minContrast(target, against), adjusted: true };
}

export type ModeColors = {
	/** Fill + text colour for this theme (contrast-adjusted). */
	primary: string;
	/** Label colour on primary fills. */
	primaryFg: string;
	hover: string;
	active: string;
	/** Translucent tint for soft backgrounds / focus ring. */
	ring: string;
	/** Contrast of the ORIGINAL colour on this theme's surfaces. */
	originalRatio: number;
	/** Contrast after adjustment. */
	ratio: number;
	adjusted: boolean;
	/** Label contrast on the fill. */
	fgRatio: number;
};

export type BrandTheme = {
	base: string;
	isDefault: boolean;
	light: ModeColors;
	dark: ModeColors;
	/** brand-50 … brand-950 scale around the base colour (light-mode stops). */
	palette: Record<number, string>;
	warnings: string[];
};

const rgba = (hex: string, a: number) => {
	const { r, g, b } = hexToRgb(hex);
	return `rgb(${r} ${g} ${b} / ${a})`;
};

function modeColors(base: string, mode: 'light' | 'dark'): ModeColors {
	const surfaces = SURFACES[mode];
	const originalRatio = minContrast(base, surfaces);
	const fixed = ensureContrast(base, surfaces);
	const primary = fixed.color;
	const primaryFg = readableOn(primary);
	// Hover/active move away from the label colour so the label keeps (or gains) contrast.
	const away = primaryFg === '#ffffff' ? '#000000' : '#ffffff';
	return {
		primary,
		primaryFg,
		hover: mix(primary, away, 0.14),
		active: mix(primary, away, 0.26),
		ring: rgba(primary, mode === 'dark' ? 0.5 : 0.45),
		originalRatio,
		ratio: fixed.ratio,
		adjusted: fixed.adjusted,
		fgRatio: contrast(primary, primaryFg)
	};
}

export function brandPalette(base: string): Record<number, string> {
	const w = '#ffffff';
	const k = '#000000';
	return {
		50: mix(base, w, 0.93),
		100: mix(base, w, 0.85),
		200: mix(base, w, 0.72),
		300: mix(base, w, 0.52),
		400: mix(base, w, 0.28),
		500: base,
		600: mix(base, k, 0.14),
		700: mix(base, k, 0.28),
		800: mix(base, k, 0.42),
		900: mix(base, k, 0.55),
		950: mix(base, k, 0.7)
	};
}

const fmt = (n: number) => `${(Math.floor(n * 10) / 10).toFixed(1)}:1`;

export function brandTheme(color: string | null | undefined): BrandTheme {
	const base = normalizeHex(color) ?? DEFAULT_BRAND_COLOR;
	const light = modeColors(base, 'light');
	const dark = modeColors(base, 'dark');
	const warnings: string[] = [];
	if (light.adjusted) {
		warnings.push(`${base.toUpperCase()} has ${fmt(light.originalRatio)} contrast on light backgrounds (needs 4.5:1), so light mode uses ${light.primary.toUpperCase()} for buttons and links.`);
	}
	if (dark.adjusted) {
		warnings.push(`${base.toUpperCase()} has ${fmt(dark.originalRatio)} contrast on dark backgrounds (needs 4.5:1), so dark mode uses ${dark.primary.toUpperCase()}.`);
	}
	return { base, isDefault: base === DEFAULT_BRAND_COLOR, light, dark, palette: brandPalette(base), warnings };
}

/** CSS variables for one mode (used by the preview and by `brandCss`). */
export function modeVars(m: ModeColors, palette: Record<number, string>, mode: 'light' | 'dark'): Record<string, string> {
	const vars: Record<string, string> = {
		'--dz-primary': m.primary,
		'--dz-primary-fg': m.primaryFg,
		'--dz-ring': m.ring,
		'--color-brand-600': m.hover,
		'--color-brand-700': m.active,
		'--shadow-glow': `0 0 0 1px ${rgba(m.primary, 0.25)}, 0 8px 30px -8px ${rgba(m.primary, 0.45)}`
	};
	if (mode === 'light') {
		for (const [k, v] of Object.entries(palette)) if (k !== '600' && k !== '700') vars[`--color-brand-${k}`] = v;
		vars['--color-brand-500'] = m.primary;
	} else {
		vars['--color-brand-500'] = m.primary;
		// Light tints used as text on dark (e.g. text-brand-300) must stay readable.
		vars['--color-brand-300'] = mix(m.primary, '#ffffff', 0.45);
		vars['--color-brand-400'] = mix(m.primary, '#ffffff', 0.25);
	}
	return vars;
}

const decl = (vars: Record<string, string>) =>
	Object.entries(vars)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');

/**
 * Stylesheet that re-skins the app for a dropzone. Empty string for the default colour.
 * Selectors match app.css (`:root` light, `.dark` dark, `.system` follows the OS).
 */
export function brandCss(color: string | null | undefined): string {
	const t = brandTheme(color);
	if (t.isDefault) return '';
	const light = decl(modeVars(t.light, t.palette, 'light'));
	const dark = decl(modeVars(t.dark, t.palette, 'dark'));
	return `:root{${light}}:root.dark,.dark{${dark}}@media (prefers-color-scheme:dark){:root.system{${dark}}}`;
}

/** `{@html}`-safe <style> tag (the CSS only ever contains hex/rgb values we generated). */
export function brandStyleTag(color: string | null | undefined): string {
	const css = brandCss(color);
	return css ? `<style id="dz-brand">${css}</style>` : '';
}

export function parseThemeChoice(v: unknown): ThemeChoice | null {
	return v === 'system' || v === 'dark' || v === 'light' ? v : null;
}

/** Read and sanitise `settings.branding`. */
export function readBranding(settings: Record<string, unknown> | null | undefined): Required<DropzoneBranding> {
	const b = (settings?.branding ?? {}) as Record<string, unknown>;
	return {
		color: normalizeHex(typeof b.color === 'string' ? b.color : null),
		logoFileId: typeof b.logoFileId === 'string' && b.logoFileId ? b.logoFileId : null,
		theme: parseThemeChoice(b.theme)
	};
}
