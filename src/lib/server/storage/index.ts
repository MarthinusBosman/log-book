import type { Storage } from './types.ts';

export type { Storage } from './types.ts';

export type StorageDriver = 'disk' | 'db' | 'r2';

let storage: Promise<Storage> | undefined;

/** STORAGE_DRIVER, or the target default: `r2` on Cloudflare (falls back to D1 without a binding), `disk` on bun. */
export function resolveStorageDriver(value: string | undefined, target: 'bun' | 'cloudflare'): StorageDriver {
	const v = (value ?? '').trim().toLowerCase();
	if (v === 'disk' || v === 'local') {
		if (target === 'cloudflare') throw new Error('STORAGE_DRIVER=disk is not available on Cloudflare (use db or r2)');
		return 'disk';
	}
	if (v === 'db' || v === 'd1') return 'db';
	if (v === 'r2') return 'r2';
	if (v) throw new Error(`STORAGE_DRIVER must be disk, db or r2, got "${value}"`);
	return target === 'cloudflare' ? 'r2' : 'disk';
}

/**
 * Storage for the current deploy target (build-time constant, like getDb). Driver from
 * STORAGE_DRIVER (disk | db | r2):
 *   bun        → disk (UPLOADS_DIR) by default; `db` keeps everything in the SQLite file
 *   cloudflare → r2 (binding FILES) by default, reading older D1 blobs as a fallback; `db` keeps
 *                everything in D1 `file_blobs`. Without a FILES binding r2 degrades to db (warns).
 */
export async function getStorage(): Promise<Storage> {
	storage ??= (async () => {
		const { STORAGE_DRIVER } = await import('$app/env/private');
		const driver = resolveStorageDriver(STORAGE_DRIVER, __DEPLOY_TARGET__);
		if (driver === 'db') {
			const [{ getDb }, { DbStorage }] = await Promise.all([import('../db/index.ts'), import('./db.ts')]);
			return new DbStorage(await getDb());
		}
		if (__DEPLOY_TARGET__ === 'cloudflare') {
			const { env } = await import('cloudflare:workers');
			const [{ R2Storage }, { FallbackStorage }, { DbStorage }, { getDb }] = await Promise.all([
				import('./r2.ts'),
				import('./fallback.ts'),
				import('./db.ts'),
				import('../db/index.ts')
			]);
			const legacy = new DbStorage(await getDb());
			const bucket = (env as Record<string, unknown>).FILES;
			if (!bucket) {
				console.warn('[storage] STORAGE_DRIVER=r2 but the R2 binding "FILES" is missing — storing files in D1 instead');
				return legacy;
			}
			return new FallbackStorage(new R2Storage(bucket as import('./r2.ts').R2BucketLike), legacy);
		}
		if (driver === 'r2') throw new Error('STORAGE_DRIVER=r2 is only available on the Cloudflare target');
		const { UPLOADS_DIR } = await import('$app/env/private');
		const { LocalStorage } = await import('./local.ts');
		return new LocalStorage(UPLOADS_DIR);
	})();
	const current = storage;
	current.catch(() => {
		if (storage === current) storage = undefined; // retry on the next call
	});
	return current;
}
