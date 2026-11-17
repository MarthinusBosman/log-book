/**
 * Copy text with fallbacks, so a Copy button never silently does nothing.
 *
 * 1. `navigator.clipboard.writeText` (needs a secure context + permission; it is missing on
 *    self-hosted plain-http LAN installs and rejects when the browser denies the permission).
 * 2. The legacy `execCommand('copy')` on a temporary off-screen textarea (works on http too).
 * 3. `prompt(label, text)`: the browser shows the text preselected so the user can copy it by hand.
 *
 * Returns `'copied'` when the text reached the clipboard, `'shown'` when it fell back to the prompt.
 */
export type CopyResult = 'copied' | 'shown';

export interface CopyEnv {
	clipboard?: { writeText(text: string): Promise<void> } | null;
	legacyCopy?: (text: string) => boolean;
	prompt?: (message: string, value: string) => unknown;
}

function legacyCopy(text: string): boolean {
	if (typeof document === 'undefined') return false;
	const active = document.activeElement as HTMLElement | null;
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.setAttribute('readonly', '');
	ta.style.position = 'fixed';
	ta.style.top = '0';
	ta.style.left = '-9999px';
	ta.style.opacity = '0';
	document.body.appendChild(ta);
	ta.select();
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	ta.remove();
	// Keep keyboard focus on the Copy button the user pressed.
	active?.focus?.({ preventScroll: true });
	return ok;
}

function browserEnv(): CopyEnv {
	const nav = typeof navigator === 'undefined' ? undefined : navigator;
	return {
		clipboard: nav?.clipboard ?? null,
		legacyCopy,
		prompt: (m, v) => (typeof window === 'undefined' ? null : window.prompt(m, v))
	};
}

export async function copyText(text: string, label = 'Copy this text', env: CopyEnv = browserEnv()): Promise<CopyResult> {
	if (env.clipboard?.writeText) {
		try {
			await env.clipboard.writeText(text);
			return 'copied';
		} catch {
			/* denied or unavailable: fall through */
		}
	}
	if (env.legacyCopy?.(text)) return 'copied';
	env.prompt?.(label, text);
	return 'shown';
}

/**
 * Share a link with the phone's share sheet (WhatsApp, SMS, …) when it has one, else copy it.
 *
 * Only phones/tablets (coarse pointer) get the share sheet: on desktops copying is what people
 * expect. A dismissed share sheet (`AbortError`) is `'cancelled'` (no fallback, no toast); any
 * other share failure falls back to `copyText`.
 */
export type ShareResult = CopyResult | 'shared' | 'cancelled';

export interface ShareLink {
	url: string;
	title?: string;
	text?: string;
}

export interface ShareEnv extends CopyEnv {
	share?: ((data: ShareLink) => Promise<void>) | null;
}

/** True in a browser with a share sheet that's worth offering (touch device). */
export function canShareLinks(): boolean {
	if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
	if (typeof navigator.share !== 'function') return false;
	return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function browserShareEnv(): ShareEnv {
	return { ...browserEnv(), share: canShareLinks() ? (d) => navigator.share(d) : null };
}

export async function shareOrCopy(link: ShareLink, label = 'Copy this link', env: ShareEnv = browserShareEnv()): Promise<ShareResult> {
	if (env.share) {
		try {
			await env.share(link);
			return 'shared';
		} catch (e) {
			if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
			/* not allowed / unsupported data: fall back to copying */
		}
	}
	return copyText(link.url, label, env);
}
