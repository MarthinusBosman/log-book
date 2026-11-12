/** Only allow same-origin relative redirects (prevents open-redirects via ?redirectTo=). */
export function safeRedirect(target: string | null | undefined, fallback = '/app'): string {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
		return fallback;
	}
	return target;
}
