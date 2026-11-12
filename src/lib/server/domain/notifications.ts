import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { notifications, type Notification } from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import { chunkedInsert, runAtomic, type Statement } from './atomic.ts';
import {
	renderNotification,
	type NotificationPayload,
	type NotificationType
} from '../../domain/constants.ts';

export type NotifyInput = {
	userIds: (string | null | undefined)[];
	type: NotificationType;
	dropzoneId?: string | null;
	actorUserId?: string | null;
	payload?: NotificationPayload;
	now?: number;
};

/** Build the inserts (for use inside runAtomic) — [] when there are no recipients. */
export function notifyStatements(db: Database, input: NotifyInput): Statement[] {
	const ids = [...new Set(input.userIds.filter((u): u is string => !!u))];
	if (ids.length === 0) return [];
	const createdAt = new Date(input.now ?? Date.now());
	return chunkedInsert(
		db,
		notifications,
		ids.map((userId) => ({
			id: newId(),
			userId,
			dropzoneId: input.dropzoneId ?? null,
			type: input.type,
			payload: input.payload ?? {},
			actorUserId: input.actorUserId ?? null,
			createdAt
		}))
	);
}

/** Create one notification per recipient. Returns the number created. */
export async function notify(db: Database, input: NotifyInput): Promise<number> {
	const stmts = notifyStatements(db, input);
	await runAtomic(db, stmts);
	return new Set(input.userIds.filter(Boolean)).size;
}

export type RenderedNotification = Notification & { title: string; body: string; href: string | null };

export async function listNotifications(
	db: Database,
	userId: string,
	opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<RenderedNotification[]> {
	const rows = await db
		.select()
		.from(notifications)
		.where(and(eq(notifications.userId, userId), opts.unreadOnly ? eq(notifications.read, false) : undefined))
		.orderBy(desc(notifications.createdAt))
		.limit(opts.limit ?? 50)
		.offset(opts.offset ?? 0);
	return rows.map((n) => ({ ...n, ...renderNotification(n.type, n.payload) }));
}

export async function unreadCount(db: Database, userId: string): Promise<number> {
	const rows = await db
		.select({ n: sql<number>`count(*)` })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
	return Number(rows[0]?.n ?? 0);
}

/** Mark some (ids) or all of a user's notifications read. */
export async function markRead(db: Database, userId: string, ids?: string[], now = Date.now()): Promise<void> {
	if (ids && ids.length === 0) return;
	await db
		.update(notifications)
		.set({ read: true, readAt: new Date(now) })
		.where(
			and(
				eq(notifications.userId, userId),
				eq(notifications.read, false),
				ids ? inArray(notifications.id, ids) : undefined
			)
		);
}
