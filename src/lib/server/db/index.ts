import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * Driver-agnostic database type. D1 is async, bun:sqlite is sync — always `await`
 * queries (works for both) and avoid interactive transactions (unsupported on D1;
 * use `db.batch([...])` on D1 when atomicity is needed).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;

let bunDb: Promise<Database> | undefined;

/**
 * Returns the database for the current deploy target.
 * `__DEPLOY_TARGET__` is a build-time constant, so the unused branch (and its
 * dynamic import) is dead-code-eliminated: the Cloudflare bundle never contains bun:sqlite.
 */
export async function getDb(): Promise<Database> {
	if (__DEPLOY_TARGET__ === 'cloudflare') {
		const { getD1Database } = await import('./driver.d1');
		return getD1Database();
	}
	bunDb ??= import('./driver.bun').then((m) => m.getBunDatabase());
	return bunDb;
}

export * as schema from './schema';
