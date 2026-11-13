import { describe, expect, test } from 'bun:test';
import { altitudeFt, colour, currencyCode, decodeDocument, decodeValue, hhmm, refPath, toDate, toInstant, weekdayIndex } from '../../import/jumpmaster/values.ts';
import { inferJumpType, mapJumpMasterDocs, mapJumpType } from '../../import/jumpmaster/map.ts';
import { BundleError, parseBundle } from '../../import/bundle.ts';
import { autoMapping, csvCell, csvToBundle, defaultMapping, parseCsv, parseDate, parseFreefall, CSV_TEMPLATE } from '../../import/csv.ts';
import { logbookCsv } from '../jumper/csv.ts';
import { dropzoneDocs, encodeDoc, jumperDocs, UID } from './fixtures.ts';
import { parseImportPayload } from './jumpmaster/index.ts';

const TZ = 'Africa/Johannesburg';
const NOW = Date.parse('2026-11-14T08:00:00Z');

describe('value normalisers', () => {
	test('timestamps in every exported shape', () => {
		const iso = '2024-03-09T09:30:00.000Z';
		const ms = Date.parse(iso);
		expect(toInstant(iso)).toBe(ms);
		expect(toInstant(ms)).toBe(ms);
		expect(toInstant(ms / 1000)).toBe(ms);
		expect(toInstant({ seconds: ms / 1000, nanoseconds: 0 })).toBe(ms);
		expect(toInstant({ _seconds: ms / 1000, _nanoseconds: 5e6 })).toBe(ms + 5);
		expect(toInstant({ timestampValue: iso })).toBe(ms);
		expect(toInstant('nope')).toBeNull();
		expect(toInstant(null)).toBeNull();
	});
	test('dates normalise into the given timezone', () => {
		expect(toDate('2024-03-10T23:30:00Z', TZ)).toBe('2024-03-11');
		expect(toDate('2024-03-10T23:30:00Z', 'UTC')).toBe('2024-03-10');
		expect(toDate('2024-03-10')).toBe('2024-03-10');
	});
	test('references', () => {
		expect(refPath('projects/p/databases/(default)/documents/users/abc')).toBe('users/abc');
		expect(refPath('/users/abc/')).toBe('users/abc');
		expect(refPath({ referenceValue: 'projects/p/databases/(default)/documents/dropzones/d/load/l' })).toBe('dropzones/d/load/l');
		expect(refPath({ path: 'users/x' })).toBe('users/x');
		expect(refPath('abc')).toBeNull();
	});
	test('altitude, colour, time, weekday, currency', () => {
		expect(altitudeFt('13,500ft')).toBe(13500);
		expect(altitudeFt('4000m')).toBe(13123);
		expect(altitudeFt('')).toBeNull();
		expect(colour('0xFF2196F3')).toBe('#2196F3');
		expect(colour('#ff4caf50')).toBe('#4CAF50');
		expect(colour('Color(0xff000000)')).toBe('#000000');
		expect(hhmm('8:00 AM')).toBe('08:00');
		expect(hhmm('5:30 pm')).toBe('17:30');
		expect(hhmm('12:15 AM')).toBe('00:15');
		expect(hhmm('25:00')).toBeNull();
		expect(weekdayIndex('Saturday')).toBe(5);
		expect(currencyCode('R')).toBe('ZAR');
		expect(currencyCode('zar')).toBe('ZAR');
		expect(currencyCode('$')).toBe('USD');
	});
	test('Firestore REST values decode to the JSON form', () => {
		expect(decodeValue({ integerValue: '42' })).toBe(42);
		expect(decodeValue({ arrayValue: {} })).toEqual([]);
		expect(decodeValue({ mapValue: { fields: { a: { booleanValue: true } } } })).toEqual({ a: true });
		const doc = encodeDoc(jumperDocs().jumps![0], 'proj');
		const back = decodeDocument(doc as never);
		expect(back.id).toBe('j1');
		expect(back.path).toBe(`users/${UID}/jumps/j1`);
		expect(back.jumpNum).toBe(151);
		expect(back.user).toBe(`users/${UID}`);
		expect(back.createdTime).toBe('2024-03-09T09:30:00.000Z');
	});
});

describe('jump types', () => {
	test('slot types and logbook descriptions', () => {
		expect(mapJumpType('Freeflying')).toBe('freefly');
		expect(mapJumpType('Hop & Pop')).toBe('hop_pop');
		expect(mapJumpType('AFF 4-7')).toBe('aff_4_7');
		expect(mapJumpType('Something')).toBe('other');
		expect(inferJumpType('4 way Belly')).toBe('belly');
		expect(inferJumpType('Solo Tracking')).toBe('tracking');
		expect(inferJumpType('Freeflying jump')).toBe('freefly');
		expect(inferJumpType('fun')).toBeNull();
	});
});

describe('mapJumpMasterDocs — jumper', () => {
	const { bundle, warnings } = mapJumpMasterDocs(jumperDocs(), { timezone: TZ, now: NOW });
	test('profile', () => {
		const me = bundle.people.find((p) => p.ref === `jm:users/${UID}`)!;
		expect(me.email).toBe('jo.jumper@example.com');
		expect(me.association).toBe('pasa');
		expect(me.associationExpiry).toBe('2027-03-01'); // 22:00 UTC → next day in SAST
		expect(me.declaredJumpCount).toBe(150);
		expect(me.loadingWeightKg).toBe(92);
		expect(me.ratings).toContainEqual({ body: 'pasa', rating: 'Jumpmaster', value: 'JM' });
		expect(me.ratings).toContainEqual({ body: 'uspa', rating: 'Coach', expiresOn: '2027-12-31' });
		expect(me.ratings!.some((r) => r.rating === 'Instructor')).toBe(false);
	});
	test('logbook', () => {
		const jumps = bundle.jumper!.jumps!;
		expect(jumps).toHaveLength(3);
		expect(warnings.some((w) => w.includes('no date'))).toBe(true);
		const [j1, j2, j3] = jumps;
		expect(j1).toMatchObject({ jumpNumber: 151, jumpDate: '2024-03-09', altitudeFt: 13500, freefallSeconds: 60, jumpType: 'belly', signerLicence: 'D-1001', dzVerified: true });
		expect(j1.signerName).toBeTruthy();
		expect(j2).toMatchObject({ jumpType: 'tracking', signerName: null, dzVerified: false });
		expect(j3).toMatchObject({ jumpDate: '2024-03-11', altitudeFt: 13123, freefallSeconds: 50, jumpType: 'freefly' });
	});
	test('rigs and wallets (cents stay cents)', () => {
		expect(bundle.jumper!.rigs).toHaveLength(1);
		expect(bundle.jumper!.rigs![0]).toMatchObject({ mainCanopy: 'Sabre2 170', mainSizeSqft: 170, reserveRepackedOn: '2026-01-15', aad: 'Cypres 2' });
		const w = bundle.jumper!.wallets![0];
		expect(w).toMatchObject({ currency: 'ZAR', availableMinor: 125050, dropzoneRef: 'jm:dropzones/dz_demo_01' });
		expect(w.ledger).toHaveLength(1);
	});
	test('legacy single-rig fields become a rig when there are no gear docs', () => {
		const d = jumperDocs();
		d.gear = [];
		const r = mapJumpMasterDocs(d, { timezone: TZ }).bundle.jumper!.rigs!;
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ container: 'Javelin Odyssey', mainSizeSqft: 150, ref: `jm:users/${UID}#legacy-rig` });
	});
	test('mapped bundle passes validation', () => {
		expect(() => parseBundle(JSON.parse(JSON.stringify(bundle)))).not.toThrow();
	});
});

describe('mapJumpMasterDocs — dropzone', () => {
	const { bundle, warnings } = mapJumpMasterDocs(dropzoneDocs(), { timezone: TZ, now: NOW });
	const dz = bundle.dropzone!;
	test('profile, switches, currency', () => {
		expect(dz).toMatchObject({ name: 'Skydive Demo DZ', currency: 'ZAR', openTime: '08:00', closeTime: '17:30', lat: -26.9, payAtManifest: true, walletEnabled: true, indemnitySportActive: false });
		expect(dz.openDays!.sort()).toEqual(['sat', 'sun', 'wed']);
	});
	test('price list converted to minor units', () => {
		expect(dz.prices).toMatchObject({ sport_slot: 45000, hop_pop: 30000, tandem_slot: 320000, tandem_handcam: 80000, pay_pilot: 50000, aff_1_3: 250050 });
	});
	test('staff roles merged per person, TI colour', () => {
		const ti = dz.staff!.find((s) => s.person === 'jm:users/u_ti')!;
		expect(ti.roles).toEqual(['tandem_instructor']);
		expect(ti.colour).toBe('#2196F3');
		expect(dz.staff!.find((s) => s.person === 'jm:users/u_owner_01')!.roles).toEqual(['owner']);
		expect(dz.staff!.find((s) => s.person === 'jm:users/u_manifest')!.roles).toEqual(['manifest']);
	});
	test('loads and slots', () => {
		expect(dz.loads).toHaveLength(2);
		const [l1, l2] = dz.loads!;
		expect(l1).toMatchObject({ day: '2024-03-09', loadNumber: 1, status: 'completed', pilotName: 'Pete Pilot', refuel: true, requirements: 'B licence+' });
		expect(l2.status).toBe('cancelled'); // never completed, in the past
		expect(l1.slots).toHaveLength(4);
		const jo = l1.slots[0];
		expect(jo).toMatchObject({ person: `jm:users/${UID}`, jumpType: 'belly', extras: ['gear_rental'], totalMinor: 60000, paid: true });
		expect(jo.groupId).toContain('team');
		const ti = l1.slots[1];
		expect(ti).toMatchObject({ staffRole: 'tandem_instructor', staffPayMinor: 90000 });
		const pax = l1.slots[2];
		expect(pax).toMatchObject({ person: null, jumpType: 'tandem', tandem: 'jm:dropzones/dz_demo_01/tandems/T1', depositMinor: 50000, totalMinor: 350000 });
		expect(pax.groupId).toBe(ti.groupId);
		expect(l1.slots[3]).toMatchObject({ jumpType: 'hop_pop', isLoadMaster: true });
		expect(warnings.some((w) => w.includes("weren't found"))).toBe(true);
		expect(warnings.some((w) => w.includes('cancelled'))).toBe(true);
	});
	test('people include referenced users and slot-only jumpers', () => {
		const refs = bundle.people.map((p) => p.ref);
		expect(refs).toContain('jm:users/u_walkin'); // no user doc, created from the slot
		expect(bundle.people.find((p) => p.ref === 'jm:users/u_walkin')!.email).toBe('walkin@example.com');
		expect(bundle.people.find((p) => p.ref === 'jm:users/u_video')!.email).toBeNull();
	});
	test('tandems, booking slots, teams, waivers, gear', () => {
		const [t1, t2] = dz.tandems!;
		expect(t1).toMatchObject({ status: 'completed', gender: 'female', bookingTime: '09:00', jumpDate: '2024-03-09', heardFrom: 'Instagram', paymentStatus: 'paid', amountPaidMinor: 350000, extras: ['handcam'] });
		expect(t2).toMatchObject({ status: 'booked', paymentStatus: 'deposit_paid', depositMinor: 50000 });
		expect(dz.bookingSlots).toEqual([
			{ ref: 'jm:dropzones/dz_demo_01/bookingSlots/B1', date: null, weekday: 5, time: '09:00', capacity: 4 },
			{ ref: 'jm:dropzones/dz_demo_01/bookingSlots/B2', date: '2027-01-09', weekday: null, time: '10:00', capacity: 2 }
		]);
		expect(dz.teams![0]).toMatchObject({ name: 'Vaal Flyers', discipline: 'FS', colour: '#4CAF50', coach: 'jm:users/u_manifest' });
		expect(dz.teams![0].members).toHaveLength(2);
		expect(dz.indemnitySections!.map((s) => [s.title, s.audience, s.position])).toEqual([
			['Risk', 'tandem', 0],
			['Medical', 'sport', 1]
		]);
		expect(dz.rigs!.map((r) => r.kind)).toEqual(['tandem', 'rental']);
		expect(warnings.some((w) => w.includes('signed sport waiver'))).toBe(true);
	});
	test('validates', () => {
		expect(() => parseBundle(JSON.parse(JSON.stringify(bundle)))).not.toThrow();
	});
});

describe('parseBundle / parseImportPayload', () => {
	test('rejects junk with a readable path', () => {
		expect(() => parseImportPayload('not json')).toThrow(BundleError);
		expect(() => parseImportPayload({ hello: 1 })).toThrow(/Unrecognised/);
		expect(() =>
			parseBundle({ format: 'slot-bundle', version: 1, source: {}, people: [], jumper: { person: 'x', jumps: [{ ref: 'a', jumpDate: '09/03/2024' }] } })
		).toThrow(/jumper.jumps\[0\].jumpDate/);
		expect(() => parseBundle({ format: 'slot-bundle', version: 2 })).toThrow(/version/);
	});
	test('accepts raw Jump Master docs', () => {
		const r = parseImportPayload(JSON.stringify(jumperDocs()), { timezone: TZ });
		expect(r.kind).toBe('jumpmaster-docs');
		expect(r.bundle.jumper!.jumps).toHaveLength(3);
	});
	test('drops unknown price codes and extras', () => {
		const b = parseBundle({
			format: 'slot-bundle',
			version: 1,
			source: { system: 'slot' },
			people: [],
			dropzone: { ref: 'd', name: 'X', prices: { sport_slot: 100, bogus: 5, hop_pop: -1 }, loads: [] }
		});
		expect(b.dropzone!.prices).toEqual({ sport_slot: 100 });
	});
});

describe('CSV logbook', () => {
	test('parser handles quotes, delimiters, CRLF and BOM', () => {
		expect(parseCsv('\uFEFFa,"b, c","d ""q"""\r\n1,2,3\r\n')).toEqual([
			['a', 'b, c', 'd "q"'],
			['1', '2', '3']
		]);
		expect(parseCsv('a;b\n1;2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
		expect(parseCsv('a\tb\n"multi\nline"\t2')).toEqual([
			['a', 'b'],
			['multi\nline', '2']
		]);
	});
	test('auto mapping of common headers', () => {
		const m = autoMapping(['No.', 'Date', 'DZ', 'Plane', 'Exit Altitude', 'Freefall Time', 'Discipline', 'Notes']);
		expect(m).toEqual({ jumpNumber: 0, jumpDate: 1, location: 2, aircraft: 3, altitudeFt: 4, freefallSeconds: 5, jumpType: 6, description: 7, signerName: -1, signerLicence: -1 });
		expect(autoMapping(['Foo', 'Date']).jumpNumber).toBe(-1);
		// sign-off columns; "Signed at" is a date, never the signer
		const s = autoMapping(['Date', 'Signed at', 'Sign-off by', "Signer's licence no."]);
		expect([s.signerName, s.signerLicence]).toEqual([2, 3]);
		expect(autoMapping(['Date', 'Signer', 'Signer licence'])).toMatchObject({ signerName: 1, signerLicence: 2 });
		expect(autoMapping(['Date', 'Dropzone / location']).location).toBe(1);
		// headerless files use the template order; nothing lands in the sign-off fields
		expect(defaultMapping()).toMatchObject({ jumpNumber: 0, description: 7, signerName: -1, signerLicence: -1 });
	});
	test('both logbook CSV downloads read back in with every column matched', () => {
		const base = {
			id: 'j', userId: 'u', dropzoneId: 'dz1', rigId: null, loadId: null, slotId: null, signerUserId: null, signatureFileId: null,
			verified: false, source: 'manual' as const, sourceRef: null, createdAt: new Date(), updatedAt: new Date()
		};
		const csv = logbookCsv([
			{ ...base, jumpNumber: 41, jumpDate: '2026-03-01', location: null, dropzoneName: 'Skydive Demo DZ', aircraft: 'C208', altitudeFt: 12000, freefallSeconds: 55, jumpType: 'hop_pop' as const, description: 'Hop, pop', signerName: 'Ina Instructor', signerLicence: 'D-1', signedAt: new Date('2026-03-02T10:00:00Z') },
			{ ...base, jumpNumber: 42, jumpDate: '2026-03-02', location: 'Mossel Bay', dropzoneName: null, aircraft: null, altitudeFt: null, freefallSeconds: null, jumpType: 'belly' as const, description: null, signerName: null, signerLicence: null, signedAt: null }
		]);
		const { bundle, errors, mapping } = csvToBundle(csv);
		expect(errors).toEqual([]);
		expect(Object.entries(mapping).filter(([, i]) => i < 0)).toEqual([]);
		expect(bundle.jumper!.jumps).toMatchObject([
			{ jumpNumber: 41, jumpDate: '2026-03-01', location: 'Skydive Demo DZ', aircraft: 'C208', altitudeFt: 12000, freefallSeconds: 55, jumpType: 'hop_pop' as const, description: 'Hop, pop', signerName: 'Ina Instructor', signerLicence: 'D-1' },
			{ jumpNumber: 42, location: 'Mossel Bay', jumpType: 'belly', signerName: null, signerLicence: null }
		]);
	});
	test('dates and freefall', () => {
		expect(parseDate('2024-03-09')).toBe('2024-03-09');
		expect(parseDate('09/03/2024')).toBe('2024-03-09');
		expect(parseDate('03/09/2024', 'mdy')).toBe('2024-03-09');
		expect(parseDate('12/31/2024')).toBe('2024-12-31');
		expect(parseDate('9 Mar 2024')).toBe('2024-03-09');
		expect(parseDate('March 9, 2024')).toBe('2024-03-09');
		expect(parseDate('31/02/2024')).toBeNull();
		expect(parseFreefall('1:05')).toBe(65);
		expect(parseFreefall('45s')).toBe(45);
		expect(parseFreefall('1m 5s')).toBe(65);
		expect(parseFreefall('')).toBeNull();
	});
	test('template converts to a bundle', () => {
		const { bundle, errors } = csvToBundle(CSV_TEMPLATE);
		expect(errors).toEqual([]);
		expect(bundle.jumper!.jumps).toHaveLength(2);
		expect(bundle.jumper!.jumps![0]).toMatchObject({ ref: 'csv:1:2024-03-09', jumpNumber: 1, location: 'Skydive Demo DZ', altitudeFt: 10000, freefallSeconds: 45, jumpType: 'belly' });
		expect(() => parseBundle(JSON.parse(JSON.stringify(bundle)))).not.toThrow();
	});
	test('bad rows are reported, not fatal', () => {
		const { bundle, errors } = csvToBundle('Date,Notes\nnot-a-date,x\n2024-01-02,ok\n2024-01-02,ok\n');
		expect(bundle.jumper!.jumps).toHaveLength(1);
		expect(errors.map((e) => e.row)).toEqual([1, 3]);
	});
	test('formula injection is neutralised on export', () => {
		expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
		expect(csvCell('-5')).toBe('-5');
		expect(csvCell('a,b')).toBe('"a,b"');
	});
});
