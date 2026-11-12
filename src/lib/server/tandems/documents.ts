/**
 * Waiver / tandem document workflows: save signature images, record the signature, render and
 * store the PDF. Routes call these; they glue the indemnity + tandems + files services together.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { indemnitySignatures, tandemPassengers, users, type Dropzone, type IndemnityAnswer, type IndemnitySignature, type TandemPassenger } from '../db/schema.ts';
import type { Storage } from '../storage/types.ts';
import { brand } from '../../brand.ts';
import { SLOT_EXTRA_LABELS, formatMoney, type IndemnityAudience } from '../../domain/constants.ts';
import { DomainError, assertFound } from '../domain/errors.ts';
import { decodeDataUrl, deleteFile, getFile, readFileBlob, saveFile, sha256Hex } from '../domain/files.ts';
import { getSignature, listSections, signIndemnity, validateAnswers } from '../domain/indemnity.ts';
import { getPassenger, tandemOutstanding } from '../domain/tandems.ts';
import { getDropzone } from '../domain/dropzone-admin.ts';
import { ageOn, localDate } from '../domain/time.ts';
import { renderDocumentPdf, type DocumentPdfInput, type PdfBlock } from './pdf.ts';
import { readLogo } from '../branding.ts';
import { brandTheme, readBranding } from '../../branding.ts';

export function formatInstant(d: Date | number, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'long', timeStyle: 'short' }).format(d);
	} catch {
		return new Date(d).toISOString();
	}
}

export function formatDay(date: string | null | undefined): string {
	if (!date) return '';
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(
		new Date(`${date}T00:00:00Z`)
	);
}

/** Raw answers posted by the signing form: ack_<i>, initials_<i>, sig_<i> (PNG data URL). */
export function readAnswerFields(form: FormData, count: number): { accepted: boolean; initials: string; signature: string }[] {
	return Array.from({ length: count }, (_, i) => ({
		accepted: form.get(`ack_${i}`) === 'on' || form.get(`ack_${i}`) === 'true',
		initials: String(form.get(`initials_${i}`) ?? ''),
		signature: String(form.get(`sig_${i}`) ?? '')
	}));
}

type RawAnswer = { accepted: boolean; initials: string; signature: string };

function pngFrom(dataUrl: string | null | undefined, what: string) {
	if (!dataUrl) throw new DomainError('invalid', `${what} is missing — please sign in the box.`);
	const { data, mime } = decodeDataUrl(dataUrl);
	if (mime !== 'image/png') throw new DomainError('invalid', `${what} must be a PNG image`);
	if (data.byteLength < 200) throw new DomainError('invalid', `${what} is empty — please sign in the box.`);
	return data;
}

/** Validate answers first (cheap), then store any signature-section images. */
async function prepareAnswers(
	db: Database,
	storage: Storage,
	ctx: { dropzoneId: string; audience: IndemnityAudience; ownerUserId?: string | null },
	raw: RawAnswer[]
): Promise<IndemnityAnswer[]> {
	const sections = await listSections(db, ctx.dropzoneId, ctx.audience);
	validateAnswers(
		sections,
		sections.map((s, i) => ({ accepted: raw[i]?.accepted, initials: raw[i]?.initials, signatureFileId: raw[i]?.signature ? 'pending' : null }))
	);
	const out: IndemnityAnswer[] = [];
	for (const [i, s] of sections.entries()) {
		const a = raw[i];
		if (s.type === 'signature') {
			const f = await saveFile(db, storage, { data: pngFrom(a.signature, s.title), mime: 'image/png', purpose: 'signature', ownerUserId: ctx.ownerUserId, dropzoneId: ctx.dropzoneId });
			out.push({ signatureFileId: f.id });
		} else out.push({ accepted: a?.accepted, initials: a?.initials });
	}
	return out;
}

// ── sport jumper waiver ──

export async function signSportWaiver(
	db: Database,
	storage: Storage,
	input: { dropzoneId: string; userId: string; signerName: string; signature: string; answers: RawAnswer[]; now?: number }
): Promise<IndemnitySignature> {
	const dz = await getDropzone(db, input.dropzoneId);
	if (!dz.indemnitySportActive) throw new DomainError('invalid', `${dz.name} doesn't use an online waiver at the moment`);
	const user = assertFound((await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0], 'User');
	const png = pngFrom(input.signature, 'Your signature');
	const answers = await prepareAnswers(db, storage, { dropzoneId: dz.id, audience: 'sport', ownerUserId: user.id }, input.answers);
	const sigFile = await saveFile(db, storage, { data: png, mime: 'image/png', purpose: 'signature', ownerUserId: user.id, dropzoneId: dz.id });
	const sig = await signIndemnity(db, {
		dropzoneId: dz.id,
		audience: 'sport',
		userId: user.id,
		signerName: input.signerName || user.name,
		signatureFileId: sigFile.id,
		answers,
		signer: {
			Name: input.signerName || user.name,
			Email: user.email,
			Phone: user.phone,
			Licence: user.licence,
			'Association no.': user.associationNumber,
			'Date of birth': user.dob,
			'Emergency contact': user.emergencyName,
			'Emergency phone': user.emergencyPhone
		},
		now: input.now
	});
	// No PDF is stored: it is rendered on demand from the snapshot + signature images, and the
	// record's hash (sealed here) is printed on it so any later change is detectable.
	return { ...sig, snapshotHash: await sealSignature(db, storage, sig) };
}

// ── integrity of on-demand PDFs ──

async function fileDigest(db: Database, storage: Storage, id: string | null | undefined): Promise<string | null> {
	if (!id) return null;
	const row = await getFile(db, id);
	if (!row) return 'missing';
	if (row.sha256) return row.sha256;
	const b = await readFileBlob(db, storage, id).catch(() => null);
	return b ? sha256Hex(b.data) : 'missing';
}

/** sha256 over everything that was signed: form snapshot, names, time and the signature images. */
export async function signatureRecordHash(db: Database, storage: Storage, sig: IndemnitySignature): Promise<string> {
	const images = [sig.signatureFileId, sig.guardianSignatureFileId, ...(sig.snapshot.answers ?? []).map((a) => a?.signatureFileId ?? null)];
	const digests = await Promise.all(images.map((id) => fileDigest(db, storage, id)));
	const record = JSON.stringify({
		v: 1,
		id: sig.id,
		dz: sig.dropzoneId,
		audience: sig.audience,
		signer: sig.signerName,
		guardian: sig.guardianName,
		signedAt: sig.signedAt.getTime(),
		snapshot: sig.snapshot,
		images: digests
	});
	return sha256Hex(new TextEncoder().encode(record));
}

/** Compute and store the record hash (once, at signing; housekeeping seals legacy rows). */
export async function sealSignature(db: Database, storage: Storage, sig: IndemnitySignature): Promise<string> {
	const hash = await signatureRecordHash(db, storage, sig);
	await db.update(indemnitySignatures).set({ snapshotHash: hash }).where(eq(indemnitySignatures.id, sig.id));
	return hash;
}

async function integrityLine(db: Database, storage: Storage, sig: IndemnitySignature): Promise<string> {
	const now = await signatureRecordHash(db, storage, sig);
	if (!sig.snapshotHash) return `Record SHA-256 ${now}`;
	return now === sig.snapshotHash
		? `Record SHA-256 ${now} · matches the hash sealed at signing`
		: `WARNING: record SHA-256 ${now} differs from the hash sealed at signing (${sig.snapshotHash})`;
}

async function blob(db: Database, storage: Storage, id: string | null | undefined): Promise<Uint8Array | null> {
	if (!id) return null;
	try {
		return (await readFileBlob(db, storage, id))?.data ?? null;
	} catch {
		return null;
	}
}

async function answerImages(db: Database, storage: Storage, answers: IndemnityAnswer[] | undefined) {
	const out: Record<string, Uint8Array> = {};
	for (const a of answers ?? []) {
		if (a?.signatureFileId) {
			const b = await blob(db, storage, a.signatureFileId);
			if (b) out[a.signatureFileId] = b;
		}
	}
	return out;
}

/** Dropzone logo + accent for the PDF header (accent = the light-mode, contrast-safe brand colour). */
async function pdfBranding(db: Database, storage: Storage, dz: Dropzone): Promise<Pick<DocumentPdfInput, 'logo' | 'accent'>> {
	const color = readBranding(dz.settings).color;
	const logo = await readLogo(db, storage, dz).catch(() => null);
	return { accent: color ? brandTheme(color).light.primary : null, logo: logo ? { data: logo.data, mime: logo.row.mime } : null };
}

const footer = (dz: Dropzone, at: number) =>
	`This document was generated on ${formatInstant(at, dz.timezone)} for ${dz.name} using ${brand.name}.`;

/** Render the PDF for a sport waiver signature (from its stored snapshot). */
export async function sportWaiverPdf(db: Database, storage: Storage, signatureId: string, now = Date.now()): Promise<Uint8Array> {
	const sig = assertFound(await getSignature(db, signatureId), 'Signed waiver');
	const dz = await getDropzone(db, sig.dropzoneId);
	const signer = sig.snapshot.signer ?? { Name: sig.signerName };
	const info = Object.entries(signer).filter(([k]) => !k.startsWith('Emergency'));
	const emergency = Object.entries(signer).filter(([k]) => k.startsWith('Emergency'));
	return renderDocumentPdf({
		title: 'Skydive Indemnity – Skydiver Information',
		dropzoneName: dz.name,
		blocks: [
			{ title: 'Skydiver', fields: info },
			{ title: 'Emergency contact', fields: emergency }
		],
		form: sig.snapshot.sections,
		answers: sig.snapshot.answers,
		answerImages: await answerImages(db, storage, sig.snapshot.answers),
		signatures: [{ label: 'Jumper signature', name: sig.signerName, png: await blob(db, storage, sig.signatureFileId) }],
		signedAtText: formatInstant(sig.signedAt, dz.timezone),
		integrity: await integrityLine(db, storage, sig),
		footer: footer(dz, now),
		...(await pdfBranding(db, storage, dz))
	});
}

// ── tandem ──

const extrasText = (p: TandemPassenger) => p.extras.map((e) => SLOT_EXTRA_LABELS[e]).join(', ') || 'None';

export function tandemBlocks(p: TandemPassenger): PdfBlock[] {
	const minor = p.dob && p.jumpDate ? ageOn(p.dob, p.jumpDate) < 18 : false;
	const money = (m: number) => formatMoney(m, p.currency);
	return [
		{
			title: 'Tandem passenger information',
			fields: [
				['Name', p.name],
				['Email', p.email],
				['Phone', p.phone],
				['ID / Passport', p.idNumber],
				['Gender', p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : null],
				['Date of birth', p.dob ? `${p.dob}${minor ? ' (under 18 years)' : ''}` : null],
				['Nationality', p.nationality],
				['Weight', p.weightKg ? `${p.weightKg} kg` : null],
				['Height', p.heightCm ? `${p.heightCm} cm` : null],
				['Address', [p.addressLine1, p.addressLine2].filter(Boolean).join(', ')],
				['City', p.city],
				['Country', p.country],
				['Postal code', p.postalCode]
			]
		},
		{
			title: 'Parent / guardian',
			fields: [
				['Guardian name', p.guardianName],
				['Guardian email', p.guardianEmail],
				['Guardian ID / Passport', p.guardianIdNumber]
			]
		},
		{
			title: 'Emergency contact',
			fields: [
				['Name', p.emergencyName],
				['Phone', p.emergencyPhone],
				['Email', p.emergencyEmail],
				['Address', [p.emergencyAddressLine1, p.emergencyAddressLine2, p.emergencyCity, p.emergencyCountry].filter(Boolean).join(', ')]
			]
		},
		{
			title: 'Jump details',
			fields: [
				['Skydive date', p.jumpDate ? `${formatDay(p.jumpDate)}${p.bookingTime ? ` at ${p.bookingTime}` : ''}` : 'To be confirmed'],
				['Add-ons', extrasText(p)],
				['Total', money(p.totalMinor)],
				['Deposit paid', money(p.depositMinor)],
				['Amount paid', `${money(p.amountPaidMinor)}${p.paymentMethod ? ` (${p.paymentMethod})` : ''}`],
				['Outstanding', money(tandemOutstanding(p))],
				['Heard about us', p.heardFrom],
				['Notes', p.note]
			]
		}
	];
}

export async function tandemPdfInput(db: Database, storage: Storage, passengerId: string, now = Date.now()): Promise<DocumentPdfInput> {
	const p = assertFound(await getPassenger(db, passengerId), 'Tandem booking');
	const dz = await getDropzone(db, p.dropzoneId);
	const sig = p.indemnitySignatureId ? await getSignature(db, p.indemnitySignatureId) : undefined;
	const signatures = sig
		? [
				{ label: 'Passenger signature', name: sig.signerName, png: await blob(db, storage, sig.signatureFileId) },
				...(sig.guardianName || sig.guardianSignatureFileId
					? [{ label: 'Parent / guardian signature', name: sig.guardianName ?? '', png: await blob(db, storage, sig.guardianSignatureFileId) }]
					: [])
			]
		: undefined;
	return {
		title: sig ? 'Skydive Indemnity – Tandem Skydive' : 'Tandem Skydive – Booking Confirmation',
		dropzoneName: dz.name,
		highlight: { label: 'Confirmation number', value: p.confirmationNumber },
		blocks: tandemBlocks(p),
		form: sig?.snapshot.sections,
		answers: sig?.snapshot.answers,
		answerImages: await answerImages(db, storage, sig?.snapshot.answers),
		signatures,
		signedAtText: sig ? formatInstant(sig.signedAt, dz.timezone) : null,
		integrity: sig ? await integrityLine(db, storage, sig) : null,
		footer: footer(dz, now),
		...(await pdfBranding(db, storage, dz))
	};
}

export async function tandemPdf(db: Database, storage: Storage, passengerId: string, now = Date.now()): Promise<Uint8Array> {
	return renderDocumentPdf(await tandemPdfInput(db, storage, passengerId, now));
}

/**
 * PDFs are no longer stored (rendered on demand). This drops a legacy stored PDF of a booking
 * ("Regenerate PDF" now just guarantees the next download is freshly rendered).
 */
export async function dropStoredTandemPdf(db: Database, storage: Storage, passengerId: string): Promise<void> {
	const p = assertFound(await getPassenger(db, passengerId), 'Tandem booking');
	if (!p.pdfFileId) return;
	await db.update(tandemPassengers).set({ pdfFileId: null }).where(eq(tandemPassengers.id, p.id));
	if (p.indemnitySignatureId) await db.update(indemnitySignatures).set({ pdfFileId: null }).where(eq(indemnitySignatures.id, p.indemnitySignatureId));
	await deleteFile(db, storage, p.pdfFileId).catch(() => {});
}

/** Tandem passenger signs the DZ's tandem indemnity (booking flow or at the DZ). */
export async function signTandemWaiver(
	db: Database,
	storage: Storage,
	input: {
		passengerId: string;
		signature: string;
		guardianName?: string | null;
		guardianSignature?: string | null;
		answers: RawAnswer[];
		now?: number;
	}
): Promise<IndemnitySignature> {
	const p = assertFound(await getPassenger(db, input.passengerId), 'Tandem booking');
	const minor = p.dob && p.jumpDate ? ageOn(p.dob, p.jumpDate) < 18 : false;
	const png = pngFrom(input.signature, 'Passenger signature');
	const gPng = minor ? pngFrom(input.guardianSignature, 'Guardian signature') : null;
	if (minor && !input.guardianName?.trim() && !p.guardianName) throw new DomainError('invalid', 'Guardian name is required for passengers under 18');
	const answers = await prepareAnswers(db, storage, { dropzoneId: p.dropzoneId, audience: 'tandem' }, input.answers);
	const sigFile = await saveFile(db, storage, { data: png, mime: 'image/png', purpose: 'signature', dropzoneId: p.dropzoneId });
	const gFile = gPng ? await saveFile(db, storage, { data: gPng, mime: 'image/png', purpose: 'signature', dropzoneId: p.dropzoneId }) : null;
	const sig = await signIndemnity(db, {
		dropzoneId: p.dropzoneId,
		audience: 'tandem',
		tandemPassengerId: p.id,
		signerName: p.name,
		signatureFileId: sigFile.id,
		guardianName: minor ? (input.guardianName?.trim() || p.guardianName) : null,
		guardianSignatureFileId: gFile?.id ?? null,
		answers,
		signer: { Name: p.name, Email: p.email, 'ID / Passport': p.idNumber },
		now: input.now
	});
	await dropStoredTandemPdf(db, storage, p.id);
	return { ...sig, snapshotHash: await sealSignature(db, storage, sig) };
}

/** Is today's date in the DZ before/after the jump date? (helper for UI copy) */
export function dzToday(dz: Pick<Dropzone, 'timezone'>, now = Date.now()): string {
	return localDate(now, dz.timezone);
}
