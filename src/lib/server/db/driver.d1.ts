import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Database } from './index';

/** D1 binding name — must match `d1_databases[].binding` in wrangler.jsonc. */
const BINDING = 'DB';

type D1Binding = Parameters<typeof drizzle>[0];

export function getD1Database(): Database {
	const d1 = env[BINDING] as D1Binding | undefined;
	if (!d1) {
		throw new Error(`D1 binding "${BINDING}" is missing — check wrangler.jsonc`);
	}
	return drizzle(d1, { schema }) as unknown as Database;
}
