/**
 * Demo data for local dev & screenshots: `bun run db:seed` (add `--reset` to wipe the DB first).
 * Creates "Skydive Demo DZ" (South Africa, ZAR) with aircraft, prices, staff, 30 jumpers, wallets,
 * logbook history, teams, tandems, booking slots, indemnity forms and a busy "today".
 * Uses the real domain services, so it doubles as an end-to-end smoke test of the domain layer.
 */
import { existsSync, rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { openSqlite } from '../src/lib/server/db/sqlite.ts';
import { dropzoneFollows, dropzones, users } from '../src/lib/server/db/schema.ts';
import { createUser } from '../src/lib/server/auth/users.ts';
import { createDropzone } from '../src/lib/server/dropzones/index.ts';
import { grantRole } from '../src/lib/server/domain/permissions.ts';
import { setPrices } from '../src/lib/server/domain/pricing.ts';
import { createAircraft, updateDropzone, upsertSubscription } from '../src/lib/server/domain/dropzone-admin.ts';
import { updateProfile, setRatings } from '../src/lib/server/domain/profile.ts';
import { createRig } from '../src/lib/server/domain/gear.ts';
import { topUp } from '../src/lib/server/domain/wallet.ts';
import { addJump, signJump } from '../src/lib/server/domain/logbook.ts';
import { checkIn } from '../src/lib/server/domain/checkins.ts';
import { createTeam, addBuddy } from '../src/lib/server/domain/teams.ts';
import {
	addSlot,
	addTandemGroup,
	boardLoad,
	completeLoad,
	createLoads,
	startCall
} from '../src/lib/server/domain/loads.ts';
import { addBookingSlots, createPassenger, recordTandemPayment } from '../src/lib/server/domain/tandems.ts';
import { addSection, setIndemnityActive, signIndemnity } from '../src/lib/server/domain/indemnity.ts';
import { addDays, localDate } from '../src/lib/server/domain/time.ts';
import type { JumpType } from '../src/lib/domain/constants.ts';

const DB_PATH = process.env.DATABASE_PATH ?? 'data/app.db';
const PASSWORD = 'blue-skies-123';
const TZ = 'Africa/Johannesburg';
const SLUG = 'skydive-demo-dz';

if (process.argv.includes('--reset')) {
	for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) if (existsSync(f)) rmSync(f);
}
const db = openSqlite({ path: DB_PATH, migrationsFolder: 'drizzle' });

const existing = await db.select().from(dropzones).where(eq(dropzones.slug, SLUG));
if (existing.length) {
	console.log(`"Skydive Demo DZ" already exists in ${DB_PATH}. Re-run with --reset to recreate.`);
	printLogins();
	process.exit(0);
}

// deterministic PRNG so screenshots are stable
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const now = Date.now();
const today = localDate(now, TZ);
const at = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00+02:00`);

async function person(email: string, name: string, extra: Parameters<typeof updateProfile>[2] = {}) {
	const u = await createUser(db, { email, name, password: PASSWORD });
	await updateProfile(db, u.id, {
		association: 'pasa',
		associationNumber: String(int(10000, 99999)),
		associationExpiry: addDays(today, int(60, 330)),
		weightKg: int(60, 95),
		loadingWeightKg: int(75, 110),
		emergencyName: 'Emergency Contact',
		emergencyPhone: '+27 82 000 0000',
		...extra
	});
	return (await db.select().from(users).where(eq(users.id, u.id)))[0];
}

// ── dropzone ────────────────────────────────────────────────────────────────
const owner = await person('owner@demo.example', 'Olivia van der Merwe', { licence: 'D-1042', declaredJumpCount: 2350 });
const dz = await createDropzone(
	db,
	{ name: 'Skydive Demo DZ', slug: SLUG, country: 'ZA', timezone: TZ, currency: 'ZAR' },
	owner.id
);
await updateDropzone(db, dz.id, {
	description:
		'Friendly drop zone on the West Coast with a Cessna Caravan and a C182. Fun jumpers, AFF students and tandems welcome every weekend.',
	address: 'Demo Airfield, R27, Western Cape, South Africa',
	lat: -33.0286,
	lng: 18.1667,
	contactEmail: 'manifest@demo.example',
	contactPhone: '+27 21 555 0123',
	website: 'https://example.com',
	openDays: ['wed', 'sat', 'sun'],
	openTime: '08:00',
	closeTime: '17:30',
	walletEnabled: true,
	paymentsOn: false,
	payAtManifest: true,
	emailNotices: true,
	indemnitySportActive: true,
	indemnityTandemActive: true
});
await db
	.update(dropzones)
	.set({ settings: { units: 'metric', defaultAltitudeFt: 10000, gearWarnDays: 30, defaultCapacity: 16 } })
	.where(eq(dropzones.id, dz.id));
await upsertSubscription(db, dz.id, {
	plan: 'founding',
	status: 'active',
	provider: 'stripe',
	priceMinor: 9900,
	currency: 'USD',
	interval: 'month',
	startedAt: new Date(now - 90 * 86400_000),
	currentPeriodEnd: new Date(now + 20 * 86400_000)
});

await setPrices(db, dz.id, {
	sport_slot: 45000,
	hop_pop: 30000,
	gear_rental: 25000,
	extra_altitude: 10000,
	max_altitude: 20000,
	special_event: 5000,
	static_line: 120000,
	static_line_course: 450000,
	isp: 70000,
	coach: 90000,
	aff_1_3: 350000,
	aff_4_7: 280000,
	aff_8_10: 220000,
	aff_course: 2400000,
	tandem_deposit: 50000,
	tandem_slot: 340000,
	tandem_outside_video: 120000,
	tandem_handcam: 90000,
	tandem_extreme_ride: 30000,
	tandem_beach_landing: 50000,
	tandem_extra_altitude: 50000,
	tandem_max_altitude: 100000,
	pay_tandem: 100000,
	pay_tandem_video: 60000,
	pay_handcam: 20000,
	pay_aff: 80000,
	pay_coach: 40000,
	pay_pilot: 60000
});

// ── staff ───────────────────────────────────────────────────────────────────
const manifest = await person('manifest@demo.example', 'Manny Mokoena', { licence: 'C-2210', declaredJumpCount: 640 });
const pilot1 = await person('pilot1@demo.example', 'Piet Pretorius', { weightKg: 88 });
const pilot2 = await person('pilot2@demo.example', 'Palesa Dlamini', { weightKg: 64 });
const ti1 = await person('ti1@demo.example', 'Thabo Nkosi', { licence: 'D-1188', declaredJumpCount: 4100 });
const ti2 = await person('ti2@demo.example', 'Tessa Botha', { licence: 'D-1301', declaredJumpCount: 3200 });
const ti3 = await person('ti3@demo.example', 'Tiaan Steyn', { licence: 'D-1420', declaredJumpCount: 2800 });
const video = await person('video@demo.example', 'Vusi Khumalo', { licence: 'C-2577', declaredJumpCount: 1500 });
const affi = await person('affi@demo.example', 'Anika Fourie', { licence: 'D-1250', declaredJumpCount: 3600 });
const rigger = await person('rigger@demo.example', 'Ricardo Ferreira', { licence: 'C-2020', declaredJumpCount: 900 });

const roles: [typeof owner, Parameters<typeof grantRole>[1]['role'][], string?][] = [
	[manifest, ['manifest', 'admin']],
	[pilot1, ['pilot']],
	[pilot2, ['pilot']],
	[ti1, ['tandem_instructor', 'coach'], '#22c55e'],
	[ti2, ['tandem_instructor'], '#f97316'],
	[ti3, ['tandem_instructor', 'videographer'], '#a855f7'],
	[video, ['videographer', 'coach']],
	[affi, ['aff_instructor', 'instructor', 'coach']],
	[rigger, ['rigger', 'staff']]
];
for (const [u, rs, colour] of roles) {
	for (const role of rs) {
		await grantRole(db, {
			dropzoneId: dz.id,
			userId: u.id,
			role,
			colour: role === 'tandem_instructor' ? (colour ?? null) : null,
			by: owner.id,
			dropzoneName: dz.name
		});
	}
}
for (const u of [ti1, ti2, ti3, affi, owner]) {
	await setRatings(db, u.id, 'pasa', [{ rating: 'Tandem' }, { rating: 'AFF Instructor' }, { rating: 'Coach' }], { verified: true });
}
await setRatings(db, rigger.id, 'pasa', [{ rating: 'Senior Parachute Technician' }], { verified: true });

// ── aircraft ────────────────────────────────────────────────────────────────
const caravan = await createAircraft(db, dz.id, {
	name: 'Cessna Caravan',
	tailNumber: 'ZS-SKY',
	capacity: 16,
	weightLimitKg: 1600,
	defaultPilotId: pilot1.id
});
const c182 = await createAircraft(db, dz.id, {
	name: 'Cessna 182',
	tailNumber: 'ZS-JMP',
	capacity: 4,
	weightLimitKg: 460,
	defaultPilotId: pilot2.id
});

// ── jumpers ─────────────────────────────────────────────────────────────────
const FIRST = ['Sipho', 'Lerato', 'Johan', 'Megan', 'Kabelo', 'Annelie', 'Ruan', 'Zanele', 'Pieter', 'Naledi', 'Chris', 'Ayanda', 'Liezl', 'Bongani', 'Carla', 'Dewald', 'Nomsa', 'Ethan', 'Karabo', 'Elize', 'Jaco', 'Palesa', 'Wian', 'Thandi', 'Marco', 'Lindiwe', 'Hendrik', 'Refilwe', 'Gareth', 'Busi'];
const LAST = ['Mahlangu', 'Venter', 'Nel', 'Smith', 'Molefe', 'Kruger', 'Joubert', 'Zulu', 'Coetzee', 'Ndlovu', 'Pillay', 'Naidoo', 'Swanepoel', 'Mthembu', 'Olivier'];
const jumpers: (typeof owner)[] = [];
for (let i = 0; i < 30; i++) {
	// jumper@ (i = 0) is the licensed fun jumper from the login list (logbook, rig, wallet); 1–3 are students
	const jumps = i === 0 ? 180 : i < 4 ? int(5, 20) : int(25, 1200);
	const licence = jumps < 25 ? null : jumps < 200 ? `A-${3000 + i}` : jumps < 500 ? `B-${2500 + i}` : `C-${2100 + i}`;
	const email = i === 0 ? 'jumper@demo.example' : `jumper${i}@demo.example`;
	const u = await person(email, `${FIRST[i]} ${pick(LAST)}`, {
		licence,
		association: jumps < 25 ? 'pasa_student' : 'pasa',
		declaredJumpCount: Math.max(0, jumps - 6),
		// one expired membership to show the manifest warning
		associationExpiry: i === 7 ? addDays(today, -12) : addDays(today, int(30, 330)),
		marketingOptIn: rnd() > 0.5
	});
	jumpers.push(u);
	await grantRole(db, { dropzoneId: dz.id, userId: u.id, role: 'jumper' });
	await db.insert(dropzoneFollows).values({ dropzoneId: dz.id, userId: u.id, favourite: i % 3 === 0 }).onConflictDoNothing();
	if (licence) {
		const repack = addDays(today, -int(5, 200)); // some overdue (>180), some due soon
		await createRig(
			db,
			{ userId: u.id },
			{
				name: 'My rig',
				container: pick(['Javelin Odyssey', 'Vector 3', 'Mirage G4', 'Infinity', 'Wings']),
				mainCanopy: pick(['Sabre3', 'Pilot', 'Safire 3', 'Crossfire 3', 'Stiletto']),
				mainSizeSqft: pick([120, 135, 150, 170, 190]),
				reserveCanopy: pick(['PD Reserve', 'Smart', 'Optimum']),
				reserveSizeSqft: pick([143, 160, 176, 193]),
				reserveRepackedOn: repack,
				aad: pick(['Cypres 2', 'Vigil 2+', 'Mars M2']),
				aadServiceDueOn: addDays(today, int(-10, 900))
			}
		);
	}
	// wallet: most jumpers prepaid
	if (i % 5 !== 4) {
		await topUp(db, {
			userId: u.id,
			dropzoneId: dz.id,
			amountMinor: int(4, 12) * 50000,
			provider: pick(['payfast', 'card', 'cash'] as const),
			providerTxId: `seed-${i}`,
			reason: 'Top-up',
			createdBy: manifest.id,
			now: now - int(2, 20) * 86400_000
		});
	}
	// manual logbook history (signed by an instructor sometimes)
	for (let k = 0; k < 5; k++) {
		const j = await addJump(db, u.id, {
			jumpDate: addDays(today, -int(20, 300)),
			location: pick(['Skydive Demo DZ', 'Skydive Robertson', 'Pretoria Skydiving Club', 'Mossel Bay']),
			aircraft: pick(['Cessna Caravan', 'Cessna 182', 'King Air']),
			altitudeFt: pick([10000, 12000, 14000]),
			freefallSeconds: int(35, 65),
			jumpType: pick(['belly', 'freefly', 'tracking', 'angle'] as const),
			description: pick(['Fun jump', 'Sunset load', '4 way practice', 'Coaching dive', 'Big way prep'])
		});
		if (rnd() > 0.6) await signJump(db, { jumpId: j.id, signerUserId: pick([ti1, ti2, affi]).id });
	}
}
await addBuddy(db, jumpers[0].id, jumpers[1].id);
await addBuddy(db, jumpers[0].id, jumpers[2].id);
await addBuddy(db, jumpers[1].id, jumpers[0].id);

// DZ rigs
for (let i = 1; i <= 4; i++) {
	await createRig(db, { dropzoneId: dz.id }, {
		kind: 'tandem',
		name: `Tandem ${i}`,
		container: 'Sigma',
		mainCanopy: 'Sigma 340',
		reserveCanopy: 'Sigma 360R',
		reserveRepackedOn: addDays(today, -int(100, 185)),
		aad: 'Cypres 2 Tandem',
		aadServiceDueOn: addDays(today, int(30, 700))
	});
}
for (let i = 1; i <= 3; i++) {
	await createRig(db, { dropzoneId: dz.id }, {
		kind: 'rental',
		name: `Rental ${i}`,
		container: 'Student Mirage',
		mainCanopy: 'Navigator 260',
		reserveCanopy: 'PD 253R',
		reserveRepackedOn: addDays(today, -int(10, 170)),
		aad: 'Cypres 2 Student'
	});
}

// ── teams ───────────────────────────────────────────────────────────────────
const sharks = await createTeam(
	db,
	{ dropzoneId: dz.id },
	{ name: 'Cape Sharks 4-way', discipline: '4 way FS', colour: '#0ea5e9', coachUserId: ti1.id, videoUserId: video.id, memberIds: jumpers.slice(10, 14).map((j) => j.id) },
	{ by: manifest.id }
);
await createTeam(
	db,
	{ dropzoneId: dz.id },
	{ name: 'Westcoast Freeflyers', discipline: 'Freefly', colour: '#f43f5e', memberIds: jumpers.slice(14, 17).map((j) => j.id) },
	{ by: manifest.id }
);

// ── indemnity ───────────────────────────────────────────────────────────────
const SPORT = [
	['Assumption of risk', 'I understand that skydiving is a dangerous activity that may result in serious injury or death.'],
	['Equipment', 'I confirm my equipment is airworthy, my reserve is in date and my AAD is serviced.'],
	['Rules', 'I will follow the dropzone rules, PASA regulations and the instructions of the jumpmaster.']
];
const TANDEM = [
	['Medical declaration', 'I am in good health and have no medical condition that prevents me from skydiving.'],
	['Assumption of risk', 'I accept that tandem skydiving carries inherent risks, including serious injury or death.'],
	['Photography', 'I consent to photos and video of my jump being taken and used by the dropzone.']
];
for (const [title, content] of SPORT) await addSection(db, { dropzoneId: dz.id, audience: 'sport', title, content, type: 'acknowledgement' });
for (const [title, content] of TANDEM) await addSection(db, { dropzoneId: dz.id, audience: 'tandem', title, content, type: 'acknowledgement' });
await setIndemnityActive(db, dz.id, 'sport', true);
for (const j of jumpers.slice(0, 25)) {
	await signIndemnity(db, { dropzoneId: dz.id, audience: 'sport', userId: j.id, signerName: j.name, now: now - 30 * 86400_000 });
}

// ── booking slots (online tandem booking) ──────────────────────────────────
for (const time of ['09:00', '11:00', '14:00']) {
	await addBookingSlots(db, { dropzoneId: dz.id, date: today, time, capacity: 4, repeat: 'daily' });
}

/** Manifest one jumper; jumpers without wallet funds pay at manifest (no hold). */
async function manifestOne(loadId: string, input: Parameters<typeof addSlot>[2], ts: number) {
	try {
		return await addSlot(db, loadId, input, { by: manifest.id, allowExpired: true, now: ts });
	} catch (e) {
		if ((e as { code?: string }).code !== 'insufficient_funds') {
			console.warn(`  skip: ${(e as Error).message}`);
			return null;
		}
		return addSlot(db, loadId, input, { by: manifest.id, allowExpired: true, skipWallet: true, now: ts });
	}
}

// ── a past jump day (completed loads → verified logbook entries, wallet charges) ──
const past = addDays(today, -7);
const sportTypes: JumpType[] = ['belly', 'freefly', 'tracking', 'angle', 'hop_pop'];
const pastLoads = await createLoads(db, {
	dropzoneId: dz.id,
	day: past,
	count: 3,
	aircraftId: caravan.id,
	open: true,
	createdBy: manifest.id,
	now: at(past, '08:00')
});
for (const [i, load] of pastLoads.entries()) {
	const group = jumpers.slice(i * 6, i * 6 + 6);
	for (const u of group) {
		await manifestOne(load.id, { userId: u.id, jumpType: pick(sportTypes) }, at(past, '08:30'));
	}
	await completeLoad(db, load.id, { by: manifest.id, now: at(past, `${10 + i}:30`) });
}

// ── today ───────────────────────────────────────────────────────────────────
for (const [k, j] of jumpers.slice(0, 22).entries()) {
	await checkIn(db, { dropzoneId: dz.id, userId: j.id, by: k % 2 ? manifest.id : null, gearRental: !j.licence, now: at(today, '07:45') });
}
for (const s of [ti1, ti2, ti3, video, affi, pilot1, pilot2, rigger]) {
	await checkIn(db, { dropzoneId: dz.id, userId: s.id, now: at(today, '07:30') });
}

const tandemNames = ['Emma Jacobs', 'Lwazi Sithole', 'Hannah Meyer', 'Tumelo Radebe', 'Sarah Adams', 'Kyle Daniels'];
const passengers = [];
for (const [i, name] of tandemNames.entries()) {
	const p = await createPassenger(db, dz.id, {
		name,
		email: `${name.split(' ')[0].toLowerCase()}@example.com`,
		phone: '+27 72 000 00' + String(10 + i),
		gender: i % 2 ? 'male' : 'female',
		dob: `199${i}-0${(i % 9) + 1}-15`,
		nationality: i === 2 ? 'Germany' : 'South Africa',
		weightKg: int(55, 92),
		heightCm: int(155, 190),
		city: 'Cape Town',
		country: 'South Africa',
		emergencyName: 'Family Member',
		emergencyPhone: '+27 83 000 0000',
		jumpDate: today,
		bookingTime: ['09:00', '09:00', '11:00', '11:00', '14:00', '14:00'][i],
		extras: [['handcam'], ['outside_video'], ['handcam', 'extra_altitude'], [], ['beach_landing'], ['outside_video', 'max_altitude']][i] as never,
		heardFrom: pick(['Google Search', 'Friend', 'Instagram', 'Voucher']),
		depositMinor: i < 4 ? 50000 : 0,
		onlineBooking: i < 4
	});
	await signIndemnity(db, { dropzoneId: dz.id, audience: 'tandem', tandemPassengerId: p.id, signerName: name, now: at(today, '07:50') });
	passengers.push(p);
}
await recordTandemPayment(db, { passengerId: passengers[0].id, amountMinor: passengers[0].totalMinor - 50000, provider: 'card', by: manifest.id });

const todays = await createLoads(db, {
	dropzoneId: dz.id,
	day: today,
	count: 6,
	aircraftId: caravan.id,
	open: true,
	createdBy: manifest.id,
	scheduledAt: at(today, '08:30'),
	now: at(today, '07:40')
});
const extra182 = await createLoads(db, { dropzoneId: dz.id, day: today, aircraftId: c182.id, open: true, createdBy: manifest.id });

const fill = async (loadIdx: number, from: number, to: number, ts: string) => {
	const list = jumpers.slice(from, to).filter((j) => j.id !== jumpers[7].id);
	for (const u of list) {
		await manifestOne(
			todays[loadIdx].id,
			{ userId: u.id, jumpType: u.licence ? pick(sportTypes) : 'aff_1_3', extras: rnd() > 0.8 ? ['extra_altitude'] : [] },
			at(today, ts)
		);
	}
};

// load 1: tandems + fun jumpers → completed
await addTandemGroup(db, { loadId: todays[0].id, passengerId: passengers[0].id, instructorUserId: ti1.id, videographerUserId: video.id }, { by: manifest.id });
await addTandemGroup(db, { loadId: todays[0].id, passengerId: passengers[1].id, instructorUserId: ti2.id, videographerUserId: ti3.id }, { by: manifest.id });
await fill(0, 0, 6, '08:10');
await completeLoad(db, todays[0].id, { by: manifest.id, now: at(today, '09:05') });
// load 2: team + AFF → completed
const { manifestTeam } = await import('../src/lib/server/domain/teams.ts');
await manifestTeam(db, { teamId: sharks.id, loadId: todays[1].id, jumpType: 'belly' }, { by: manifest.id });
await manifestOne(todays[1].id, { userId: jumpers[1].id, jumpType: 'aff_4_7' }, now);
await addSlot(db, todays[1].id, { userId: affi.id, jumpType: 'aff_4_7', staffRole: 'aff_instructor' }, { by: manifest.id });
await completeLoad(db, todays[1].id, { by: manifest.id, now: at(today, '10:10') });
// load 3: boarding
await addTandemGroup(db, { loadId: todays[2].id, passengerId: passengers[2].id, instructorUserId: ti3.id }, { by: manifest.id });
await fill(2, 6, 12, '09:30');
await startCall(db, todays[2].id, { by: manifest.id, now: at(today, '10:20') });
await boardLoad(db, todays[2].id, { by: manifest.id, now: at(today, '10:40') });
// load 4: 20-minute call running now
await fill(3, 17, 24, '10:00');
await startCall(db, todays[3].id, { by: manifest.id, now: now - 5 * 60_000 });
// loads 5-6 open with a few slots; C182 hop & pops
await fill(4, 24, 28, '10:30');
await fill(5, 28, 30, '10:30');
for (const u of jumpers.slice(18, 20)) {
	await manifestOne(extra182[0].id, { userId: u.id, jumpType: 'hop_pop' }, now);
}

printLogins();

function printLogins() {
	console.log(`\nSeeded ${DB_PATH}\n`);
	console.log('Demo logins (password for all: ' + PASSWORD + '):');
	console.log('  owner@demo.example     — owner of Skydive Demo DZ');
	console.log('  manifest@demo.example  — manifest + admin');
	console.log('  ti1@demo.example       — tandem instructor + coach');
	console.log('  rigger@demo.example    — rigger');
	console.log('  jumper@demo.example    — fun jumper with logbook, rig and wallet');
}
