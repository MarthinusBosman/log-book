import { invalidate } from '$app/navigation';

/**
 * One shared 1 s ticker for every countdown on the page. `skew` aligns the client clock with the
 * server's (`serverNow` from the load function) so countdowns agree across TVs and phones.
 */
class Clock {
	now = $state(Date.now());
	#skew = 0;
	#users = 0;
	#timer: ReturnType<typeof setInterval> | null = null;

	sync(serverNow: number) {
		this.#skew = serverNow - Date.now();
		this.now = Date.now() + this.#skew;
	}

	/** Call from an $effect; returns the cleanup. */
	use(): () => void {
		this.#users++;
		if (!this.#timer) {
			this.now = Date.now() + this.#skew;
			this.#timer = setInterval(() => (this.now = Date.now() + this.#skew), 1000);
		}
		return () => {
			this.#users--;
			if (this.#users <= 0 && this.#timer) {
				clearInterval(this.#timer);
				this.#timer = null;
			}
		};
	}
}
export const clock = new Clock();

/**
 * Lightweight live updates: re-run the load functions that `depends(key)` every `ms` while the tab is
 * visible and `paused()` is false. Works on any host (no websockets). Call inside an $effect.
 */
export function poll(key: string, ms: number, paused: () => boolean = () => false): () => void {
	let busy = false;
	const tick = async () => {
		if (busy || document.hidden || paused()) return;
		busy = true;
		try {
			await invalidate(key);
		} finally {
			busy = false;
		}
	};
	const t = setInterval(tick, ms);
	const onVis = () => {
		if (!document.hidden) tick();
	};
	document.addEventListener('visibilitychange', onVis);
	return () => {
		clearInterval(t);
		document.removeEventListener('visibilitychange', onVis);
	};
}
