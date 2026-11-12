import type { Cookies } from '@sveltejs/kit';
import { SESSION_COOKIE } from './session';

/** HttpOnly + SameSite=Lax; `secure` follows the request protocol (localhost http works in dev). */
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date, secure: boolean) {
	cookies.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: 'lax',
		secure,
		path: '/',
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies, secure: boolean) {
	cookies.delete(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
