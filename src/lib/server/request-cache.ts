/**
 * Per-request read cache. The /app layout and the page loads under it each resolve the user's
 * memberships and the active dropzone row; on D1 every duplicate is another round trip.
 *
 * `hooks.server.ts` gives GET/HEAD requests a fresh `locals.cache`. Other methods get none, so a
 * form action (which may change memberships or dropzone settings) and the page load that renders
 * after it always read the database directly.
 */
import { eq } from 'drizzle-orm';
import { dropzones, type Dropzone } from './db/schema.ts';
import { DZ_COOKIE, listMemberships, type Membership } from './dropzones/index.ts';

type CacheLocals = Pick<App.Locals, 'db' | 'cache'>;

/** True for request methods that may share cached reads (no form action runs). */
export function cacheableMethod(method: string): boolean {
	return method === 'GET' || method === 'HEAD';
}

/** Memoise `fn` under `key` for the rest of the request (no-op when the request has no cache). */
export function cached<T>(locals: Pick<App.Locals, 'cache'>, key: string, fn: () => Promise<T>): Promise<T> {
	const cache = locals.cache;
	if (!cache) return fn();
	let hit = cache.get(key) as Promise<T> | undefined;
	if (!hit) {
		hit = fn();
		cache.set(key, hit);
		// A failed read must not poison later callers.
		hit.catch(() => cache.delete(key));
	}
	return hit;
}

/** The user's active memberships (same as `listMemberships`, cached per request). */
export function requestMemberships(locals: CacheLocals, userId: string): Promise<Membership[]> {
	return cached(locals, `memberships:${userId}`, () => listMemberships(locals.db, userId));
}

/** The active membership: the `dz` cookie's dropzone if the user belongs to it, else the first one. */
export async function currentMembership(
	event: { locals: CacheLocals; cookies: { get(name: string): string | undefined } },
	userId: string
): Promise<Membership | null> {
	const memberships = await requestMemberships(event.locals, userId);
	const selected = event.cookies.get(DZ_COOKIE);
	return memberships.find((m) => m.dropzone.slug === selected) ?? memberships[0] ?? null;
}

/** Full dropzone row by id, cached per request. */
export function requestDropzone(locals: CacheLocals, id: string): Promise<Dropzone | undefined> {
	return cached(locals, `dropzone:${id}`, async () => (await locals.db.select().from(dropzones).where(eq(dropzones.id, id)).limit(1))[0]);
}
