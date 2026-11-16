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

/**
 * The theme the no-JS switch (POST /theme) picks: the opposite of what the page showed (`current`,
 * sent by the app's toggle, which knows a dropzone default the cookie lacks), else of the cookie.
 */
export function nextTheme(cookie: string | undefined | null, current?: string | null): Theme {
	const shown = current === 'light' || current === 'dark' ? current : parseTheme(cookie);
	return shown === 'dark' ? 'light' : 'dark';
}
