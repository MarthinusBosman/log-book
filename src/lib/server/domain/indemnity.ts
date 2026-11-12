import { and, asc, desc, eq, like, or } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	dropzones,
	indemnitySections,
	indemnitySignatures,
	tandemPassengers,
	users,
	type IndemnityAnswer,
	type IndemnitySection,
	type IndemnitySignature,
	type IndemnitySnapshot
} from '../db/schema.ts';
import { newId } from '../auth/token.ts';
import type { IndemnityAudience, IndemnitySectionType } from '../../domain/constants.ts';
import { DomainError, assertFound } from './errors.ts';
import { DAY_MS } from './time.ts';

/** A signed sport waiver is valid for this many days (then the jumper re-signs). */
export const WAIVER_VALID_DAYS = 365;

/** Content is optional for signature sections (the heading is the prompt). */
function assertSectionInput(title: string, content: string, type: IndemnitySectionType): void {
	if (!title.trim()) throw new DomainError('invalid', 'Section heading is required');
	if (type !== 'signature' && !content.trim()) throw new DomainError('invalid', 'Section content is required');
}

export async function listSections(db: Database, dropzoneId: string, audience: IndemnityAudience): Promise<IndemnitySection[]> {
	return db
		.select()
		.from(indemnitySections)
		.where(and(eq(indemnitySections.dropzoneId, dropzoneId), eq(indemnitySections.audience, audience)))
		.orderBy(asc(indemnitySections.position), asc(indemnitySections.createdAt));
}

export async function addSection(
	db: Database,
	input: { dropzoneId: string; audience: IndemnityAudience; title: string; content: string; type?: IndemnitySectionType; position?: number }
): Promise<IndemnitySection> {
	assertSectionInput(input.title, input.content, input.type ?? 'text');
	const position = input.position ?? (await listSections(db, input.dropzoneId, input.audience)).length;
	return (
		await db
			.insert(indemnitySections)
			.values({ id: newId(), ...input, title: input.title.trim(), content: input.content.trim(), type: input.type ?? 'text', position })
			.returning()
	)[0];
}

export async function getSection(db: Database, id: string): Promise<IndemnitySection | undefined> {
	return (await db.select().from(indemnitySections).where(eq(indemnitySections.id, id)).limit(1))[0];
}

export async function updateSection(db: Database, id: string, patch: Partial<Pick<IndemnitySection, 'title' | 'content' | 'type' | 'position'>>): Promise<void> {
	if (patch.title !== undefined || patch.content !== undefined || patch.type !== undefined) {
		const cur = assertFound(await getSection(db, id), 'Section');
		const next = { ...cur, ...patch };
		assertSectionInput(next.title, next.content, next.type);
		if (patch.title !== undefined) patch.title = patch.title.trim();
		if (patch.content !== undefined) patch.content = patch.content.trim();
	}
	await db.update(indemnitySections).set({ ...patch, updatedAt: new Date() }).where(eq(indemnitySections.id, id));
}

/** Move a section one place up/down within its form; positions are renumbered 0..n-1. */
export async function moveSection(db: Database, id: string, direction: 'up' | 'down'): Promise<void> {
	const sec = assertFound(await getSection(db, id), 'Section');
	const list = await listSections(db, sec.dropzoneId, sec.audience);
	const i = list.findIndex((s) => s.id === id);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
	for (const [pos, s] of list.entries()) {
		if (s.position !== pos) await db.update(indemnitySections).set({ position: pos }).where(eq(indemnitySections.id, s.id));
	}
}

/**
 * Check the signer's answers against the form (original errors: "Checkbox Missed",
 * "Incomplete Waiver"). Returns answers aligned with `sections`.
 */
export function validateAnswers(
	sections: Pick<IndemnitySection, 'title' | 'type'>[],
	answers: IndemnityAnswer[]
): IndemnityAnswer[] {
	return sections.map((s, i) => {
		const a = answers[i] ?? null;
		if (s.type === 'acknowledgement' && !a?.accepted) {
			throw new DomainError('invalid', `Please tick the box to accept \u201c${s.title}\u201d.`, { section: i });
		}
		if (s.type === 'initials') {
			const v = a?.initials?.trim() ?? '';
			if (v.length < 1 || v.length > 6) throw new DomainError('invalid', `Please add your initials to \u201c${s.title}\u201d.`, { section: i });
			return { initials: v.toUpperCase() };
		}
		if (s.type === 'signature' && !a?.signatureFileId) {
			throw new DomainError('invalid', `Please sign \u201c${s.title}\u201d.`, { section: i });
		}
		if (s.type === 'acknowledgement') return { accepted: true };
		if (s.type === 'signature') return { signatureFileId: a!.signatureFileId };
		return null;
	});
}

export async function deleteSection(db: Database, id: string): Promise<void> {
	await db.delete(indemnitySections).where(eq(indemnitySections.id, id));
}

/** Activate/deactivate the tandem or sport form on the dropzone. */
export async function setIndemnityActive(db: Database, dropzoneId: string, audience: IndemnityAudience, active: boolean): Promise<void> {
	await db
		.update(dropzones)
		.set(audience === 'tandem' ? { indemnityTandemActive: active } : { indemnitySportActive: active })
		.where(eq(dropzones.id, dropzoneId));
}

/** Snapshot of the current form text (stored with every signature). */
export async function snapshotForm(db: Database, dropzoneId: string, audience: IndemnityAudience): Promise<IndemnitySnapshot> {
	const dz = assertFound((await db.select({ name: dropzones.name }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0], 'Dropzone');
	const sections = await listSections(db, dropzoneId, audience);
	return { dropzoneName: dz.name, audience, sections: sections.map((s) => ({ title: s.title, content: s.content, type: s.type })) };
}

/**
 * Record a signed indemnity (sport jumper: userId; tandem: tandemPassengerId). Stores the text
 * snapshot; the signature image / PDF are uploaded via storage and referenced by file id.
 */
export async function signIndemnity(
	db: Database,
	input: {
		dropzoneId: string;
		audience: IndemnityAudience;
		signerName: string;
		userId?: string | null;
		tandemPassengerId?: string | null;
		signatureFileId?: string | null;
		guardianName?: string | null;
		guardianSignatureFileId?: string | null;
		pdfFileId?: string | null;
		/** Per-section answers; validated when given (pass [] to enforce on a form with required sections). */
		answers?: IndemnityAnswer[];
		signer?: Record<string, string | null | undefined>;
		now?: number;
	}
): Promise<IndemnitySignature> {
	if (!input.userId && !input.tandemPassengerId) throw new DomainError('invalid', 'Signer is required');
	if (!input.signerName.trim()) throw new DomainError('invalid', 'Signer name is required');
	const now = input.now ?? Date.now();
	const snapshot = await snapshotForm(db, input.dropzoneId, input.audience);
	if (input.answers) snapshot.answers = validateAnswers(snapshot.sections, input.answers);
	if (input.signer) snapshot.signer = input.signer;
	const row = (
		await db
			.insert(indemnitySignatures)
			.values({
				id: newId(),
				dropzoneId: input.dropzoneId,
				audience: input.audience,
				userId: input.userId ?? null,
				tandemPassengerId: input.tandemPassengerId ?? null,
				signerName: input.signerName.trim(),
				signatureFileId: input.signatureFileId ?? null,
				guardianName: input.guardianName ?? null,
				guardianSignatureFileId: input.guardianSignatureFileId ?? null,
				pdfFileId: input.pdfFileId ?? null,
				snapshot,
				signedAt: new Date(now)
			})
			.returning()
	)[0];
	if (input.tandemPassengerId) {
		await db
			.update(tandemPassengers)
			.set({ indemnitySignatureId: row.id, indemnitySignedAt: new Date(now), status: 'registered', pdfFileId: input.pdfFileId ?? null })
			.where(eq(tandemPassengers.id, input.tandemPassengerId));
	}
	return row;
}

export async function setSignaturePdf(db: Database, signatureId: string, pdfFileId: string): Promise<void> {
	await db.update(indemnitySignatures).set({ pdfFileId }).where(eq(indemnitySignatures.id, signatureId));
}

/** Latest sport indemnity signed by a user at a DZ. */
export async function latestUserSignature(db: Database, dropzoneId: string, userId: string): Promise<IndemnitySignature | undefined> {
	return (
		await db
			.select()
			.from(indemnitySignatures)
			.where(and(eq(indemnitySignatures.dropzoneId, dropzoneId), eq(indemnitySignatures.userId, userId), eq(indemnitySignatures.audience, 'sport')))
			.orderBy(desc(indemnitySignatures.signedAt))
			.limit(1)
	)[0];
}

/** Does the jumper need to sign before manifesting? (DZ sport form active and not yet signed.) */
export async function needsSportIndemnity(db: Database, dropzoneId: string, userId: string): Promise<boolean> {
	const dz = (await db.select({ a: dropzones.indemnitySportActive }).from(dropzones).where(eq(dropzones.id, dropzoneId)).limit(1))[0];
	if (!dz?.a) return false;
	// An active form with no sections has nothing to sign: the sign page says "handled at manifest",
	// so don't block self-manifest on it either.
	const section = await db
		.select({ id: indemnitySections.id })
		.from(indemnitySections)
		.where(and(eq(indemnitySections.dropzoneId, dropzoneId), eq(indemnitySections.audience, 'sport')))
		.limit(1);
	if (!section.length) return false;
	const sig = await latestUserSignature(db, dropzoneId, userId);
	return !sig || !isSignatureValid(sig);
}

/** Valid = signed within WAIVER_VALID_DAYS. */
export function isSignatureValid(sig: Pick<IndemnitySignature, 'signedAt'>, now = Date.now()): boolean {
	return now - sig.signedAt.getTime() < WAIVER_VALID_DAYS * DAY_MS;
}

export function signatureExpiresAt(sig: Pick<IndemnitySignature, 'signedAt'>): Date {
	return new Date(sig.signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS);
}

export async function getSignature(db: Database, id: string): Promise<IndemnitySignature | undefined> {
	return (await db.select().from(indemnitySignatures).where(eq(indemnitySignatures.id, id)).limit(1))[0];
}

/** Signed waivers at a DZ (newest first), with the account email for sport signers. */
export async function listSignatures(
	db: Database,
	dropzoneId: string,
	opts: { audience?: IndemnityAudience; search?: string; limit?: number; userId?: string } = {}
) {
	const q = opts.search?.trim();
	return db
		.select({
			id: indemnitySignatures.id,
			audience: indemnitySignatures.audience,
			signerName: indemnitySignatures.signerName,
			guardianName: indemnitySignatures.guardianName,
			userId: indemnitySignatures.userId,
			email: users.email,
			tandemPassengerId: indemnitySignatures.tandemPassengerId,
			pdfFileId: indemnitySignatures.pdfFileId,
			signedAt: indemnitySignatures.signedAt
		})
		.from(indemnitySignatures)
		.leftJoin(users, eq(users.id, indemnitySignatures.userId))
		.where(
			and(
				eq(indemnitySignatures.dropzoneId, dropzoneId),
				opts.audience ? eq(indemnitySignatures.audience, opts.audience) : undefined,
				opts.userId ? eq(indemnitySignatures.userId, opts.userId) : undefined,
				q ? or(like(indemnitySignatures.signerName, `%${q}%`), like(users.email, `%${q}%`)) : undefined
			)
		)
		.orderBy(desc(indemnitySignatures.signedAt))
		.limit(opts.limit ?? 200);
}

/** Latest sport signature per user at a DZ (for the "who has a valid waiver" view). */
export async function latestSportSignatures(db: Database, dropzoneId: string): Promise<Map<string, IndemnitySignature>> {
	const rows = await db
		.select()
		.from(indemnitySignatures)
		.where(and(eq(indemnitySignatures.dropzoneId, dropzoneId), eq(indemnitySignatures.audience, 'sport')))
		.orderBy(desc(indemnitySignatures.signedAt));
	const out = new Map<string, IndemnitySignature>();
	for (const r of rows) if (r.userId && !out.has(r.userId)) out.set(r.userId, r);
	return out;
}
