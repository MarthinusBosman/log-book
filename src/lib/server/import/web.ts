/**
 * Route glue for the import pages (/app/import and /app/settings/import): staging an upload as a
 * private `files` row (purpose `import`) between the preview and confirm steps, the connector's
 * public config, and the shared load/actions used by both pages.
 */
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { dropzones, files, importJobs, type ImportJob } from '../db/schema.ts';
import { getStorage } from '../storage/index.ts';
import { deleteFile, readFileBlob, saveFile, MAX_UPLOAD_BYTES } from '../domain/files.ts';
import { requireCan } from '../domain/permissions.ts';
import { isDomainError } from '../domain/errors.ts';
import { DZ_COOKIE, listMemberships } from '../dropzones/index.ts';
import { BundleError, parseBundle, type Bundle } from '../../import/bundle.ts';
import { CSV_FIELDS, csvToBundle, type CsvMapping, type DateOrder } from '../../import/csv.ts';
import { parseImportPayload } from './jumpmaster/index.ts';
import { importBundle, previewBundle, type ImportMode, type ImportPreview } from './apply.ts';

export type ConnectorPublicConfig = {
	projectId: string;
	apiKey: string;
	authBaseUrl?: string;
	firestoreBaseUrl?: string;
};

/** Public web config for the browser connector, or null when the env vars are unset. */
export async function connectorConfig(): Promise<ConnectorPublicConfig | null> {
	const env = await import('$app/env/private');
	if (!env.JUMPMASTER_FIREBASE_PROJECT_ID || !env.JUMPMASTER_FIREBASE_API_KEY) return null;
	return {
		projectId: env.JUMPMASTER_FIREBASE_PROJECT_ID,
		apiKey: env.JUMPMASTER_FIREBASE_API_KEY,
		authBaseUrl: env.JUMPMASTER_AUTH_BASE_URL || undefined,
		firestoreBaseUrl: env.JUMPMASTER_FIRESTORE_BASE_URL || undefined
	};
}

type Staged = { v: 1; mode: ImportMode; source: 'jumpmaster' | 'file'; label: string; warnings: string[]; bundle: Bundle };

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function stage(
	db: Database,
	input: { userId: string; dropzoneId: string | null; mode: ImportMode; source: Staged['source']; label: string; warnings: string[]; bundle: Bundle }
): Promise<string> {
	const staged: Staged = { v: 1, mode: input.mode, source: input.source, label: input.label, warnings: input.warnings, bundle: input.bundle };
	const row = await saveFile(db, await getStorage(), {
		data: enc.encode(JSON.stringify(staged)),
		mime: 'application/json',
		purpose: 'import',
		ownerUserId: input.userId,
		dropzoneId: input.dropzoneId
	});
	return row.id;
}

export async function readStaged(db: Database, userId: string, id: string, mode: ImportMode): Promise<Staged | null> {
	const blob = await readFileBlob(db, await getStorage(), id).catch(() => null);
	if (!blob || blob.row.purpose !== 'import' || blob.row.ownerUserId !== userId) return null;
	try {
		const s = JSON.parse(dec.decode(blob.data)) as Staged;
		if (s.v !== 1 || s.mode !== mode) return null;
		return { ...s, bundle: parseBundle(s.bundle) };
	} catch {
		return null;
	}
}

export async function discardStaged(db: Database, userId: string, id: string): Promise<void> {
	const row = (await db.select().from(files).where(and(eq(files.id, id), eq(files.ownerUserId, userId), eq(files.purpose, 'import'))).limit(1))[0];
	if (row) await deleteFile(db, await getStorage(), row.id);
}

/** Recent import jobs of this user. Dropzone jobs are told apart by their entity counts. */
export async function jobHistory(db: Database, userId: string, mode: ImportMode): Promise<(ImportJob & { kind: ImportMode })[]> {
	const rows = await db.select().from(importJobs).where(eq(importJobs.userId, userId)).orderBy(desc(importJobs.createdAt)).limit(40);
	const dzKeys = ['loads', 'aircraft', 'staff', 'prices', 'dropzone', 'tandems', 'placeholders', 'people.matched'];
	return rows
		.map((r) => ({ ...r, kind: (Object.keys(r.counts ?? {}).some((k) => dzKeys.includes(k)) || r.log.some((l) => l.startsWith('[dropzone]')) ? 'dropzone' : 'jumper') as ImportMode }))
		.filter((r) => r.kind === mode)
		.slice(0, 15);
}

function readMapping(form: FormData): CsvMapping | undefined {
	if (!form.has('map_jumpDate')) return undefined;
	const m = {} as CsvMapping;
	for (const f of CSV_FIELDS) {
		const v = Number(form.get(`map_${f}`) ?? -1);
		m[f] = Number.isInteger(v) && v >= 0 ? v : -1;
	}
	return m;
}

type Ctx = { mode: ImportMode; dropzone: { id: string; timezone: string; currency: string } | null };

/** Resolve the page context and check permissions. */
export async function importContext(event: Pick<RequestEvent, 'locals' | 'cookies'>, mode: ImportMode): Promise<Ctx> {
	const { locals } = event;
	if (!locals.user) redirect(303, '/login');
	if (mode === 'jumper') return { mode, dropzone: null };
	const memberships = await listMemberships(locals.db, locals.user.id);
	const selected = event.cookies.get(DZ_COOKIE);
	const dzSlug = (memberships.find((m) => m.dropzone.slug === selected) ?? memberships[0])?.dropzone.slug;
	if (!dzSlug) error(403, 'Choose a dropzone first.');
	const dz = (await locals.db.select().from(dropzones).where(eq(dropzones.slug, dzSlug)).limit(1))[0];
	if (!dz) error(404, 'Dropzone not found');
	try {
		await requireCan(locals.db, locals.user.id, dz.id, 'dz.settings');
	} catch (e) {
		if (isDomainError(e)) error(403, 'Only the dropzone owner or an admin can import dropzone data.');
		throw e;
	}
	return { mode, dropzone: { id: dz.id, timezone: dz.timezone, currency: dz.currency } };
}

export type ImportPageData = {
	preview: (ImportPreview & { id: string; label: string; stagedWarnings: string[] }) | null;
	job: ImportJob | null;
	jobs: (ImportJob & { kind: ImportMode })[];
};

export async function importPageData(db: Database, userId: string, ctx: Ctx, url: URL): Promise<ImportPageData> {
	const stagedId = url.searchParams.get('staged');
	const jobId = url.searchParams.get('job');
	let preview: ImportPageData['preview'] = null;
	if (stagedId) {
		const s = await readStaged(db, userId, stagedId, ctx.mode);
		if (s) {
			const p = await previewBundle(db, s.bundle, { userId, mode: ctx.mode, dropzoneId: ctx.dropzone?.id });
			preview = { ...p, id: stagedId, label: s.label, stagedWarnings: s.warnings.slice(0, 50) };
		}
	}
	let job: ImportJob | null = null;
	if (jobId) job = (await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId))).limit(1))[0] ?? null;
	return { preview, job, jobs: await jobHistory(db, userId, ctx.mode) };
}

/** Actions shared by both import pages: upload → stage, confirm → import, discard. */
export async function uploadAction(event: RequestEvent, ctx: Ctx, basePath: string) {
	const user = event.locals.user!;
	const form = await event.request.formData();
	const file = form.get('file');
	const source = form.get('source') === 'jumpmaster' ? 'jumpmaster' : 'file';
	if (!(file instanceof File) || file.size === 0) return fail(400, { message: 'Choose a file to upload.' });
	if (file.size > MAX_UPLOAD_BYTES) return fail(400, { message: 'That file is larger than 10 MB.' });
	const text = await file.text();
	const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || (!text.trimStart().startsWith('{') && file.type !== 'application/json');
	let bundle: Bundle;
	let warnings: string[] = [];
	try {
		if (isCsv) {
			if (ctx.mode !== 'jumper') return fail(400, { message: 'CSV logbooks are imported from your personal Import page.' });
			const r = csvToBundle(text, {
				mapping: readMapping(form),
				hasHeader: form.has('hasHeader') ? form.get('hasHeader') === 'on' || form.get('hasHeader') === 'true' : undefined,
				dateOrder: (['auto', 'ymd', 'dmy', 'mdy'].includes(String(form.get('dateOrder'))) ? form.get('dateOrder') : 'auto') as DateOrder,
				name: user.name
			});
			bundle = parseBundle(r.bundle);
			warnings = r.errors.map((e) => e.message);
			if (!bundle.jumper?.jumps?.length) {
				return fail(400, { message: r.errors[0]?.message ?? 'No jumps found in that CSV. Check the column mapping and date format.' });
			}
		} else {
			const parsed = parseImportPayload(text, { timezone: ctx.dropzone?.timezone ?? 'UTC', currency: ctx.dropzone?.currency });
			bundle = parsed.bundle;
			warnings = parsed.warnings;
			// Mapping warnings from the browser connector (it converts before uploading).
			if (source === 'jumpmaster') {
				try {
					const extra = JSON.parse(String(form.get('warnings') ?? '[]'));
					if (Array.isArray(extra)) warnings.push(...extra.slice(0, 200).map((w) => String(w).slice(0, 300)));
				} catch {
					/* ignore */
				}
			}
		}
	} catch (e) {
		if (e instanceof BundleError) return fail(400, { message: e.message });
		throw e;
	}
	if (ctx.mode === 'jumper' && !bundle.jumper) return fail(400, { message: 'That file has no personal logbook. Dropzone exports are imported under Settings → Import.' });
	if (ctx.mode === 'dropzone' && !bundle.dropzone) return fail(400, { message: 'That file has no dropzone data. Personal logbooks are imported from your own Import page.' });
	const label = source === 'jumpmaster' ? 'Jump Master account' : file.name.slice(0, 120);
	const id = await stage(event.locals.db, { userId: user.id, dropzoneId: ctx.dropzone?.id ?? null, mode: ctx.mode, source, label, warnings, bundle });
	redirect(303, `${basePath}?staged=${id}`);
}

export async function confirmAction(event: RequestEvent, ctx: Ctx, basePath: string) {
	const user = event.locals.user!;
	const form = await event.request.formData();
	const id = String(form.get('staged') ?? '');
	const s = id ? await readStaged(event.locals.db, user.id, id, ctx.mode) : null;
	if (!s) return fail(400, { message: 'That upload has expired. Upload the file again.' });
	const result = await importBundle(event.locals.db, s.bundle, {
		userId: user.id,
		mode: ctx.mode,
		dropzoneId: ctx.dropzone?.id ?? null,
		source: s.source,
		warnings: ctx.mode === 'dropzone' ? ['[dropzone] import into this dropzone', ...s.warnings] : s.warnings
	});
	await discardStaged(event.locals.db, user.id, id);
	redirect(303, `${basePath}?job=${result.jobId}`);
}

export async function discardAction(event: RequestEvent, basePath: string) {
	const form = await event.request.formData();
	const id = String(form.get('staged') ?? '');
	if (id) await discardStaged(event.locals.db, event.locals.user!.id, id);
	redirect(303, basePath);
}

/** Housekeeping: drop staged uploads of this user older than a day. */
export async function pruneStaged(db: Database, userId: string, now = Date.now()) {
	const old = await db
		.select({ id: files.id, createdAt: files.createdAt })
		.from(files)
		.where(and(eq(files.ownerUserId, userId), eq(files.purpose, 'import')));
	const stale = old.filter((f) => now - f.createdAt.getTime() > 86_400_000).map((f) => f.id);
	if (!stale.length) return;
	const storage = await getStorage();
	for (const id of stale) await deleteFile(db, storage, id);
}
