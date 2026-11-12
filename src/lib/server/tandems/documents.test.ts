import { beforeEach, describe, expect, test } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import type { Database } from '../db/index.ts';
import { MemoryStorage } from '../storage/memory.ts';
import { DAY, NOW, freshDb, makeDropzone, makeMember } from '../domain/testing.ts';
import { addSection, getSignature, setIndemnityActive } from '../domain/indemnity.ts';
import { createPassenger, getPassenger } from '../domain/tandems.ts';
import { eq } from 'drizzle-orm';
import { indemnitySignatures } from '../db/schema.ts';
import { getFile } from '../domain/files.ts';
import { isDomainError } from '../domain/errors.ts';
import { signSportWaiver, signTandemWaiver, signatureRecordHash, sportWaiverPdf, tandemPdf } from './documents.ts';
import { renderDocumentPdf } from './pdf.ts';
import { bookingOptions } from './payments.ts';
import { saveProviderSettings } from '../payments/config.ts';

// 1x1 transparent PNG, padded so it passes the "not empty" size check
const PNG_1PX =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
function bigPng(): string {
	// a valid 40x20 PNG is easier to fake via pdf-lib round trip; use the 1px one + tEXt padding chunk
	const bin = Uint8Array.from(atob(PNG_1PX), (c) => c.charCodeAt(0));
	const iend = bin.length - 12;
	const text = new TextEncoder().encode('Comment\0' + 'x'.repeat(300));
	const len = new Uint8Array([0, 0, (text.length >> 8) & 255, text.length & 255]);
	const chunk = new Uint8Array([...len, ...new TextEncoder().encode('tEXt'), ...text, 0, 0, 0, 0]);
	const out = new Uint8Array([...bin.slice(0, iend), ...chunk, ...bin.slice(iend)]);
	return 'data:image/png;base64,' + btoa(String.fromCharCode(...out));
}

let db: Database;
let storage: MemoryStorage;
beforeEach(() => {
	db = freshDb();
	storage = new MemoryStorage();
});

describe('pdf renderer', () => {
	test('renders multi-page documents with unicode fallback', async () => {
		const bytes = await renderDocumentPdf({
			title: 'Skydive Indemnity – Tandem Skydive',
			dropzoneName: 'Zürich Skydive ✈',
			highlight: { label: 'Confirmation number', value: 'ABCD-EFGH' },
			blocks: [{ title: 'Passenger', fields: [['Name', 'Zoë 李'], ['Weight', '80 kg'], ['Empty', null]] }],
			form: Array.from({ length: 12 }, (_, i) => ({ title: `Section ${i}`, content: 'Lorem ipsum dolor sit amet. '.repeat(30), type: 'acknowledgement' as const })),
			answers: Array.from({ length: 12 }, () => ({ accepted: true })),
			signatures: [{ label: 'Passenger signature', name: 'Zoë', png: null }],
			footer: 'generated'
		});
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBeGreaterThan(1);
		expect(doc.getTitle()).toContain('Tandem');
	});
});

describe('waiver signing workflows', () => {
	test('sport waiver: stores the signature (no PDF), seals the record hash, validates answers', async () => {
		const { dz } = await makeDropzone(db);
		const u = await makeMember(db, dz.id, ['jumper'], { name: 'Jamie Jumper' });
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Risk', content: 'Dangerous', type: 'acknowledgement' });
		await addSection(db, { dropzoneId: dz.id, audience: 'sport', title: 'Initials', content: 'Read', type: 'initials' });
		const base = { dropzoneId: dz.id, userId: u.id, signerName: 'Jamie Jumper', signature: bigPng() };
		const err = await signSportWaiver(db, storage, { ...base, answers: [] }).catch((e) => e);
		expect(isDomainError(err)).toBe(true); // sport form not active
		await setIndemnityActive(db, dz.id, 'sport', true);
		const err2 = await signSportWaiver(db, storage, { ...base, answers: [{ accepted: false, initials: 'JJ', signature: '' }, { accepted: false, initials: 'JJ', signature: '' }] }).catch((e) => e);
		expect(err2.message).toContain('tick the box');
		const sig = await signSportWaiver(db, storage, {
			...base,
			answers: [
				{ accepted: true, initials: '', signature: '' },
				{ accepted: false, initials: 'jj', signature: '' }
			],
			now: NOW
		});
		expect(sig.pdfFileId).toBeNull();
		expect(sig.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
		const stored = (await getSignature(db, sig.id))!;
		expect(stored.snapshotHash).toBe(sig.snapshotHash);
		const pdf = await sportWaiverPdf(db, storage, sig.id, NOW);
		expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
		expect(await signatureRecordHash(db, storage, stored)).toBe(sig.snapshotHash!);
		expect((await getFile(db, sig.signatureFileId!))!.purpose).toBe('signature');
		// tampering with the snapshot is detected
		await db.update(indemnitySignatures).set({ snapshot: { ...stored.snapshot, signer: { Name: 'Someone else' } } }).where(eq(indemnitySignatures.id, sig.id));
		expect(await signatureRecordHash(db, storage, (await getSignature(db, sig.id))!)).not.toBe(sig.snapshotHash!);
	});

	test('tandem waiver: minor needs guardian signature; PDF rendered on demand', async () => {
		const { dz } = await makeDropzone(db);
		await addSection(db, { dropzoneId: dz.id, audience: 'tandem', title: 'Risk', content: 'Dangerous', type: 'acknowledgement' });
		await setIndemnityActive(db, dz.id, 'tandem', true);
		const p = await createPassenger(db, dz.id, {
			name: 'Kid Jumper',
			email: 'k@x.co',
			dob: '2010-01-01',
			jumpDate: DAY,
			guardianName: 'Parent',
			guardianEmail: 'p@x.co',
			guardianIdNumber: '123'
		});
		const ans = [{ accepted: true, initials: '', signature: '' }];
		const e = await signTandemWaiver(db, storage, { passengerId: p.id, signature: bigPng(), answers: ans }).catch((x) => x);
		expect(e.message).toContain('Guardian signature');
		await signTandemWaiver(db, storage, { passengerId: p.id, signature: bigPng(), guardianSignature: bigPng(), answers: ans, now: NOW });
		const fresh = (await getPassenger(db, p.id))!;
		expect(fresh.status).toBe('registered');
		expect(fresh.pdfFileId).toBeNull();
		const bytes = await tandemPdf(db, storage, p.id);
		expect((await PDFDocument.load(bytes)).getTitle()).toContain('Tandem');
	});
});

describe('booking payment options', () => {
	test('pay at the dropzone follows DZ switches and is the fallback when nothing online is ready', async () => {
		const { dz } = await makeDropzone(db, { paymentsOn: false, payAtManifest: false });
		const ids = async (patch: Partial<typeof dz> = {}) => (await bookingOptions(db, { ...dz, ...patch }, 'k')).options.map((o) => o.id);
		expect(await ids()).toEqual(['manual']);
		// payments on but nothing connected → still bookable (pay at DZ)
		expect(await ids({ paymentsOn: true })).toEqual(['manual']);
		await saveProviderSettings(db, dz.id, 'paystack', { secrets: { secretKey: 'sk_test_x' } }, 'k');
		expect(await ids({ paymentsOn: true, payAtManifest: false })).toEqual(['paystack']);
		expect(await ids({ paymentsOn: true, payAtManifest: true })).toEqual(['paystack', 'manual']);
		// payments switched off → online providers hidden even when connected
		expect(await ids({ paymentsOn: false })).toEqual(['manual']);
	});
});
