import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Database } from '../db/index.ts';

/** A built (not yet awaited) Drizzle query, e.g. `db.update(t).set(...).where(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Statement = any;

/**
 * Execute write statements atomically on both drivers — D1 has no interactive transactions:
 *  - D1 (has `db.batch`): one batch → one implicit transaction.
 *  - bun:sqlite: a synchronous `db.transaction` running each statement with `.run()`, so no other
 *    async work can interleave on the shared connection.
 * Build every statement from `db` *before* calling; do reads first, then batch the writes.
 */
export async function runAtomic(db: Database, statements: Statement[]): Promise<void> {
	const list = statements.filter(Boolean);
	if (list.length === 0) return;
	const maybeBatch = db as unknown as { batch?: (q: Statement[]) => Promise<unknown> };
	if (typeof maybeBatch.batch === 'function') {
		await maybeBatch.batch(list);
		return;
	}
	const tx = (db as unknown as { transaction: (fn: () => void) => unknown }).transaction.bind(db);
	tx(() => {
		for (const s of list) {
			const r = s.run();
			if (r && typeof (r as Promise<unknown>).then === 'function') {
				throw new Error('runAtomic: async statement inside sync transaction');
			}
		}
	});
}

/** D1 allows at most 100 bound parameters per statement. */
export const D1_MAX_PARAMS = 100;

/**
 * Multi-row insert split into statements that stay under D1's bound-parameter limit
 * (Drizzle binds every column of every row). Returns statements for `runAtomic`.
 */
export function chunkedInsert<T extends SQLiteTable>(
	db: Database,
	table: T,
	rows: T['$inferInsert'][],
	opts: { onConflictDoNothing?: boolean } = {}
): Statement[] {
	if (rows.length === 0) return [];
	const cols = Object.keys(getTableColumns(table)).length;
	const per = Math.max(1, Math.floor(D1_MAX_PARAMS / cols));
	const out: Statement[] = [];
	for (let i = 0; i < rows.length; i += per) {
		const q = db.insert(table).values(rows.slice(i, i + per));
		out.push(opts.onConflictDoNothing ? q.onConflictDoNothing() : q);
	}
	return out;
}
