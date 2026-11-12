import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import {
	aircraft,
	bookingSlots,
	dropzoneFollows,
	dropzoneMemberRoles,
	dropzones,
	importJobs,
	indemnitySections,
	ledgerEntries,
	loads,
	logbookJumps,
	pricelistItems,
	rigs,
	slots,
	tandemPassengers,
	teamMembers,
	teams,
	userRatings,
	users,
	walletAccounts
} from '../db/schema.ts';
import { freshDb, makeDropzone, makeUser, NOW } from '../domain/testing.ts';
import { grantRole } from '../domain/permissions.ts';
import { mapJumpMasterDocs } from '../../import/jumpmaster/map.ts';
import { parseBundle } from '../../import/bundle.ts';
import { csvToBundle, CSV_TEMPLATE } from '../../import/csv.ts';
import { JumpMasterConnector, ConnectorError } from '../../import/jumpmaster/client.ts';
import { importBundle, previewBundle } from './apply.ts';
import { exportDropzone, exportJumper, exportLogbookCsv } from './export.ts';
import { deterministicId } from './db.ts';
import { docStore, dropzoneDocs, jumperDocs, OWNER_UID, UID } from './fixtures.ts';
import { createMockJumpMaster } from './mock-jumpmaster.ts';

const TZ = 'Africa/Johannesburg';
const jumperBundle = () => parseBundle(JSON.parse(JSON.stringify(mapJumpMasterDocs(jumperDocs(), { timezone: TZ, now: NOW }).bundle)));
const dzBundle = () => parseBundle(JSON.parse(JSON.stringify(mapJumpMasterDocs(dropzoneDocs(), { timezone: TZ, now: NOW }).bundle)));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const count = async (db: ReturnType<typeof freshDb>, table: any, where?: any) =>
	(await db.select().from(table).where(where)).length;

describe('deterministicId', () => {
	test('stable, scoped, uuid-shaped', () => {
		const a = deterministicId('dz1', 'jm:x');
		expect(a).toBe(deterministicId('dz1', 'jm:x'));
		expect(a).not.toBe(deterministicId('dz2', 'jm:x'));
		expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});
});

describe('jumper import', () => {
	test('imports logbook, rigs, ratings and blank profile fields; never wallets', async () => {
		const db = freshDb();
		const me = await makeUser(db, { email: 'me@here.example', name: 'Jo', phone: '+1 keep me', declaredJumpCount: 10 });
		const r = await importBundle(db, jumperBundle(), { userId: me.id, mode: 'jumper', source: 'jumpmaster', now: NOW });
		expect(r.ok).toBe(true);
		expect(r.counts).toMatchObject({ jumps: 3, 'jumps.created': 3, rigs: 1 });
		expect(r.counts.ratings).toBeGreaterThanOrEqual(3);
		expect(r.warnings.some((w) => w.includes('wallet'))).toBe(true);
		const jumps = await db.select().from(logbookJumps).where(eq(logbookJumps.userId, me.id));
		expect(jumps.map((j) => j.jumpNumber).sort()).toEqual([151, 152, 153]);
		expect(jumps.every((j) => j.source === 'import' && !j.verified)).toBe(true);
		const u = (await db.select().from(users).where(eq(users.id, me.id)))[0];
		expect(u.phone).toBe('+1 keep me'); // not overwritten
		expect(u.licence).toBe('C-4567'); // blank filled
		expect(u.declaredJumpCount).toBe(150);
		expect(u.sourceRef).toBe(`jm:users/${UID}`);
		expect(await count(db, walletAccounts)).toBe(0);
		const job = (await db.select().from(importJobs).where(eq(importJobs.id, r.jobId)))[0];
		expect(job).toMatchObject({ status: 'succeeded', source: 'jumpmaster' });
		expect(job.counts).toMatchObject({ jumps: 3 });
	});

	test('re-import updates, never duplicates', async () => {
		const db = freshDb();
		const me = await makeUser(db);
		await importBundle(db, jumperBundle(), { userId: me.id, mode: 'jumper', now: NOW });
		const b = jumperBundle();
		b.jumper!.jumps![0].description = 'Edited in Jump Master';
		const r2 = await importBundle(db, b, { userId: me.id, mode: 'jumper', now: NOW });
		expect(r2.counts).toMatchObject({ jumps: 3, 'jumps.updated': 3 });
		expect(r2.counts['jumps.created'] ?? 0).toBe(0);
		const jumps = await db.select().from(logbookJumps).where(eq(logbookJumps.userId, me.id));
		expect(jumps).toHaveLength(3);
		expect(jumps.find((j) => j.jumpNumber === 151)!.description).toBe('Edited in Jump Master');
		expect(await count(db, rigs, eq(rigs.userId, me.id))).toBe(1);
		expect(await count(db, userRatings, eq(userRatings.userId, me.id))).toBe(3);
	});

	test('CSV import numbers jumps after the existing logbook when numbers are missing', async () => {
		const db = freshDb();
		const me = await makeUser(db, { declaredJumpCount: 40 });
		const { bundle } = csvToBundle('Date,DZ,Notes\n2024-01-02,Here,one\n2024-01-01,Here,zero\n');
		const r = await importBundle(db, parseBundle(JSON.parse(JSON.stringify(bundle))), { userId: me.id, mode: 'jumper' });
		expect(r.ok).toBe(true);
		const jumps = await db.select().from(logbookJumps).where(eq(logbookJumps.userId, me.id));
		const byDate = Object.fromEntries(jumps.map((j) => [j.jumpDate, j.jumpNumber]));
		expect(byDate).toEqual({ '2024-01-01': 41, '2024-01-02': 42 });
		// re-import keeps numbers
		await importBundle(db, parseBundle(JSON.parse(JSON.stringify(bundle))), { userId: me.id, mode: 'jumper' });
		const again = await db.select().from(logbookJumps).where(eq(logbookJumps.userId, me.id));
		expect(Object.fromEntries(again.map((j) => [j.jumpDate, j.jumpNumber]))).toEqual(byDate);
	});

	test('links the location to a dropzone with the same name', async () => {
		const db = freshDb();
		const { dz } = await makeDropzone(db);
		const me = await makeUser(db);
		const { bundle } = csvToBundle(`Date,DZ\n2024-01-02,${dz.name.toUpperCase()}\n`);
		await importBundle(db, parseBundle(JSON.parse(JSON.stringify(bundle))), { userId: me.id, mode: 'jumper' });
		const j = (await db.select().from(logbookJumps).where(eq(logbookJumps.userId, me.id)))[0];
		expect(j.dropzoneId).toBe(dz.id);
	});

	test('a dropzone bundle is rejected in jumper mode with a failed job', async () => {
		const db = freshDb();
		const me = await makeUser(db);
		const r = await importBundle(db, dzBundle(), { userId: me.id, mode: 'jumper' });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/no personal logbook/);
		const job = (await db.select().from(importJobs).where(eq(importJobs.id, r.jobId)))[0];
		expect(job.status).toBe('failed');
	});

	test('preview counts what is already imported', async () => {
		const db = freshDb();
		const me = await makeUser(db);
		const p1 = await previewBundle(db, jumperBundle(), { userId: me.id, mode: 'jumper' });
		expect(p1.counts.jumps).toBe(3);
		expect(p1.alreadyImported).toBe(0);
		expect(p1.samples.jumps[0].jumpDate).toBe('2024-03-09');
		await importBundle(db, jumperBundle(), { userId: me.id, mode: 'jumper' });
		const p2 = await previewBundle(db, jumperBundle(), { userId: me.id, mode: 'jumper' });
		expect(p2.alreadyImported).toBe(3);
	});
});

describe('dropzone import', () => {
	async function setup() {
		const db = freshDb();
		const { dz, owner } = await makeDropzone(db);
		return { db, dz, owner };
	}

	test('requires dz.settings on the target dropzone', async () => {
		const { db, dz } = await setup();
		const jumper = await makeUser(db);
		await grantRole(db, { dropzoneId: dz.id, userId: jumper.id, role: 'jumper' });
		const r = await importBundle(db, dzBundle(), { userId: jumper.id, mode: 'dropzone', dropzoneId: dz.id });
		expect(r.ok).toBe(false);
		expect(await count(db, loads)).toBe(0);
	});

	test('imports everything, maps the source owner to the importer, creates placeholders', async () => {
		const { db, dz, owner } = await setup();
		// Tina already has an account here (matched by email)
		const tina = await makeUser(db, { email: 'tina@demo-dz.example', name: 'Tina Here', passwordHash: 'x' });
		const r = await importBundle(db, dzBundle(), { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, source: 'jumpmaster', now: NOW });
		expect(r.error).toBeUndefined();
		expect(r.ok).toBe(true);
		expect(r.counts).toMatchObject({ dropzone: 1, aircraft: 1, loads: 2, slots: 5, tandems: 2, bookingSlots: 2, teams: 1, indemnitySections: 2, rigs: 2 });
		// people: owner → importer, tina matched, 6 others become placeholders
		expect(r.counts.placeholders).toBe(6);
		const ownerRow = (await db.select().from(users).where(eq(users.id, owner.id)))[0];
		expect(ownerRow.sourceRef).toBe(`jm:users/${OWNER_UID}`);
		const tinaRow = (await db.select().from(users).where(eq(users.id, tina.id)))[0];
		expect(tinaRow.name).toBe('Tina Here'); // real accounts aren't overwritten
		const video = (await db.select().from(users).where(eq(users.sourceRef, 'jm:users/u_video')))[0];
		expect(video.email).toMatch(/@placeholder\.invalid$/);
		expect(video.passwordHash).toBeNull();
		// roles
		const roles = await db.select().from(dropzoneMemberRoles).where(eq(dropzoneMemberRoles.dropzoneId, dz.id));
		const roleOf = (uid: string) => roles.filter((x) => x.userId === uid).map((x) => x.role).sort();
		expect(roleOf(tina.id)).toEqual(['tandem_instructor']);
		expect(roles.find((x) => x.userId === tina.id)!.colour).toBe('#2196F3');
		expect(roleOf(owner.id)).toEqual(['owner']);
		// dropzone profile + prices (minor units)
		const d = (await db.select().from(dropzones).where(eq(dropzones.id, dz.id)))[0];
		expect(d).toMatchObject({ openTime: '08:00', closeTime: '17:30', walletEnabled: true, sourceRef: 'jm:dropzones/dz_demo_01', currency: 'ZAR' });
		expect(d.name).toBe(dz.name); // name not renamed
		const sport = (await db.select().from(pricelistItems).where(and(eq(pricelistItems.dropzoneId, dz.id), eq(pricelistItems.code, 'sport_slot'))))[0];
		expect(sport.amountMinor).toBe(45000);
		// loads/slots as history, no wallet effects
		const l = await db.select().from(loads).where(eq(loads.dropzoneId, dz.id));
		expect(l.map((x) => [x.loadNumber, x.status]).sort()).toEqual([
			[1, 'completed'],
			[2, 'cancelled']
		]);
		expect(l.find((x) => x.loadNumber === 1)!.aircraftId).toBeTruthy();
		const s = await db.select().from(slots).where(eq(slots.dropzoneId, dz.id));
		const pax = s.find((x) => x.displayName === 'Pat Passenger')!;
		const ti = s.find((x) => x.userId === tina.id)!;
		expect(pax.tandemPassengerId).toBeTruthy();
		expect(pax.groupId).toBe(ti.groupId);
		expect(pax.totalMinor).toBe(350000);
		expect(await count(db, ledgerEntries)).toBe(0);
		expect(await count(db, logbookJumps)).toBe(0);
		// tandem passengers keep their confirmation numbers
		const t = await db.select().from(tandemPassengers).where(eq(tandemPassengers.dropzoneId, dz.id));
		expect(t.map((x) => x.confirmationNumber).sort()).toEqual(['JM12345', 'JM99999']);
		// teams, members, followers, waivers, booking slots
		expect(await count(db, teamMembers)).toBe(2);
		expect(await count(db, dropzoneFollows, eq(dropzoneFollows.dropzoneId, dz.id))).toBe(1);
		expect(await count(db, indemnitySections, eq(indemnitySections.dropzoneId, dz.id))).toBe(2);
		const bs = await db.select().from(bookingSlots).where(eq(bookingSlots.dropzoneId, dz.id));
		expect(bs.find((x) => x.weekday === 5)!.time).toBe('09:00');
	});

	test('re-import is idempotent', async () => {
		const { db, dz, owner } = await setup();
		await importBundle(db, dzBundle(), { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, now: NOW });
		const snapshot = async () => ({
			users: await count(db, users),
			loads: await count(db, loads),
			slots: await count(db, slots),
			tandems: await count(db, tandemPassengers),
			aircraft: await count(db, aircraft),
			teams: await count(db, teams),
			members: await count(db, teamMembers),
			booking: await count(db, bookingSlots),
			sections: await count(db, indemnitySections),
			rigs: await count(db, rigs),
			roles: await count(db, dropzoneMemberRoles)
		});
		const before = await snapshot();
		const b = dzBundle();
		b.dropzone!.loads![0].pilotName = 'New Pilot';
		const r2 = await importBundle(db, b, { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, now: NOW });
		expect(r2.ok).toBe(true);
		expect(r2.counts.placeholders ?? 0).toBe(0);
		expect(await snapshot()).toEqual(before);
		const l1 = (await db.select().from(loads).where(and(eq(loads.dropzoneId, dz.id), eq(loads.loadNumber, 1))))[0];
		expect(l1.pilotName).toBe('New Pilot');
	});

	test('skips a load whose day/number is already taken by a native load', async () => {
		const { db, dz, owner } = await setup();
		await db.insert(loads).values({ id: crypto.randomUUID(), dropzoneId: dz.id, day: '2024-03-09', loadNumber: 1, capacity: 10 });
		const r = await importBundle(db, dzBundle(), { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, now: NOW });
		expect(r.counts.loads).toBe(1);
		expect(r.warnings.some((w) => w.includes('already exists'))).toBe(true);
	});

	test('wallet opening balances are applied once, in the DZ currency only', async () => {
		const { db, dz, owner } = await setup();
		const b = dzBundle();
		b.dropzone!.wallets = [
			{ ref: 'jm:w1', person: `jm:users/${UID}`, dropzoneRef: b.dropzone!.ref, currency: 'ZAR', availableMinor: 125050, ledger: [] },
			{ ref: 'jm:w2', person: 'jm:users/u_walkin', dropzoneRef: null, currency: 'USD', availableMinor: 500, ledger: [] },
			{ ref: 'jm:w3', person: 'jm:users/u_pilot', dropzoneRef: null, currency: 'ZAR', availableMinor: -2000, ledger: [] }
		];
		await importBundle(db, b, { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, now: NOW });
		await importBundle(db, b, { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, now: NOW });
		const jo = (await db.select().from(users).where(eq(users.sourceRef, `jm:users/${UID}`)))[0];
		const acct = (await db.select().from(walletAccounts).where(and(eq(walletAccounts.userId, jo.id), eq(walletAccounts.dropzoneId, dz.id))))[0];
		expect(acct.availableMinor).toBe(125050);
		const pilot = (await db.select().from(users).where(eq(users.sourceRef, 'jm:users/u_pilot')))[0];
		const pAcct = (await db.select().from(walletAccounts).where(eq(walletAccounts.userId, pilot.id)))[0];
		expect(pAcct.availableMinor).toBe(-2000);
		expect(await count(db, walletAccounts)).toBe(2);
	});

	test('a jumper who later imports their own logbook matches the DZ-created placeholder only via email', async () => {
		const { db, dz, owner } = await setup();
		await importBundle(db, dzBundle(), { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, now: NOW });
		const me = await makeUser(db, { email: 'different@example.com' });
		const r = await importBundle(db, jumperBundle(), { userId: me.id, mode: 'jumper', now: NOW });
		expect(r.ok).toBe(true);
		expect(r.warnings.some((w) => w.includes('placeholder'))).toBe(true);
	});

	test('preview reports new people', async () => {
		const { db, dz, owner } = await setup();
		const p = await previewBundle(db, dzBundle(), { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id });
		expect(p.counts).toMatchObject({ loads: 2, slots: 5, tandems: 2 });
		expect(p.newPeople).toBe(8);
		expect(p.samples.loads).toHaveLength(2);
	});
});

describe('export → import round trip', () => {
	test('jumper data moves between instances', async () => {
		const a = freshDb();
		const meA = await makeUser(a, { email: 'jo@example.com' });
		await importBundle(a, jumperBundle(), { userId: meA.id, mode: 'jumper' });
		const exported = await exportJumper(a, meA.id, 'http://a.example');
		const wire = parseBundle(JSON.parse(JSON.stringify(exported)));
		expect(wire.jumper!.jumps).toHaveLength(3);
		const b = freshDb();
		const meB = await makeUser(b, { email: 'jo@example.com' });
		await importBundle(b, wire, { userId: meB.id, mode: 'jumper' });
		await importBundle(b, wire, { userId: meB.id, mode: 'jumper' });
		const jumps = await b.select().from(logbookJumps).where(eq(logbookJumps.userId, meB.id));
		expect(jumps).toHaveLength(3);
		expect(jumps.map((j) => j.jumpNumber).sort()).toEqual([151, 152, 153]);
		// exporting from A and re-importing into A doesn't duplicate (refs are preserved)
		await importBundle(a, wire, { userId: meA.id, mode: 'jumper' });
		expect(await count(a, logbookJumps, eq(logbookJumps.userId, meA.id))).toBe(3);
		const csv = await exportLogbookCsv(a, meA.id);
		expect(csv.split('\r\n')[0]).toContain('Jump #');
		expect(csv).toContain('151,2024-03-09,Skydive Demo DZ');
	});

	test('dropzone data moves to a fresh dropzone on another instance', async () => {
		const a = freshDb();
		const { dz: dzA, owner: ownerA } = await makeDropzone(a);
		await importBundle(a, dzBundle(), { userId: ownerA.id, mode: 'dropzone', dropzoneId: dzA.id, now: NOW });
		const wire = parseBundle(JSON.parse(JSON.stringify(await exportDropzone(a, dzA.id))));
		expect(wire.dropzone!.loads).toHaveLength(2);
		expect(wire.dropzone!.prices!.sport_slot).toBe(45000);
		const b = freshDb();
		const { dz: dzB, owner: ownerB } = await makeDropzone(b);
		const r = await importBundle(b, wire, { userId: ownerB.id, mode: 'dropzone', dropzoneId: dzB.id, now: NOW });
		expect(r.ok).toBe(true);
		expect(await count(b, slots, eq(slots.dropzoneId, dzB.id))).toBe(5);
		expect(await count(b, tandemPassengers, eq(tandemPassengers.dropzoneId, dzB.id))).toBe(2);
		const ti = (await b.select().from(users).where(eq(users.email, 'tina@demo-dz.example')))[0];
		expect(ti).toBeTruthy();
	});
});

describe('Jump Master connector (mock REST)', () => {
	const projectId = 'mock-project';
	const apiKey = 'mock-key';
	function mock() {
		return createMockJumpMaster({
			projectId,
			apiKey,
			accounts: [
				{ email: 'jo.jumper@example.com', password: 'jm-secret-1', uid: UID },
				{ email: 'owner@jm-only.example', password: 'jm-secret-2', uid: OWNER_UID }
			],
			store: docStore(jumperDocs(), dropzoneDocs()),
			pageSize: 2
		});
	}

	test('bad credentials surface a friendly error', async () => {
		const m = mock();
		const c = new JumpMasterConnector({ projectId, apiKey, authBaseUrl: 'http://jm.test', firestoreBaseUrl: 'http://jm.test', fetch: m.fetch });
		await expect(c.signIn('jo.jumper@example.com', 'wrong')).rejects.toThrow(/Wrong password/);
		await expect(c.signIn('nobody@example.com', 'x')).rejects.toBeInstanceOf(ConnectorError);
	});

	test('jumper: sign in, fetch own docs (paged), map, import', async () => {
		const m = mock();
		const c = new JumpMasterConnector({ projectId, apiKey, authBaseUrl: 'http://jm.test', firestoreBaseUrl: 'http://jm.test', fetch: m.fetch });
		await c.signIn('jo.jumper@example.com', 'jm-secret-1');
		const steps: string[] = [];
		const docs = await c.fetchJumper((s, d) => steps.push(`${s}:${d?.collection ?? ''}`));
		expect(docs.jumps).toHaveLength(4);
		expect(docs.user!.display_name).toBe('Jo Jumper');
		expect(steps).toContain('collection:jumps');
		// password only ever sent to the auth endpoint
		const withPw = m.log.filter((e) => e.body.includes('jm-secret-1'));
		expect(withPw.map((e) => e.path.split('?')[0])).toEqual(['/v1/accounts:signInWithPassword']);
		const db = freshDb();
		const me = await makeUser(db);
		const bundle = parseBundle(JSON.parse(JSON.stringify(mapJumpMasterDocs(docs, { timezone: TZ }).bundle)));
		const r = await importBundle(db, bundle, { userId: me.id, mode: 'jumper', source: 'jumpmaster' });
		expect(r.counts.jumps).toBe(3);
	});

	test('jumper cannot read a dropzone they do not own', async () => {
		const m = mock();
		const c = new JumpMasterConnector({ projectId, apiKey, authBaseUrl: 'http://jm.test', firestoreBaseUrl: 'http://jm.test', fetch: m.fetch });
		await c.signIn('jo.jumper@example.com', 'jm-secret-1');
		expect(await c.findOwnedDropzones()).toEqual([]);
		await expect(c.fetchDropzone('dz_demo_01')).rejects.toThrow(/refused/);
	});

	test('owner: find owned dropzone, fetch sub-lists + people, import', async () => {
		const m = mock();
		const c = new JumpMasterConnector({ projectId, apiKey, authBaseUrl: 'http://jm.test', firestoreBaseUrl: 'http://jm.test', fetch: m.fetch });
		await c.signIn('owner@jm-only.example', 'jm-secret-2');
		const owned = await c.findOwnedDropzones();
		expect(owned.map((d) => d.id)).toEqual(['dz_demo_01']);
		const docs = await c.fetchDropzone('dz_demo_01');
		expect(docs.dropzone!.slot).toHaveLength(6);
		expect(docs.users!.length).toBeGreaterThanOrEqual(6);
		const db = freshDb();
		const { dz, owner } = await makeDropzone(db);
		const bundle = parseBundle(JSON.parse(JSON.stringify(mapJumpMasterDocs(docs, { timezone: TZ, now: NOW }).bundle)));
		const r = await importBundle(db, bundle, { userId: owner.id, mode: 'dropzone', dropzoneId: dz.id, source: 'jumpmaster', now: NOW });
		expect(r.ok).toBe(true);
		expect(r.counts.slots).toBe(5);
	});

	test('refuses to run without config', () => {
		expect(() => new JumpMasterConnector({ projectId: '', apiKey: '' })).toThrow(/not configured/);
	});
});

void CSV_TEMPLATE;
