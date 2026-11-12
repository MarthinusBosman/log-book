import { redirect } from '@sveltejs/kit';
import { parseTheme, THEME_COOKIE } from '#lib/theme.ts';
import type { RequestHandler } from './$types';

/**
 * No-JS theme switch for the marketing pages (which ship without client JS).
 * With JS the inline script in the marketing layout flips the class + cookie instead.
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
	const current = parseTheme(cookies.get(THEME_COOKIE));
	cookies.set(THEME_COOKIE, current === 'dark' ? 'light' : 'dark', {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax',
		httpOnly: false
	});
	const form = await request.formData().catch(() => null);
	const back = String(form?.get('redirect') ?? '/');
	redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/');
};
