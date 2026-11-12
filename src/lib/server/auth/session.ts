/**
 * Session management — the Lucia v3 pattern (lucia-auth.com/sessions/basic), by hand.
 * Token lives only in an HttpOnly cookie; the DB stores sha256(token) as the session id.
 * Sessions slide: when less than half the lifetime remains, expiry is pushed out again.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db';
import { sessions, users, type Session, type User } from '../db/schema';
import { generateToken, hashToken } from './token';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 30 * DAY;
export const SESSION_RENEW_THRESHOLD_MS = 15 * DAY;
export const SESSION_COOKIE = 'session';

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'avatar' | 'globalId'>;

export type SessionValidationResult =
	| { session: Session; user: SessionUser }
	| { session: null; user: null };

export function generateSessionToken(): string {
	return generateToken(20);
}

export async function createSession(
	db: Database,
	token: string,
	userId: string,
	meta: { userAgent?: string | null; ip?: string | null } = {},
	now = Date.now()
): Promise<Session> {
	const session: Session = {
		id: hashToken(token),
		userId,
		expiresAt: new Date(now + SESSION_LIFETIME_MS),
		createdAt: new Date(now),
		userAgent: meta.userAgent?.slice(0, 512) ?? null,
		ip: meta.ip ?? null
	};
	await db.insert(sessions).values(session);
	return session;
}

export async function validateSessionToken(
	db: Database,
	token: string,
	now = Date.now()
): Promise<SessionValidationResult> {
	const sessionId = hashToken(token);
	const rows = await db
		.select({
			session: sessions,
			user: {
				id: users.id,
				email: users.email,
				name: users.name,
				avatar: users.avatar,
				globalId: users.globalId
			}
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.limit(1);

	const row = rows[0];
	if (!row) return { session: null, user: null };
	const { session, user } = row;

	if (now >= session.expiresAt.getTime()) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return { session: null, user: null };
	}

	if (now >= session.expiresAt.getTime() - SESSION_RENEW_THRESHOLD_MS) {
		session.expiresAt = new Date(now + SESSION_LIFETIME_MS);
		await db
			.update(sessions)
			.set({ expiresAt: session.expiresAt })
			.where(eq(sessions.id, sessionId));
	}

	return { session, user };
}

export async function invalidateSession(db: Database, sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateAllUserSessions(db: Database, userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}
