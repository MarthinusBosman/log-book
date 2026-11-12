import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { importJobs, type ImportCounts, type ImportJob } from '../db/schema.ts';
import { newId } from '../auth/token.ts';

/** Import job bookkeeping ("Import from Jump Master"). The importer itself is a later module. */
export async function startImportJob(db: Database, userId: string, source: ImportJob['source'] = 'jumpmaster', now = Date.now()): Promise<ImportJob> {
	return (
		await db
			.insert(importJobs)
			.values({ id: newId(), userId, source, status: 'running', startedAt: new Date(now), createdAt: new Date(now) })
			.returning()
	)[0];
}

export async function finishImportJob(
	db: Database,
	jobId: string,
	result: { ok: boolean; counts: ImportCounts; log?: string[]; error?: string | null },
	now = Date.now()
): Promise<void> {
	await db
		.update(importJobs)
		.set({
			status: result.ok ? 'succeeded' : 'failed',
			counts: result.counts,
			log: result.log ?? [],
			error: result.error ?? null,
			finishedAt: new Date(now)
		})
		.where(eq(importJobs.id, jobId));
}

export async function listImportJobs(db: Database, userId: string): Promise<ImportJob[]> {
	return db.select().from(importJobs).where(eq(importJobs.userId, userId)).orderBy(desc(importJobs.createdAt)).limit(20);
}
