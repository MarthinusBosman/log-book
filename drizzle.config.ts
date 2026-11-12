import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations into ./drizzle — consumed by both
// `wrangler d1 migrations apply` (D1) and the bun-sqlite migrator (on startup).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	casing: 'snake_case',
	strict: true,
	verbose: true
});
