import { inArray } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { users } from './db/schema.ts';

/**
 * Profile-picture URLs for a set of users (id → URL; users without a photo are left out).
 * Used by lists built from snapshots (manifest slots) where the row doesn't join `users`.
 */
export async function avatarMap(db: Database, ids: Iterable<string | null | undefined>): Promise<Record<string, string>> {
	const unique = [...new Set([...ids].filter((x): x is string => !!x))];
	if (unique.length === 0) return {};
	const out: Record<string, string> = {};
	// D1 caps bound params at 100 per statement.
	for (let i = 0; i < unique.length; i += 90) {
		const rows = await db
			.select({ id: users.id, avatar: users.avatar })
			.from(users)
			.where(inArray(users.id, unique.slice(i, i + 90)));
		for (const r of rows) if (r.avatar) out[r.id] = r.avatar;
	}
	return out;
}
