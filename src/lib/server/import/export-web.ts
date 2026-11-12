/** Route glue for /app/export: permission checks and download responses. */
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { logbookJumps, loads, dropzoneMembers, rigs, type Dropzone } from '../db/schema.ts';
import { can } from '../domain/permissions.ts';
import { currentMembership, requestDropzone } from '../request-cache.ts';
import { publicOrigin } from '../config.ts';
import { exportDropzone, exportJumper, exportLogbookCsv } from './export.ts';

/** The active dropzone if the user may export it (`dz.settings`), else null. */
export async function exportableDropzone(event: Pick<RequestEvent, 'locals' | 'cookies'>): Promise<Dropzone | null> {
	const user = event.locals.user;
	if (!user) return null;
	const m = await currentMembership(event, user.id);
	if (!m || !(await can(event.locals.db, user.id, m.dropzone.id, 'dz.settings'))) return null;
	return (await requestDropzone(event.locals, m.dropzone.id)) ?? null;
}

export async function exportSummary(event: Pick<RequestEvent, 'locals' | 'cookies'>) {
	const db = event.locals.db;
	const userId = event.locals.user!.id;
	const [j] = await db.select({ n: count() }).from(logbookJumps).where(eq(logbookJumps.userId, userId));
	const [r] = await db.select({ n: count() }).from(rigs).where(eq(rigs.userId, userId));
	const dz = await exportableDropzone(event);
	let dzStats: { name: string; loads: number; members: number } | null = null;
	if (dz) {
		const [l] = await db.select({ n: count() }).from(loads).where(eq(loads.dropzoneId, dz.id));
		const [m] = await db.select({ n: count() }).from(dropzoneMembers).where(and(eq(dropzoneMembers.dropzoneId, dz.id)));
		dzStats = { name: dz.name, loads: l.n, members: m.n };
	}
	return { jumps: j.n, rigs: r.n, dropzone: dzStats };
}

const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';

function download(body: string, type: string, filename: string) {
	return new Response(body, {
		headers: {
			'content-type': type,
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'private, no-store'
		}
	});
}

export async function downloadJumper(event: RequestEvent, kind: 'json' | 'csv') {
	const user = event.locals.user;
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`);
	const base = `${slug(user.name)}-${stamp()}`;
	if (kind === 'csv') return download(await exportLogbookCsv(event.locals.db, user.id), 'text/csv; charset=utf-8', `logbook-${base}.csv`);
	const b = await exportJumper(event.locals.db, user.id, publicOrigin(event.url.origin));
	return download(JSON.stringify(b, null, 1), 'application/json', `log-book-export-${base}.json`);
}

export async function downloadDropzone(event: RequestEvent) {
	if (!event.locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`);
	const dz = await exportableDropzone(event);
	if (!dz) error(403, 'Only the dropzone owner or an admin can export dropzone data.');
	const b = await exportDropzone(event.locals.db, dz.id, publicOrigin(event.url.origin));
	return download(JSON.stringify(b, null, 1), 'application/json', `log-book-dropzone-${dz.slug}-${stamp()}.json`);
}
