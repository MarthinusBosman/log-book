import { describe, expect, test } from 'bun:test';
import { createSignToken, parseSignToken, qrSvg, verifySignToken } from './signoff.ts';
import { csvField, logbookCsv } from './csv.ts';
import { friendlyError, moneyMinor, seconds } from './forms.ts';
import { DomainError } from '../domain/errors.ts';

const owner = { id: 'u1', passwordHash: 'pbkdf2-sha256$100000$abc$def', createdAt: new Date(1_700_000_000_000) };
const jumpId = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NOW = 1_800_000_000_000;

describe('sign-off tokens', () => {
	test('round-trip, tamper, wrong owner, expiry', async () => {
		const t = await createSignToken(owner, jumpId, NOW);
		expect(parseSignToken(t)?.jumpId).toBe(jumpId);
		expect(await verifySignToken(owner, t, NOW)).toBe('ok');
		const other = await createSignToken(owner, '1f8fad5b-d9cb-469f-a165-70867728950e', NOW);
		expect(await verifySignToken(owner, `${jumpId}.${other.split('.')[1]}.${other.split('.')[2]}`, NOW)).toBe('invalid');
		expect(await verifySignToken({ ...owner, passwordHash: 'changed' }, t, NOW)).toBe('invalid');
		expect(await verifySignToken(owner, t, NOW + 8 * 86_400_000)).toBe('expired');
		expect(await verifySignToken(owner, 'garbage', NOW)).toBe('invalid');
	});

	test('qr svg', () => {
		const svg = qrSvg('https://example.com/app/logbook/sign/abc', { title: 'Sign <jump>' });
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('<title>Sign jump</title>');
		expect(svg).toContain('fill="currentColor"');
	});
});

describe('csv', () => {
	test('quotes, escapes and neutralises formulas', () => {
		expect(csvField('a,b')).toBe('"a,b"');
		expect(csvField('say "hi"')).toBe('"say ""hi"""');
		expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(csvField(-5)).toBe('-5');
		expect(csvField(null)).toBe('');
	});
	test('logbook export', () => {
		const csv = logbookCsv([
			{
				id: 'j',
				userId: 'u',
				jumpNumber: 12,
				jumpDate: '2026-11-01',
				dropzoneId: null,
				location: 'Mossel Bay',
				aircraft: 'C182',
				altitudeFt: 10000,
				freefallSeconds: 50,
				jumpType: 'belly',
				description: 'Fun, sunset',
				rigId: null,
				signerUserId: null,
				signerName: 'Ina Instructor',
				signerLicence: 'D-1',
				signatureFileId: null,
				signedAt: new Date('2026-11-02T10:00:00Z'),
				verified: false,
				source: 'manual',
				sourceRef: null,
				slotId: null,
				loadId: null,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);
		const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
		expect(lines[0]).toStartWith('Jump #,Date');
		expect(lines[1]).toBe('12,2026-11-01,Mossel Bay,C182,10000,50,Belly,"Fun, sunset",no,Ina Instructor,D-1,2026-11-02,manual');
	});
});

describe('form helpers', () => {
	const fd = (o: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(o)) f.set(k, v);
		return f;
	};
	test('money and seconds', () => {
		expect(moneyMinor(fd({ a: 'R 450,50' }), 'a')).toBe(45050);
		expect(moneyMinor(fd({ a: '' }), 'a')).toBeNaN();
		expect(seconds(fd({ a: '1:05' }), 'a')).toBe(65);
		expect(seconds(fd({ a: '55' }), 'a')).toBe(55);
		expect(seconds(fd({ a: '' }), 'a')).toBeNull();
	});
	test('friendly insufficient funds', () => {
		const msg = friendlyError(new DomainError('insufficient_funds', 'x', { availableMinor: 12345, requiredMinor: 45000, currency: 'ZAR' }));
		expect(msg).toContain('123');
		expect(msg).toContain('Available funds');
	});
});
