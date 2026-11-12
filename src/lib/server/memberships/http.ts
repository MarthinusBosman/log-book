/**
 * Outbound HTTP for association lookups: identifies the app in the User-Agent, times out, and
 * spaces requests at least `minIntervalMs` apart per host across the whole process (the global
 * "max 1 request/second" rule). Caching and per-user cooldowns are layered on top in service.ts.
 */
import { brand } from '../../brand.ts';
import { ProviderUnavailableError, type HttpGet } from './types.ts';

export const USER_AGENT = `${brand.name}/1.0 (+https://${brand.domain}; association membership check on behalf of the member; ${brand.supportEmail})`;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const nextSlot = new Map<string, number>();

export type HttpOptions = {
	fetch?: Fetch;
	minIntervalMs?: number;
	timeoutMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
};

export function createHttp(opts: HttpOptions = {}): HttpGet {
	const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
	const interval = opts.minIntervalMs ?? 1000;
	const timeout = opts.timeoutMs ?? 10_000;
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const now = opts.now ?? Date.now;
	return async (url) => {
		const host = new URL(url).host;
		const t = now();
		const at = Math.max(t, nextSlot.get(host) ?? 0);
		nextSlot.set(host, at + interval);
		if (at > t) await sleep(at - t);
		let res: Response;
		try {
			res = await doFetch(url, {
				headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8', 'X-Requested-With': 'XMLHttpRequest' },
				redirect: 'follow',
				signal: AbortSignal.timeout(timeout)
			});
		} catch (e) {
			throw new ProviderUnavailableError(e instanceof Error ? e.message : 'Network error');
		}
		return { status: res.status, text: await res.text() };
	};
}

/** Test hook: forget throttle state. */
export function resetThrottle(): void {
	nextSlot.clear();
}
