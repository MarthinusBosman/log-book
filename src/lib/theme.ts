export type Theme = 'dark' | 'light';
/** What the page renders with: a visitor's choice, or a dropzone default that may follow the OS. */
export type PageTheme = Theme | 'system';
export const THEME_COOKIE = 'theme';
export const DEFAULT_THEME: Theme = 'dark';

export function parseTheme(value: string | undefined | null): Theme {
	return value === 'light' ? 'light' : DEFAULT_THEME;
}

export const THEME_COLORS: Record<Theme, string> = {
	dark: '#060b17',
	light: '#f6f8fc'
};

/** `<html>` class for a page theme (`system` → CSS media queries decide, see app.css). */
export function themeClass(t: PageTheme): string {
	return t === 'dark' ? 'dark' : t === 'system' ? 'system' : '';
}
