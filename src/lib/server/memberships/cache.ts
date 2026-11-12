/** Tiny key/value cache in `provider_cache` (works the same on bun-sqlite and D1). */
import { eq, lt } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { providerCache } from '../db/schema.ts';

export async function cacheGet<T>(db: Database, key: string, now = Date.now()): Promise<{ value: T; fetchedAt: number } | null> {
	const row = (await db.select().from(providerCache).where(eq(providerCache.key, key)).limit(1))[0];
	if (!row || row.expiresAt.getTime() <= now) return null;
	return { value: row.value as T, fetchedAt: row.fetchedAt.getTime() };
}

export async function cachePut(db: Database, key: string, value: unknown, ttlMs: number, now = Date.now()): Promise<void> {
	const row = { key, value, fetchedAt: new Date(now), expiresAt: new Date(now + ttlMs) };
	await db.insert(providerCache).values(row).onConflictDoUpdate({ target: providerCache.key, set: { value, fetchedAt: row.fetchedAt, expiresAt: row.expiresAt } });
}

/** Atomic-enough counter for a fixed window (used as a global hourly request budget). */
export async function cacheIncrement(db: Database, key: string, ttlMs: number, now = Date.now()): Promise<number> {
	const cur = await cacheGet<number>(db, key, now);
	const next = (cur?.value ?? 0) + 1;
	await cachePut(db, key, next, cur ? cur.fetchedAt + ttlMs - now : ttlMs, cur?.fetchedAt ?? now);
	return next;
}

export async function cachePrune(db: Database, now = Date.now()): Promise<void> {
	await db.delete(providerCache).where(lt(providerCache.expiresAt, new Date(now)));
}
