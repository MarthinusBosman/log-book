import { describe, expect, test } from 'bun:test';
import { createSignToken, parseSignToken, qrSvg, verifySignToken } from './signoff.ts';
import { csvField, logbookCsv } from './csv.ts';
import { domainFail, fieldErrors, friendlyError, moneyMinor, seconds } from './forms.ts';
import { DomainError } from '../domain/errors.ts';
import { jumpFormEcho, parseJumpForm } from './logbook.ts';
import { rigFormEcho } from './gear.ts';
import { TEAM_COLOURS, TEAM_COLOUR_OPTIONS } from './teams.ts';

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
	test('logbook export: sign-off day is the dropzone-local calendar day', () => {
		const base = {
			id: 'j',
			userId: 'u',
			jumpNumber: 13,
			jumpDate: '2026-11-02',
			dropzoneId: 'dz',
			location: null,
			aircraft: null,
			altitudeFt: null,
			freefallSeconds: null,
			jumpType: 'belly',
			description: null,
			rigId: null,
			signerUserId: null,
			signerName: 'Ina',
			signerLicence: null,
			signatureFileId: null,
			// 23:30 UTC on 2 Nov = 01:30 on 3 Nov in Johannesburg, 18:30 on 2 Nov in New York.
			signedAt: new Date('2026-11-02T23:30:00Z'),
			verified: false,
			source: 'manual',
			sourceRef: null,
			slotId: null,
			loadId: null,
			createdAt: new Date(),
			updatedAt: new Date()
		} as const;
		const signed = (csv: string) => csv.replace('\uFEFF', '').trim().split('\r\n')[1].split(',').at(-2);
		expect(signed(logbookCsv([{ ...base, dropzoneTimezone: 'Africa/Johannesburg' }]))).toBe('2026-11-03');
		expect(signed(logbookCsv([{ ...base, dropzoneTimezone: null }], 'America/New_York'))).toBe('2026-11-02');
		expect(signed(logbookCsv([{ ...base }]))).toBe('2026-11-02');
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
		// Wallet top-ups: the sign is never dropped and "1,000" is a thousand, not 1.00.
		expect(moneyMinor(fd({ a: '-5' }), 'a')).toBeNaN();
		expect(moneyMinor(fd({ a: '1,000' }), 'a')).toBe(100000);
		expect(moneyMinor(fd({ a: '1 000,50' }), 'a')).toBe(100050);
		expect(moneyMinor(fd({ a: '5abc' }), 'a')).toBeNaN();
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

describe('jump form', () => {
	const fd = (o: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(o)) f.set(k, v);
		return f;
	};
	const now = Date.parse('2026-11-14T08:00:00Z');
	test('rejects future and implausibly old dates', () => {
		const base = { location: 'Boogie' };
		expect(parseJumpForm(fd({ ...base, jumpDate: '2026-11-14' }), new Set(), now).jumpDate).toBe('2026-11-14');
		expect(() => parseJumpForm(fd({ ...base, jumpDate: '2030-01-01' }), new Set(), now)).toThrow(/future/);
		expect(() => parseJumpForm(fd({ ...base, jumpDate: '0101-02-03' }), new Set(), now)).toThrow(/past/);
	});
	test('reports every bad field at once, keyed by input name', () => {
		let err: unknown;
		try {
			parseJumpForm(fd({ jumpNumber: '0', jumpDate: '2030-01-01', dropzoneId: '', location: '', altitudeFt: '-50', freefallSeconds: 'abc', jumpType: 'belly' }), new Set(), now);
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(DomainError);
		const e = err as DomainError;
		expect(e.message).toBe('Please fix the 5 highlighted fields');
		expect(fieldErrors(e)).toEqual({
			jumpDate: 'That jump date is in the future',
			location: 'Choose a dropzone or type a location',
			jumpNumber: 'Jump number must be a positive whole number',
			altitudeFt: "Altitude can't be negative",
			freefallSeconds: 'Freefall time must be seconds or mm:ss'
		});
		// a single problem keeps its own message
		expect(() => parseJumpForm(fd({ jumpDate: '2026-11-14', location: 'Boogie', altitudeFt: '50000' }), new Set(), now)).toThrow('Altitude looks too high (feet, max 40 000)');
		expect(() => parseJumpForm(fd({ jumpDate: '', location: 'Boogie' }), new Set(), now)).toThrow('Please set the date for this jump');
	});
	test('domainFail passes field messages to the form', () => {
		const r = domainFail(new DomainError('invalid', 'x', { fields: { altitudeFt: 'bad', junk: 3 } }));
		expect(r.data.fields).toEqual({ altitudeFt: 'bad' });
		expect(domainFail(new DomainError('invalid', 'x')).data.fields).toBeNull();
	});
	test('echoes what was typed so a failed post keeps the values', () => {
		const v = jumpFormEcho(fd({ jumpNumber: '42', jumpDate: '0101-02-03', dropzoneId: '', location: 'Boogie', altitudeFt: '-500', freefallSeconds: '0:45', jumpType: 'freefly', description: 'Long track' }));
		expect(v).toEqual({ jumpNumber: 42, jumpDate: '0101-02-03', dropzoneId: '', location: 'Boogie', aircraft: null, altitudeFt: '-500', freefallSeconds: '0:45', jumpType: 'freefly', description: 'Long track', rigId: null });
		expect(jumpFormEcho(fd({})).jumpNumber).toBe('');
	});
});

describe('rig form echo', () => {
	test('keeps typed values (bad numbers as text) for a failed no-JS post', () => {
		const f = new FormData();
		for (const [k, v] of Object.entries({ container: 'Mirage G4', mainCanopy: 'Sabre3', mainSizeSqft: '170', reserveSizeSqft: '15x', reserveRepackedOn: '0202-05-01', repackIntervalDays: '', notes: 'Blue' })) f.set(k, v);
		expect(rigFormEcho(f)).toEqual({
			name: null,
			container: 'Mirage G4',
			mainCanopy: 'Sabre3',
			mainSizeSqft: 170,
			reserveCanopy: null,
			reserveSizeSqft: '15x',
			reserveRepackedOn: '0202-05-01',
			repackIntervalDays: null,
			aad: null,
			aadSerial: null,
			aadServiceDueOn: null,
			aadExpiresOn: null,
			wingsuit: null,
			notes: 'Blue'
		});
	});
});

describe('team colours', () => {
	test('every swatch has a distinct name for screen readers', () => {
		expect(TEAM_COLOUR_OPTIONS.map((c) => c.value)).toEqual([...TEAM_COLOURS]);
		const names = TEAM_COLOUR_OPTIONS.map((c) => c.name);
		expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
		expect(new Set(names).size).toBe(names.length);
	});
});
