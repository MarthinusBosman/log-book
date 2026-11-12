import { Database as Sqlite } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
import type { Database } from './index';

/**
 * Open (and migrate) a bun:sqlite database. Framework-free so tests can use it
 * with `path: ':memory:'`.
 */
export function openSqlite(opts: { path: string; migrationsFolder?: string }): Database {
	if (opts.path !== ':memory:') mkdirSync(dirname(opts.path), { recursive: true });
	const sqlite = new Sqlite(opts.path, { create: true, strict: true });
	sqlite.exec('PRAGMA journal_mode = WAL;');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	sqlite.exec('PRAGMA busy_timeout = 5000;');
	sqlite.exec('PRAGMA synchronous = NORMAL;');
	const db = drizzle(sqlite, { schema });
	if (opts.migrationsFolder) migrate(db, { migrationsFolder: opts.migrationsFolder });
	return db as unknown as Database;
}
