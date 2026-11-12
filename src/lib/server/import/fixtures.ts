/**
 * Test fixtures: realistic Jump Master documents in their JSON form (field names and types per
 * the original app's Firestore records), plus an encoder to the Firestore REST wire format for
 * the connector's mock server. Test-only.
 */
import type { JmDocs, JmDropzoneDocs } from '../../import/jumpmaster/map.ts';
import type { JmDoc } from '../../import/jumpmaster/values.ts';

export const UID = 'u_jumper_01';
export const OWNER_UID = 'u_owner_01';
export const DZ_ID = 'dz_demo_01';
const ts = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 });
const uref = (id: string) => `users/${id}`;

export function jumperUserDoc(id = UID, email = 'jo.jumper@example.com'): JmDoc {
	return {
		id,
		path: uref(id),
		uid: id,
		email,
		display_name: 'Jo Jumper',
		photo_url: '',
		created_time: ts('2023-01-10T08:00:00Z'),
		phone_number: '+27 82 555 0101',
		location: '12 Runway Rd, Parys',
		dob: ts('1990-05-04T00:00:00Z'),
		emergency_contact: 'Sam Jumper',
		emergency_contact_number: '+27 82 555 0102',
		skydive_association: 'PASA',
		skydive_association_number: 'PASA-12345',
		skydive_association_expiry: ts('2027-02-28T22:00:00Z'),
		skydive_association_expiry_status: true,
		license_number: 'C-4567',
		number_jumps: 150,
		weight: 78,
		loading_weight: 92,
		gear_container: 'Javelin Odyssey',
		parachute_main: 'Sabre3 150',
		wing_loading: 1.35,
		reserve_parachute: 'PD Optimum 143',
		reserve_repack: ts('2026-06-01T10:00:00Z'),
		userFollows: [uref(OWNER_UID)],
		ratings_list: { Jumpmaster: 'JM', Coach: 'Coach 1', Instructor: '', Tandem: '' },
		USPA_ratings: { Coach: ts('2027-12-31T00:00:00Z') },
		marketingOptIn: true
	};
}

export function jumperDocs(): JmDocs {
	const p = `users/${UID}`;
	return {
		format: 'jumpmaster-docs',
		version: 1,
		uid: UID,
		user: jumperUserDoc(),
		jumps: [
			{ id: 'j1', path: `${p}/jumps/j1`, createdTime: ts('2024-03-09T09:30:00Z'), user: p, jumpNum: 151, location: 'Skydive Demo DZ', plane: 'Cessna 208', altitude: '13,500ft', FFTime: 60, totalTime: '02:31:00', description: '4 way Belly', signature: 'https://example/sig.png', signatureLicense: 'D-1001', customJump: false },
			{ id: 'j2', path: `${p}/jumps/j2`, createdTime: ts('2024-03-09T13:05:00Z'), user: p, jumpNum: 152, location: 'Skydive Demo DZ', plane: 'Cessna 208', altitude: '13500', FFTime: 55, description: 'Solo Tracking', signature: '', signatureLicense: '', customJump: true },
			// 23:30 UTC on 10 March = 11 March in Johannesburg (tz normalisation)
			{ id: 'j3', path: `${p}/jumps/j3`, createdTime: '2024-03-10T23:30:00Z', user: p, jumpNum: 153, location: 'Elsewhere DZ', plane: 'Kodiak', altitude: '4000m', FFTime: '50', description: 'Freeflying jump', customJump: true },
			{ id: 'j4', path: `${p}/jumps/j4`, createdTime: null, jumpNum: 154, description: 'no date' }
		],
		gear: [
			{ id: 'g1', path: `${p}/gear/g1`, gear_container: 'Vector 3', parachute_main: 'Sabre2 170', wing_loading: 1.1, reserve_parachute: 'PD 160', reserve_repack: ts('2026-01-15T00:00:00Z'), aad_info: 'Cypres 2', wingsuit_info: '' }
		],
		jumperAccounts: [
			{ id: 'a1', path: `${p}/jumperAccounts/a1`, userRef: p, dzRef: `dropzones/${DZ_ID}`, currency: 'zar', available: 125050, pending: 40000, lifetimeTopup: 500000, lifetimeSpent: 334950, createdTime: ts('2023-02-01T00:00:00Z'), lastActivity: ts('2024-03-09T13:00:00Z') }
		],
		ledgerEntries: [
			{ id: 'l1', path: `${p}/ledgerEntries/l1`, accountRef: `${p}/jumperAccounts/a1`, userRef: p, dzRef: `dropzones/${DZ_ID}`, type: 'topup', amount: 100000, currency: 'zar', balanceAfter: 100000, provider: 'payfast', origin: 'payfast', reason: 'Payfast Payment', createdTime: ts('2023-02-01T00:00:00Z') }
		]
	};
}

export function dropzoneDocs(): JmDocs {
	const d = `dropzones/${DZ_ID}`;
	const load1 = `${d}/load/L1`;
	const load2 = `${d}/load/L2`;
	const dz: JmDropzoneDocs = {
		id: DZ_ID,
		path: d,
		name: 'Skydive Demo DZ',
		address: 'Parys Airfield',
		location: { latitude: -26.9, longitude: 27.45 },
		phone_number: '+27 56 555 0100',
		email: 'manifest@demo-dz.example',
		description: 'Friendly DZ on the Vaal.',
		open_time: '8:00 AM',
		close_time: '17:30',
		days_open: ['Saturday', 'Sunday', 'Wednesday'],
		owner: uref(OWNER_UID),
		manager: [uref('u_manifest')],
		staff_members: [],
		riggers: [uref('u_rigger')],
		tandemInstructors: [uref('u_ti')],
		tandemVideos: [uref('u_video')],
		pilots: [uref('u_pilot')],
		tandem_instructors_list: [{ user: uref('u_ti'), color: '0xFF2196F3' }],
		user_followers: [uref(UID)],
		stripeCurrency: 'zar',
		paymentsOn: true,
		paymentBypass: true,
		walletEnabled: true,
		indemnityTandemActive: true,
		indemnitySportyActive: false,
		emailNotices: true,
		planes: [
			{ id: 'P1', path: `${d}/planes/P1`, plane_name: 'Cessna 208', tail_number: 'ZS-ABC', pax: 16, weight_limit: 1500 }
		],
		pricelist: [
			{ id: 'PL', path: `${d}/pricelist/PL`, sportslot: 450, hoppop: 300, gearRental: 150, tandemSlot: 3200, handCam: 800, outsideCam: 1200, tandemDeposit: 500, tandemPayment: 900, pilotPayment: 500, aff1: 2500.5, dropzoneCurrency: 'R' }
		],
		load: [
			{ id: 'L1', path: load1, airplane: 'Cessna 208', pilot: 'Pete Pilot', pax: 16, weightLimit: 1500, pilotweight: 85, createdTime: ts('2024-03-09T07:00:00Z'), jumpTime: ts('2024-03-09T09:30:00Z'), loadNumber: 1, openToJump: true, loadRequirements: 'B licence+', refuel: true, shutdown: false, loadCompleted: true },
			{ id: 'L2', path: load2, airplane: 'Cessna 208', pilot: 'Pete Pilot', pax: 16, createdTime: ts('2024-03-09T07:00:00Z'), jumpTime: ts('2024-03-09T11:00:00Z'), loadNumber: 2, openToJump: false, loadCompleted: false }
		],
		slot: [
			{ id: 'S1', path: `${d}/slot/S1`, user: uref(UID), display_name: 'Jo Jumper', email: 'jo.jumper@example.com', license_number: 'C-4567', slotWeight: 92, load_number: load1, jump_type: 'Belly', team_jump: true, team_id: 7, teamName: 'Vaal Flyers', price: 450, gear_rental: true, gear_price: 150, paid: true, created_time: ts('2024-03-09T08:00:00Z') },
			{ id: 'S2', path: `${d}/slot/S2`, user: uref('u_ti'), display_name: 'Tina Tandem', email: 'tina@demo-dz.example', slotWeight: 100, load_number: load1, jump_type: 'Tandem', tandem_jump: true, tandem_id: 3, staffJump: true, staffPay: 900, price: 0, created_time: ts('2024-03-09T08:01:00Z') },
			{ id: 'S3', path: `${d}/slot/S3`, display_name: 'Pat Passenger', slotWeight: 80, load_number: load1, jump_type: 'Tandem', tandem_jump: true, tandem_id: 3, tandem_passanger: true, tandemPassenger: `${d}/tandems/T1`, price: 3200, handcam: true, handcamPrice: 800, deposit: 500, created_time: ts('2024-03-09T08:02:00Z') },
			{ id: 'S4', path: `${d}/slot/S4`, user: uref('u_walkin'), display_name: 'Walk In', email: 'walkin@example.com', slotWeight: 85, load_number: load1, jump_type: 'Hop & Pop', price: 300, jumpMaster: true, created_time: ts('2024-03-09T08:03:00Z') },
			{ id: 'S5', path: `${d}/slot/S5`, user: uref(UID), display_name: 'Jo Jumper', slotWeight: 92, load_number: load2, jump_type: 'Freeflying', price: 450, created_time: ts('2024-03-09T10:00:00Z') },
			{ id: 'S6', path: `${d}/slot/S6`, display_name: 'Orphan', load_number: `${d}/load/missing`, jump_type: 'Belly' }
		],
		tandems: [
			{ id: 'T1', path: `${d}/tandems/T1`, passangerName: 'Pat Passenger', passangerEmail: 'pat@example.com', passangerPhone: '+27 82 000 1111', passangerID: '9001015009087', passangerGender: 'Female', passangerDOB: ts('1990-01-01T00:00:00Z'), passangerNationality: 'South African', passangerHeight: 170, passangerWeight: 80, passangerAddress1: '1 Main St', passangerAddressCity: 'Johannesburg', passangerAddressCode: '2000', passangerAddressCntry: 'South Africa', emergencyName: 'Pam', emergencyPhone: '+27 82 000 2222', jumpTime: ts('2024-03-09T09:30:00Z'), timeSlot: ts('2024-03-09T07:00:00Z'), handCam: true, outsideCam: false, marketing: 'Instagram', tandemNote: 'Birthday jump', indemnityCheck: true, signDate: ts('2024-03-09T07:30:00Z'), manifested: true, tandemSlot: `${d}/slot/S3`, confirmationNumber: 'JM12345', onlineBooking: true, createdTime: ts('2024-03-01T12:00:00Z'), depositPaid: 500, paymentStatus: 'Paid', paymentAmount: '3500', paymentMethod: 'Cash' },
			{ id: 'T2', path: `${d}/tandems/T2`, passangerName: 'Bo Booked', passangerEmail: 'bo@example.com', jumpTime: ts('2027-01-09T09:00:00Z'), timeSlot: ts('2027-01-09T07:00:00Z'), confirmationNumber: 'JM99999', depositPaid: 500, paymentStatus: 'INCOMPLETE', onlineBooking: true }
		],
		bookingSlots: [
			{ id: 'B1', path: `${d}/bookingSlots/B1`, day: 'Saturday', timeSlot: ts('2024-03-09T07:00:00Z'), slotAmount: 4 },
			{ id: 'B2', path: `${d}/bookingSlots/B2`, timeSlot: ts('2027-01-09T08:00:00Z'), bookingDate: ts('2027-01-09T00:00:00Z'), slotAmount: 2 }
		],
		teams: [
			{ id: 'TM1', path: `${d}/teams/TM1`, users: [uref(UID), uref('u_walkin')], teamName: 'Vaal Flyers', descipline: 'FS', coach: uref('u_manifest'), slotColour: '#ff4caf50' }
		],
		indemnityQuestions: [
			{ id: 'Q2', path: `${d}/indemnityQuestions/Q2`, sectionTitle: 'Medical', sectionContent: 'I am fit to jump.', sectionType: 'Sport jumper', createdTime: ts('2023-01-02T00:00:00Z') },
			{ id: 'Q1', path: `${d}/indemnityQuestions/Q1`, sectionTitle: 'Risk', sectionContent: 'Skydiving is dangerous.', sectionType: 'Tandem', createdTime: ts('2023-01-01T00:00:00Z') }
		],
		indemnityForms: [{ id: 'F1', path: `${d}/indemnityForms/F1`, signature: 'x', signDate: ts('2024-01-01T00:00:00Z'), user: uref(UID), userName: 'Jo Jumper' }],
		dzgear: [
			{ id: 'G1', path: `${d}/dzgear/G1`, gear_container: 'Tandem 3', parachute_main: 'Sigma 340', reserve_parachute: 'Sigma 340R', reserve_repack: ts('2026-05-01T00:00:00Z'), aad_info: 'Vigil', gear_type: 'Tandem Rig' },
			{ id: 'G2', path: `${d}/dzgear/G2`, gear_container: 'Rental 1', parachute_main: 'Navigator 260', gear_type: 'Rental Rig' }
		]
	};
	const users: JmDoc[] = [
		{ id: OWNER_UID, path: uref(OWNER_UID), email: 'owner@jm-only.example', display_name: 'Olive Owner', license_number: 'D-1001' },
		{ id: 'u_manifest', path: uref('u_manifest'), email: 'manny@demo-dz.example', display_name: 'Manny Manifest' },
		{ id: 'u_rigger', path: uref('u_rigger'), email: 'rick@demo-dz.example', display_name: 'Rick Rigger' },
		{ id: 'u_ti', path: uref('u_ti'), email: 'tina@demo-dz.example', display_name: 'Tina Tandem', license_number: 'D-2002', ratings_list: { Tandem: 'TI' } },
		{ id: 'u_video', path: uref('u_video'), email: '', display_name: 'Vic Video' },
		{ id: 'u_pilot', path: uref('u_pilot'), email: 'pete@demo-dz.example', display_name: 'Pete Pilot' },
		jumperUserDoc()
	];
	return { format: 'jumpmaster-docs', version: 1, uid: OWNER_UID, dropzone: dz, users };
}

// ── Firestore REST encoding (for the mock server) ────────────────────────────

const ROOT = (project: string) => `projects/${project}/databases/(default)/documents`;

export function encodeValue(v: unknown, project: string, key = ''): Record<string, unknown> {
	if (v == null) return { nullValue: null };
	if (typeof v === 'boolean') return { booleanValue: v };
	if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
	if (typeof v === 'string') {
		if (/^(users|dropzones)\/[^/]+(\/[^/]+\/[^/]+)*$/.test(v) && !/\s/.test(v)) return { referenceValue: `${ROOT(project)}/${v}` };
		return { stringValue: v };
	}
	if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => encodeValue(x, project)) } };
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if ('seconds' in o && 'nanoseconds' in o) return { timestampValue: new Date(Number(o.seconds) * 1000).toISOString() };
		if ('latitude' in o && 'longitude' in o) return { geoPointValue: o };
		const fields: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(o)) fields[k] = encodeValue(x, project, k);
		return { mapValue: { fields } };
	}
	void key;
	return { nullValue: null };
}

export function encodeDoc(d: JmDoc, project: string) {
	const { id, path, ...rest } = d;
	const fields: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(rest)) fields[k] = encodeValue(v, project, k);
	return { name: `${ROOT(project)}/${path ?? id}`, fields, createTime: '2024-01-01T00:00:00Z', updateTime: '2024-01-01T00:00:00Z' };
}

/** Flatten fixtures into a path → doc map (what the mock Firestore serves). */
export function docStore(...sets: JmDocs[]): Map<string, JmDoc> {
	const store = new Map<string, JmDoc>();
	const put = (d: JmDoc) => store.set(d.path!, d);
	for (const s of sets) {
		if (s.user) put(s.user);
		for (const c of ['jumps', 'gear', 'jumperAccounts', 'ledgerEntries'] as const) (s[c] ?? []).forEach(put);
		for (const u of s.users ?? []) put(u);
		if (s.dropzone) {
			const { planes, pricelist, load, slot, tandems, bookingSlots, teams, indemnityQuestions, indemnityForms, dzgear, ...dz } = s.dropzone;
			put(dz as JmDoc);
			for (const list of [planes, pricelist, load, slot, tandems, bookingSlots, teams, indemnityQuestions, indemnityForms, dzgear]) (list ?? []).forEach(put);
		}
	}
	return store;
}
