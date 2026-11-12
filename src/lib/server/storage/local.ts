import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assertSafeKey, toBytes, type Storage, type StoredObjectPage } from './types.ts';

/** Self-hosted (Bun) target: files on local disk under `root` (UPLOADS_DIR, default data/uploads). */
export class LocalStorage implements Storage {
	readonly kind = 'local' as const;
	private readonly root: string;
	constructor(root: string) {
		this.root = resolve(root);
	}
	private path(key: string): string {
		assertSafeKey(key);
		const p = resolve(join(this.root, key));
		if (!p.startsWith(this.root)) throw new Error('Path escapes storage root');
		return p;
	}
	async put(key: string, data: Uint8Array | ArrayBuffer, opts: { contentType: string }) {
		const p = this.path(key);
		await mkdir(dirname(p), { recursive: true });
		await writeFile(p, toBytes(data));
		await writeFile(`${p}.meta`, JSON.stringify({ contentType: opts.contentType }));
	}
	async get(key: string) {
		const p = this.path(key);
		try {
			const data = new Uint8Array(await readFile(p));
			let contentType: string | null = null;
			try {
				contentType = JSON.parse(await readFile(`${p}.meta`, 'utf8')).contentType ?? null;
			} catch {
				/* no sidecar */
			}
			return { data, contentType };
		} catch {
			return null;
		}
	}
	async delete(key: string) {
		const p = this.path(key);
		await rm(p, { force: true });
		await rm(`${p}.meta`, { force: true });
	}
	async list(): Promise<StoredObjectPage> {
		const objects: StoredObjectPage['objects'] = [];
		let entries: string[] = [];
		try {
			entries = (await readdir(this.root, { recursive: true })) as string[];
		} catch {
			return { objects, cursor: null };
		}
		for (const rel of entries) {
			const key = rel.split('\\').join('/');
			if (key.endsWith('.meta') || !key.includes('/')) continue;
			try {
				const st = await stat(join(this.root, rel));
				if (st.isFile()) objects.push({ key, uploaded: st.mtime });
			} catch {
				/* vanished */
			}
		}
		return { objects, cursor: null };
	}
	async exists(key: string) {
		try {
			await stat(this.path(key));
			return true;
		} catch {
			return false;
		}
	}
}
