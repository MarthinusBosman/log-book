/**
 * Consistent online backup of the self-hosted SQLite database (safe while the app is running).
 *
 *   bun scripts/backup.ts [dest-dir] [--keep N]
 *   docker compose exec app bun scripts/backup.ts            # → /data/backups/app-<timestamp>.db
 *
 * Uses `VACUUM INTO` (a transactionally consistent, compacted copy). Uploaded files live in
 * UPLOADS_DIR (unless STORAGE_DRIVER=db) and must be copied separately — see docs/SELF_HOSTING.md.
 * Keeps the newest N backups in dest-dir (default 14).
 */
import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const keepIdx = args.indexOf('--keep');
const keep = keepIdx >= 0 ? Number(args.splice(keepIdx, 2)[1]) : 14;
const source = resolve(process.env.DATABASE_PATH || 'data/app.db');
const dest = resolve(args[0] || join(dirname(source), 'backups'));
mkdirSync(dest, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(dest, `app-${stamp}.db`);
const db = new Database(source, { readonly: true });
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const check = new Database(target, { readonly: true });
const ok = (check.query('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
check.close();
if (ok !== 'ok') throw new Error(`integrity_check failed for ${target}: ${ok}`);
console.info(`[backup] ${target} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);

if (Number.isFinite(keep) && keep > 0) {
	const old = readdirSync(dest)
		.filter((f) => /^app-.*\.db$/.test(f))
		.sort()
		.slice(0, -keep);
	for (const f of old) rmSync(join(dest, f));
	if (old.length) console.info(`[backup] pruned ${old.length} old backup(s)`);
}
