import { DATABASE_PATH, MIGRATIONS_DIR } from '$app/env/private';
import { openSqlite } from './sqlite';
import type { Database } from './index';

/** Self-hosted (Bun) target: one long-lived SQLite connection, migrated on startup. */
export function getBunDatabase(): Database {
	const db = openSqlite({ path: DATABASE_PATH, migrationsFolder: MIGRATIONS_DIR });
	console.info(`[db] bun:sqlite ready at ${DATABASE_PATH}`);
	return db;
}
