import { redirect } from '@sveltejs/kit';
import { nextTheme, THEME_COOKIE } from '#lib/theme.ts';
import type { RequestHandler } from './$types';

/**
 * No-JS theme switch for the marketing pages (which ship without client JS) and the app's
 * ThemeToggle before hydration. With JS both flip the class + cookie in place instead.
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
	const form = await request.formData().catch(() => null);
	const current = form?.get('current');
	cookies.set(THEME_COOKIE, nextTheme(cookies.get(THEME_COOKIE), typeof current === 'string' ? current : null), {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax',
		httpOnly: false
	});
	const back = String(form?.get('redirect') ?? '/');
	redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/');
};
