import { and, eq, inArray, isNotNull, lt, notInArray, or, sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { emailChangeTokens, fileBlobs, files, indemnitySignatures, logbookJumps, passwordResetTokens, sessions, tandemPassengers } from './db/schema.ts';
import type { Storage } from './storage/types.ts';
import { deleteFile } from './domain/files.ts';
import { expireAbandonedCheckouts } from './domain/online-payments.ts';

export type HousekeepingResult = {
	sessions: number;
	/** Expired or used password-reset and email-change links. */
	resetTokens: number;
	orphanBlobs: number;
	/** Online checkouts left pending for 48 h, marked cancelled. */
	abandonedCheckouts: number;
	/** Storage sweep (only when a storage driver is passed). */
	files?: { staleImports: number; legacyPdfs: number; orphanSignatures: number; orphanObjects: number };
	federation?: { sent: number; failed: number; dropped: number } | { skipped: string } | { error: string };
	memberships?: import('./memberships/service.ts').RecheckSummary | { error: string };
};

const HOUR = 3_600_000;

function changes(r: unknown): number {
	// bun:sqlite → { changes }, D1 → { meta: { changes } }
	const x = r as { changes?: number; meta?: { changes?: number } } | undefined;
	return x?.changes ?? x?.meta?.changes ?? 0;
}

/**
 * Periodic cleanup, safe to run any time (idempotent):
 *  - expired sessions and expired/used password-reset tokens (kept 1 day for audit),
 *  - `file_blobs` parts with no `files` row (an upload that failed between storing the bytes and
 *    recording the metadata), once older than an hour,
 *  - online checkouts still pending after 48 h (abandoned at the provider) → cancelled.
 */
export async function runHousekeeping(db: Database, now = Date.now()): Promise<HousekeepingResult> {
	const nowDate = new Date(now);
	const dayAgo = new Date(now - 24 * HOUR);
	const s = await db.delete(sessions).where(lt(sessions.expiresAt, nowDate));
	const t = await db
		.delete(passwordResetTokens)
		.where(or(lt(passwordResetTokens.expiresAt, dayAgo), and(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.usedAt, dayAgo))));
	const e = await db
		.delete(emailChangeTokens)
		.where(or(lt(emailChangeTokens.expiresAt, dayAgo), and(isNotNull(emailChangeTokens.usedAt), lt(emailChangeTokens.usedAt, dayAgo))));
	const b = await db
		.delete(fileBlobs)
		.where(and(lt(fileBlobs.createdAt, new Date(now - HOUR)), notInArray(fileBlobs.key, db.select({ key: files.key }).from(files))));
	const abandonedCheckouts = await expireAbandonedCheckouts(db, now);
	return { sessions: changes(s), resetTokens: changes(t) + changes(e), orphanBlobs: changes(b), abandonedCheckouts };
}

/** Max objects examined per run by the orphan sweep (keeps a cron invocation short). */
const SWEEP_PAGES = 4;
/** Max unreferenced signature images deleted per run. */
const ORPHAN_SIGNATURES_PER_RUN = 100;

/**
 * Storage cleanup (bytes are metered on R2):
 *  - staged import uploads older than a day (a confirmed/discarded import deletes its own),
 *  - legacy stored waiver/tandem PDFs (now rendered on demand): seal the signature's record hash
 *    first, then drop the file (≤ 50 per run),
 *  - signature images older than a day that no logbook jump or waiver signature references,
 *  - objects in the bucket/disk that no `files` row references, older than an hour.
 */
export async function sweepFiles(db: Database, storage: Storage, now = Date.now()) {
	const out = { staleImports: 0, legacyPdfs: 0, orphanSignatures: 0, orphanObjects: 0 };
	const stale = await db
		.select({ id: files.id })
		.from(files)
		.where(and(eq(files.purpose, 'import'), lt(files.createdAt, new Date(now - 24 * HOUR))));
	for (const f of stale) {
		await deleteFile(db, storage, f.id);
		out.staleImports++;
	}

	const pdfs = await db
		.select({ id: files.id })
		.from(files)
		.where(inArray(files.purpose, ['indemnity_pdf', 'tandem_pdf']))
		.limit(50);
	if (pdfs.length) {
		const { sealSignature } = await import('./tandems/documents.ts');
		for (const f of pdfs) {
			const sigs = await db.select().from(indemnitySignatures).where(eq(indemnitySignatures.pdfFileId, f.id));
			for (const sig of sigs) if (!sig.snapshotHash) await sealSignature(db, storage, sig);
			await db.update(indemnitySignatures).set({ pdfFileId: null }).where(eq(indemnitySignatures.pdfFileId, f.id));
			await db.update(tandemPassengers).set({ pdfFileId: null }).where(eq(tandemPassengers.pdfFileId, f.id));
			await deleteFile(db, storage, f.id);
			out.legacyPdfs++;
		}
	}

	// Signature images nobody points at any more: a logbook sign-off cleared by a fact edit, a
	// deleted jump, or a waiver submit that failed after its images were saved. Waiver section
	// signatures are only referenced inside the snapshot JSON, hence the instr() check.
	const orphanSigs = await db
		.select({ id: files.id })
		.from(files)
		.where(
			and(
				eq(files.purpose, 'signature'),
				lt(files.createdAt, new Date(now - 24 * HOUR)),
				sql`not exists (select 1 from ${logbookJumps} where ${logbookJumps.signatureFileId} = ${files.id})`,
				sql`not exists (select 1 from ${indemnitySignatures} where ${indemnitySignatures.signatureFileId} = ${files.id} or ${indemnitySignatures.guardianSignatureFileId} = ${files.id} or instr(${indemnitySignatures.snapshot}, ${files.id}) > 0)`
			)
		)
		.limit(ORPHAN_SIGNATURES_PER_RUN);
	for (const f of orphanSigs) {
		await deleteFile(db, storage, f.id);
		out.orphanSignatures++;
	}

	if (storage.list) {
		let cursor: string | null = null;
		for (let page = 0; page < SWEEP_PAGES; page++) {
			const res = await storage.list(cursor);
			const old = res.objects.filter((o) => !o.uploaded || now - o.uploaded.getTime() > HOUR);
			for (let i = 0; i < old.length; i += 90) {
				const batch = old.slice(i, i + 90).map((o) => o.key);
				const known = new Set((await db.select({ key: files.key }).from(files).where(inArray(files.key, batch))).map((r) => r.key));
				for (const key of batch) {
					if (known.has(key)) continue;
					await storage.delete(key).catch(() => {});
					out.orphanObjects++;
				}
			}
			cursor = res.cursor;
			if (!cursor) break;
		}
	}
	return out;
}

/** Housekeeping + storage sweep + PASA membership re-checks + (dropzone instances) a federation outbox flush. Used by /api/cron. */
export async function runScheduled(db: Database): Promise<HousekeepingResult> {
	const result = await runHousekeeping(db);
	try {
		const { getStorage } = await import('./storage/index.ts');
		result.files = await sweepFiles(db, await getStorage());
	} catch (e) {
		console.warn('[housekeeping] file sweep failed', e);
	}
	try {
		// Association membership re-checks (PASA): each linked member at most once a day.
		const { recheckMemberships } = await import('./memberships/service.ts');
		const { cachePrune } = await import('./memberships/cache.ts');
		await cachePrune(db);
		result.memberships = await recheckMemberships(db);
	} catch (e) {
		result.memberships = { error: e instanceof Error ? e.message : String(e) };
	}
	const { instanceMode } = await import('./config.ts');
	if (instanceMode() !== 'dropzone') return result;
	try {
		const { fedConfig } = await import('./import/federation/web.ts');
		const { hasDueOutbox } = await import('./domain/federation.ts');
		const cfg = await fedConfig(db);
		if (!cfg) result.federation = { skipped: 'not_configured' };
		else if (!(await hasDueOutbox(db))) result.federation = { sent: 0, failed: 0, dropped: 0 };
		else {
			const { flushOutbox } = await import('./import/federation/client.ts');
			result.federation = await flushOutbox(db, cfg);
		}
	} catch (e) {
		result.federation = { error: e instanceof Error ? e.message : String(e) };
	}
	return result;
}
