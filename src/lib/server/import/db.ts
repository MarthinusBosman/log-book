/** Small DB helpers for the importer: deterministic ids and chunked multi-row upserts. */
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Database } from '../db/index.ts';
import { D1_MAX_PARAMS, runAtomic, type Statement } from '../domain/atomic.ts';

/**
 * Deterministic UUID-shaped id for an imported entity that has no `source_ref` column
 * (aircraft, loads, slots, teams, booking slots, waiver sections): re-importing the same source
 * row always targets the same primary key, so upserts are idempotent without a schema change.
 */
export function deterministicId(scope: string, ref: string): string {
	const h = encodeHexLowerCase(sha256(new TextEncoder().encode(`${scope}\u0000${ref}`)));
	// RFC 9562 v8 layout (custom), variant bits 10xx.
	const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Multi-row INSERT … ON CONFLICT DO UPDATE statements, chunked under D1's bound-param limit. */
export function upsertStatements<T extends SQLiteTable>(
	db: Database,
	table: T,
	rows: T['$inferInsert'][],
	target: SQLiteColumn | SQLiteColumn[],
	updateKeys: (keyof T['$inferInsert'] & string)[]
): Statement[] {
	if (!rows.length) return [];
	const cols = getTableColumns(table) as Record<string, SQLiteColumn>;
	const per = Math.max(1, Math.floor(D1_MAX_PARAMS / Object.keys(cols).length));
	const set: Record<string, SQL> = {};
	for (const k of updateKeys) set[k] = sql.raw(`excluded."${cols[k].name}"`);
	const out: Statement[] = [];
	for (let i = 0; i < rows.length; i += per) {
		out.push(db.insert(table).values(rows.slice(i, i + per)).onConflictDoUpdate({ target, set }));
	}
	return out;
}

/** Run statements atomically in chunks (each chunk is one D1 batch / one SQLite transaction). */
export async function runChunked(db: Database, statements: Statement[], size = 100): Promise<void> {
	for (let i = 0; i < statements.length; i += size) await runAtomic(db, statements.slice(i, i + size));
}

/** `WHERE col IN (…)` reads split into chunks of ≤ 90 values. */
export async function selectIn<R>(values: string[], run: (chunk: string[]) => Promise<R[]>, size = 90): Promise<R[]> {
	const out: R[] = [];
	const uniq = [...new Set(values)];
	for (let i = 0; i < uniq.length; i += size) out.push(...(await run(uniq.slice(i, i + size))));
	return out;
}

export { inArray };
