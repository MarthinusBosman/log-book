/**
 * Federation outbox (dropzone instances). Logbook entries of jumpers who linked a global account
 * are queued here when a load completes, then pushed to the global instance by
 * `#lib/server/import/federation/client.ts` (see docs/ARCHITECTURE.md → Federation).
 *
 * `linked_accounts` rows whose issuer starts with `instance:` are *grants* on the global instance
 * (same table, other side of the link) and are never treated as outgoing links.
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, lte, not, like, or, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { federationOutbox, linkedAccounts, logbookJumps, type LogbookJump } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { chunkedInsert, type Statement } from './atomic.ts';

export const GRANT_ISSUER_PREFIX = 'instance:';

/** Snapshot of a logbook jump as sent to the global instance. */
export type FederatedJump = {
	id: string;
	jumpNumber: number;
	jumpDate: string;
	location: string | null;
	aircraft: string | null;
	altitudeFt: number | null;
	freefallSeconds: number | null;
	jumpType: string | null;
	description: string | null;
	verified: boolean;
	loadId: string | null;
	updatedAt: string;
};

export function jumpSnapshot(j: Pick<LogbookJump, keyof Omit<FederatedJump, 'updatedAt'>> & { updatedAt?: Date | null }): FederatedJump {
	return {
		id: j.id,
		jumpNumber: j.jumpNumber,
		jumpDate: j.jumpDate,
		location: j.location ?? null,
		aircraft: j.aircraft ?? null,
		altitudeFt: j.altitudeFt ?? null,
		freefallSeconds: j.freefallSeconds ?? null,
		jumpType: j.jumpType ?? null,
		description: j.description ?? null,
		verified: !!j.verified,
		loadId: j.loadId ?? null,
		updatedAt: (j.updatedAt ?? new Date()).toISOString()
	};
}

/** Local users (of `userIds`) that have an outgoing global link. */
export async function linkedUserIds(db: Database, userIds: string[]): Promise<Set<string>> {
	if (!userIds.length) return new Set();
	const rows = await db
		.select({ userId: linkedAccounts.userId })
		.from(linkedAccounts)
		.where(and(inArray(linkedAccounts.userId, userIds), not(like(linkedAccounts.issuer, `${GRANT_ISSUER_PREFIX}%`))));
	return new Set(rows.map((r) => r.userId));
}

/** Outbox inserts for new logbook rows of linked jumpers (to run in the same atomic batch). */
export async function outboxStatementsForJumps(
	db: Database,
	jumps: (typeof logbookJumps.$inferInsert)[],
	now = Date.now()
): Promise<Statement[]> {
	const linked = await linkedUserIds(db, [...new Set(jumps.map((j) => j.userId))]);
	const rows = jumps
		.filter((j) => linked.has(j.userId) && j.id)
		.map((j) => ({
			id: newId(),
			userId: j.userId,
			kind: 'jump_upsert' as const,
			entityId: j.id!,
			payload: jumpSnapshot({
				id: j.id!,
				jumpNumber: j.jumpNumber,
				jumpDate: j.jumpDate,
				location: j.location ?? null,
				aircraft: j.aircraft ?? null,
				altitudeFt: j.altitudeFt ?? null,
				freefallSeconds: j.freefallSeconds ?? null,
				jumpType: j.jumpType ?? null,
				description: j.description ?? null,
				verified: !!j.verified,
				loadId: j.loadId ?? null,
				updatedAt: new Date(now)
			}),
			createdAt: new Date(now)
		}));
	return rows.length ? chunkedInsert(db, federationOutbox, rows) : [];
}

/** Queue a user's existing dropzone-verified jumps (backfill right after linking). */
export async function enqueueUserJumps(db: Database, userId: string, now = Date.now()): Promise<number> {
	const jumps = await db
		.select()
		.from(logbookJumps)
		.where(and(eq(logbookJumps.userId, userId), eq(logbookJumps.source, 'load')));
	if (!jumps.length) return 0;
	const queued = new Set(
		(
			await db
				.select({ e: federationOutbox.entityId })
				.from(federationOutbox)
				.where(and(eq(federationOutbox.userId, userId), eq(federationOutbox.kind, 'jump_upsert')))
		).map((r) => r.e)
	);
	const rows = jumps
		.filter((j) => !queued.has(j.id))
		.map((j) => ({
			id: newId(),
			userId,
			kind: 'jump_upsert' as const,
			entityId: j.id,
			payload: jumpSnapshot(j),
			createdAt: new Date(now)
		}));
	if (rows.length) for (const s of chunkedInsert(db, federationOutbox, rows)) await s;
	return rows.length;
}

const due = (now: number) =>
	and(isNull(federationOutbox.sentAt), or(isNull(federationOutbox.nextAttemptAt), lte(federationOutbox.nextAttemptAt, new Date(now))));

export async function hasDueOutbox(db: Database, now = Date.now()): Promise<boolean> {
	return !!(await db.select({ id: federationOutbox.id }).from(federationOutbox).where(due(now)).limit(1))[0];
}

export async function dueOutbox(db: Database, limit = 100, now = Date.now()) {
	return db.select().from(federationOutbox).where(due(now)).orderBy(asc(federationOutbox.createdAt)).limit(limit);
}

/** Backoff: 1, 2, 4 … minutes, capped at 6 hours. */
export function nextAttemptDelay(attempts: number): number {
	return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);
}

export async function markSent(db: Database, ids: string[], now = Date.now()) {
	if (ids.length) await db.update(federationOutbox).set({ sentAt: new Date(now), lastError: null }).where(inArray(federationOutbox.id, ids));
}

export async function markFailed(db: Database, ids: string[], message: string, now = Date.now()) {
	for (const id of ids) {
		const row = (await db.select({ attempts: federationOutbox.attempts }).from(federationOutbox).where(eq(federationOutbox.id, id)).limit(1))[0];
		if (!row) continue;
		const attempts = row.attempts + 1;
		await db
			.update(federationOutbox)
			.set({ attempts, lastError: message.slice(0, 500), nextAttemptAt: new Date(now + nextAttemptDelay(attempts)) })
			.where(eq(federationOutbox.id, id));
	}
}

export async function outboxStats(db: Database) {
	const [pending] = await db.select({ n: count() }).from(federationOutbox).where(isNull(federationOutbox.sentAt));
	const [sent] = await db.select({ n: count() }).from(federationOutbox).where(isNotNull(federationOutbox.sentAt));
	const [failing] = await db
		.select({ n: count() })
		.from(federationOutbox)
		.where(and(isNull(federationOutbox.sentAt), sql`${federationOutbox.attempts} > 0`));
	const last = (
		await db
			.select({ lastError: federationOutbox.lastError, attempts: federationOutbox.attempts })
			.from(federationOutbox)
			.where(and(isNull(federationOutbox.sentAt), isNotNull(federationOutbox.lastError)))
			.limit(1)
	)[0];
	return { pending: pending.n, sent: sent.n, failing: failing.n, lastError: last?.lastError ?? null };
}
