/**
 * Jump Master documents → Log-Book bundle. Pure and client-safe: the browser connector runs it before
 * POSTing, and the server runs it for uploaded `jumpmaster-docs` files.
 *
 * Field names follow the original app's Firestore records exactly (typos included:
 * `passanger*`, `descipline`). Money: wallet/ledger amounts are cents in the original; price
 * list, slot prices and tandem payments are major units and get ×100.
 */
import {
	JUMP_TYPE_LABELS,
	SLOT_EXTRA_LABELS,
	type Association,
	type DropzoneRole,
	type JumpType,
	type PriceCode,
	type SlotExtra,
	type SlotStaffRole
} from '../../domain/constants.ts';
import {
	emptyBundle,
	type BAircraft,
	type BBookingSlot,
	type BDropzone,
	type BIndemnitySection,
	type BJump,
	type BLoad,
	type BPerson,
	type BRating,
	type BRig,
	type BSlot,
	type BStaff,
	type BTandem,
	type BTeam,
	type BWallet,
	type Bundle
} from '../bundle.ts';
import {
	altitudeFt,
	cents,
	colour,
	currencyCode,
	dateIn,
	hhmm,
	majorToMinor,
	refId,
	refPath,
	timeIn,
	toBool,
	toDate,
	toInstant,
	toIso,
	toNum,
	toStr,
	weekday,
	weekdayIndex,
	type JmDoc
} from './values.ts';

export const JM_DOCS_FORMAT = 'jumpmaster-docs';

/** Dropzone doc plus its sub-collections, keyed by the original collection names. */
export type JmDropzoneDocs = JmDoc & {
	planes?: JmDoc[];
	pricelist?: JmDoc[];
	load?: JmDoc[];
	slot?: JmDoc[];
	tandems?: JmDoc[];
	bookingSlots?: JmDoc[];
	teams?: JmDoc[];
	indemnityQuestions?: JmDoc[];
	indemnityForms?: JmDoc[];
	dzgear?: JmDoc[];
};

/** Raw JSON form of the original's documents (what the connector fetches, or a hand export). */
export type JmDocs = {
	format: typeof JM_DOCS_FORMAT;
	version: 1;
	exportedAt?: string;
	/** Signed-in Firebase uid. */
	uid?: string | null;
	user?: JmDoc | null;
	jumps?: JmDoc[];
	gear?: JmDoc[];
	jumperAccounts?: JmDoc[];
	ledgerEntries?: JmDoc[];
	dropzone?: JmDropzoneDocs | null;
	/** Other user docs referenced by the dropzone (staff, slot jumpers). */
	users?: JmDoc[];
};

export function isJmDocs(x: unknown): x is JmDocs {
	return !!x && typeof x === 'object' && (x as { format?: unknown }).format === JM_DOCS_FORMAT;
}

export type MapOptions = {
	/** Timezone for turning instants into calendar dates (DZ tz, or the jumper's browser tz). */
	timezone?: string;
	/** Fallback currency when the source has none. */
	currency?: string;
	now?: number;
};

export type MapResult = { bundle: Bundle; warnings: string[] };

export const ref = (path: string) => `jm:${path}`;

const ASSOC: Record<string, Association> = {
	pasa: 'pasa',
	'pasa temp (3 months)': 'pasa_temp',
	'pasa temp': 'pasa_temp',
	'pasa student': 'pasa_student',
	uspa: 'uspa',
	other: 'other'
};

/** Original slot jump-type strings → our JUMP_TYPES. */
export const JM_JUMP_TYPES: Record<string, JumpType> = {
	belly: 'belly',
	freeflying: 'freefly',
	freefly: 'freefly',
	tracking: 'tracking',
	angle: 'angle',
	wingsuiting: 'wingsuit',
	wingsuit: 'wingsuit',
	'aff 1-3': 'aff_1_3',
	'aff 4-7': 'aff_4_7',
	'aff 8-10': 'aff_8_10',
	'static line': 'static_line',
	isp: 'isp',
	coaching: 'coaching',
	'hop & pop': 'hop_pop',
	'hop and pop': 'hop_pop',
	crw: 'crw',
	tandem: 'tandem'
};

export function mapJumpType(v: unknown): JumpType {
	const s = toStr(v)?.toLowerCase();
	return (s && JM_JUMP_TYPES[s]) || 'other';
}

/** The original logbook has no type field; it is embedded in the auto text ("4 way Belly", "Solo Tracking"). */
export function inferJumpType(description: unknown): JumpType | null {
	const s = toStr(description)?.toLowerCase();
	if (!s) return null;
	const keys = Object.keys(JM_JUMP_TYPES).sort((a, b) => b.length - a.length);
	for (const k of keys) if (s.includes(k)) return JM_JUMP_TYPES[k];
	for (const [t, label] of Object.entries(JUMP_TYPE_LABELS)) if (s.includes(label.toLowerCase())) return t as JumpType;
	return null;
}

/** PricelistRecord field → price code. */
export const JM_PRICE_FIELDS: Record<string, PriceCode> = {
	sportslot: 'sport_slot',
	hoppop: 'hop_pop',
	gearRental: 'gear_rental',
	ISPSlot: 'isp',
	coachSlot: 'coach',
	extraAltitude: 'extra_altitude',
	maxAltitude: 'max_altitude',
	specialEvent: 'special_event',
	aff1: 'aff_1_3',
	aff3: 'aff_4_7',
	aff7: 'aff_8_10',
	affCourse: 'aff_course',
	staticLine: 'static_line',
	staticLineCourse: 'static_line_course',
	tandemSlot: 'tandem_slot',
	outsideCam: 'tandem_outside_video',
	handCam: 'tandem_handcam',
	extremeRide: 'tandem_extreme_ride',
	beachLanding: 'tandem_beach_landing',
	tandemExtraAltitude: 'tandem_extra_altitude',
	tandemMaxAltitude: 'tandem_max_altitude',
	tandemDeposit: 'tandem_deposit',
	tandemPayment: 'pay_tandem',
	tandemVideoPayment: 'pay_tandem_video',
	handCamPayment: 'pay_handcam',
	affPayment: 'pay_aff',
	coachPayment: 'pay_coach',
	pilotPayment: 'pay_pilot'
};

/** DropzonesRecord people lists → our roles. */
const STAFF_LISTS: [string, DropzoneRole][] = [
	['manager', 'manifest'],
	['staff_members', 'staff'],
	['riggers', 'rigger'],
	['tandemInstructors', 'tandem_instructor'],
	['tandemVideos', 'videographer'],
	['pilots', 'pilot']
];

const PASA_RATINGS: Record<string, string> = {
	Jumpmaster: 'Jumpmaster',
	Instructor: 'Instructor',
	AFF_Instructor: 'AFF Instructor',
	Coach: 'Coach',
	Tandem: 'Tandem',
	PRORating: 'PRO Rating',
	Parachute_Technician: 'Parachute Technician',
	Master_Parachute_Technician: 'Master Parachute Technician',
	Senior_Parachute_Technician: 'Senior Parachute Technician'
};

function docPath(d: JmDoc, fallbackParent: string): string {
	return refPath(d.path) ?? `${fallbackParent}/${d.id}`;
}

/** "Sabre2 170" → { canopy: "Sabre2 170", size: 170 } */
function canopySize(v: unknown): number | null {
	const s = toStr(v);
	const m = s?.match(/(\d{2,3})(?!.*\d)/);
	const n = m ? Number(m[1]) : null;
	return n && n >= 50 && n <= 500 ? n : null;
}

export function mapPerson(d: JmDoc, tz: string): BPerson {
	const path = docPath(d, 'users');
	const ratings: BRating[] = [];
	const rl = d.ratings_list;
	if (rl && typeof rl === 'object') {
		for (const [field, name] of Object.entries(PASA_RATINGS)) {
			const v = toStr((rl as Record<string, unknown>)[field], 200);
			if (v && !/^(no|none|false|-)$/i.test(v)) ratings.push({ body: 'pasa', rating: name, value: v });
		}
	}
	const ur = d.USPA_ratings;
	if (ur && typeof ur === 'object') {
		for (const [field, v] of Object.entries(ur as Record<string, unknown>)) {
			const exp = toDate(v, tz);
			if (exp) ratings.push({ body: 'uspa', rating: field, expiresOn: exp });
		}
	}
	const assoc = toStr(d.skydive_association)?.toLowerCase();
	return {
		ref: ref(path),
		email: toStr(d.email, 254)?.toLowerCase() ?? null,
		name: toStr(d.display_name, 120) ?? toStr(d.email, 120)?.split('@')[0] ?? 'Jump Master user',
		phone: toStr(d.phone_number, 40),
		address: toStr(d.location, 500),
		dob: toDate(d.dob, tz),
		emergencyName: toStr(d.emergency_contact, 120),
		emergencyPhone: toStr(d.emergency_contact_number, 40),
		association: assoc ? (ASSOC[assoc] ?? 'other') : null,
		associationNumber: toStr(d.skydive_association_number, 60),
		associationExpiry: toDate(d.skydive_association_expiry, tz),
		licence: toStr(d.license_number, 60),
		declaredJumpCount: (() => {
			const n = toNum(d.number_jumps);
			return n != null && n >= 0 ? Math.round(n) : null;
		})(),
		weightKg: toNum(d.weight),
		loadingWeightKg: toNum(d.loading_weight),
		marketingOptIn: typeof d.marketingOptIn === 'boolean' ? d.marketingOptIn : null,
		ratings
	};
}

export function mapJump(d: JmDoc, userPath: string, tz: string): BJump | null {
	const path = docPath(d, `${userPath}/jumps`);
	const jumpDate = toDate(d.createdTime, tz);
	if (!jumpDate) return null;
	const n = toNum(d.jumpNum);
	const sig = toStr(d.signature);
	const lic = toStr(d.signatureLicense, 60);
	return {
		ref: ref(path),
		jumpNumber: n != null && n >= 1 ? Math.round(n) : null,
		jumpDate,
		location: toStr(d.location, 200),
		aircraft: toStr(d.plane, 120),
		altitudeFt: altitudeFt(d.altitude),
		freefallSeconds: (() => {
			const f = toNum(d.FFTime);
			return f != null && f >= 0 ? Math.round(f) : null;
		})(),
		jumpType: inferJumpType(d.description),
		description: toStr(d.description, 4000),
		signerName: sig || lic ? 'Signed in Jump Master' : null,
		signerLicence: lic,
		dzVerified: d.customJump === false
	};
}

export function mapRig(d: JmDoc, parent: string, tz: string, kind: BRig['kind'] = 'personal'): BRig {
	const path = docPath(d, parent);
	return {
		ref: ref(path),
		kind,
		name: toStr(d.gear_container, 120),
		container: toStr(d.gear_container, 200),
		mainCanopy: toStr(d.parachute_main, 200),
		mainSizeSqft: canopySize(d.parachute_main),
		wingLoading: toNum(d.wing_loading),
		reserveCanopy: toStr(d.reserve_parachute, 200),
		reserveSizeSqft: canopySize(d.reserve_parachute),
		reserveRepackedOn: toDate(d.reserve_repack, tz),
		aad: toStr(d.aad_info, 200),
		wingsuit: toStr(d.wingsuit_info, 200)
	};
}

function mapWallets(accounts: JmDoc[], ledger: JmDoc[], userPath: string, personRef: string, fallbackCurrency: string): BWallet[] {
	const byAccount = new Map<string, JmDoc[]>();
	for (const e of ledger) {
		const k = refPath(e.accountRef) ?? '';
		byAccount.set(k, [...(byAccount.get(k) ?? []), e]);
	}
	return accounts.map((a) => {
		const path = docPath(a, `${userPath}/jumperAccounts`);
		const dz = refPath(a.dzRef);
		return {
			ref: ref(path),
			person: personRef,
			dropzoneRef: dz ? ref(dz) : null,
			currency: currencyCode(a.currency) ?? fallbackCurrency,
			availableMinor: cents(a.available),
			lifetimeTopupMinor: Math.max(0, cents(a.lifetimeTopup)),
			lifetimeSpentMinor: Math.max(0, cents(a.lifetimeSpent)),
			ledger: (byAccount.get(path) ?? []).map((e) => ({
				ref: ref(docPath(e, `${userPath}/ledgerEntries`)),
				type: toStr(e.type, 40) ?? 'adjustment',
				amountMinor: cents(e.amount),
				at: toIso(e.createdTime),
				reason: toStr(e.reason, 200)
			}))
		};
	});
}

// ── dropzone ─────────────────────────────────────────────────────────────────

type SlotExtraField = [SlotExtra, string, string];
/** [extra, bool field, price field] on SlotRecord. */
const SLOT_EXTRA_FIELDS: SlotExtraField[] = [
	['gear_rental', 'gear_rental', 'gear_price'],
	['handcam', 'handcam', 'handcamPrice'],
	['outside_video', 'outsidecam', 'videoPrice'],
	['extreme_ride', 'extremeRide', 'extremeRidePrice'],
	['beach_landing', 'beachLanding', 'beachLandingPrice'],
	['extra_altitude', 'extraAltitude', 'extraAltitudePrice'],
	['max_altitude', 'maxAltitude', 'maxAltitudePrice'],
	['special_event', 'specialEvent', 'specialEventPrice']
];

function mapSlot(s: JmDoc, dzPath: string, loadPath: string, position: number): BSlot {
	const path = docPath(s, `${dzPath}/slot`);
	const isPassenger = toBool(s.tandem_passanger);
	const jumpType = isPassenger ? 'tandem' : mapJumpType(s.jump_type);
	let staffRole: SlotStaffRole | null = null;
	if (toBool(s.videographer)) staffRole = 'videographer';
	else if (toBool(s.coach)) staffRole = 'coach';
	else if (toBool(s.tandem_jump) && !isPassenger) staffRole = 'tandem_instructor';
	else if (toBool(s.staffJump) && jumpType.startsWith('aff_')) staffRole = 'aff_instructor';
	const extras: SlotExtra[] = [];
	const priceLines: BSlot['priceLines'] = [];
	const base = majorToMinor(s.price);
	if (base) priceLines.push({ code: 'base', label: JUMP_TYPE_LABELS[jumpType] ?? 'Slot', amountMinor: base });
	for (const [extra, flag, priceField] of SLOT_EXTRA_FIELDS) {
		if (!toBool(s[flag])) continue;
		extras.push(extra);
		const amt = majorToMinor(s[priceField]);
		if (amt) priceLines.push({ code: extra, label: SLOT_EXTRA_LABELS[extra], amountMinor: amt });
	}
	const depositMinor = majorToMinor(s.deposit);
	const totalMinor = Math.max(0, priceLines.reduce((n, l) => n + l.amountMinor, 0) - depositMinor);
	const user = refPath(s.user);
	const tandemDoc = refPath(s.tandemPassenger);
	let groupId: string | null = null;
	const tandemId = toNum(s.tandem_id);
	const teamId = toNum(s.team_id);
	if (toBool(s.tandem_jump) && tandemId != null) groupId = `jm:tandem:${loadPath}:${tandemId}`;
	else if (toBool(s.team_jump) && teamId != null) groupId = `jm:team:${loadPath}:${teamId}`;
	return {
		ref: ref(path),
		person: user && !isPassenger ? ref(user) : null,
		displayName: toStr(s.display_name, 120) ?? (isPassenger ? 'Tandem passenger' : 'Jumper'),
		email: toStr(s.email, 254)?.toLowerCase() ?? null,
		licence: toStr(s.license_number, 60),
		weightKg: toNum(s.slotWeight),
		jumpType,
		groupId,
		teamName: toStr(s.teamName, 120),
		tandem: tandemDoc ? ref(tandemDoc) : null,
		staffRole,
		isLoadMaster: toBool(s.jumpMaster),
		extras,
		priceLines,
		depositMinor,
		totalMinor,
		paid: toBool(s.paid),
		staffPayMinor: majorToMinor(s.staffPay),
		colour: colour(s.slotColour),
		position
	};
}

function tandemPaymentStatus(t: JmDoc, paidMinor: number, depositMinor: number): BTandem['paymentStatus'] {
	const s = toStr(t.paymentStatus)?.toLowerCase() ?? '';
	if (s.includes('refund')) return 'refunded';
	if (s === 'paid' || s === 'complete' || s === 'completed') return 'paid';
	if (paidMinor > 0) return 'partially_paid';
	if (depositMinor > 0 || s.includes('deposit')) return 'deposit_paid';
	return 'unpaid';
}

function mapTandem(t: JmDoc, dzPath: string, tz: string, completedSlots: Set<string>): BTandem {
	const path = docPath(t, `${dzPath}/tandems`);
	const extras: SlotExtra[] = [];
	if (toBool(t.handCam)) extras.push('handcam');
	if (toBool(t.outsideCam)) extras.push('outside_video');
	if (toBool(t.extremeRide)) extras.push('extreme_ride');
	if (toBool(t.beachLanding)) extras.push('beach_landing');
	if (toBool(t.extraAltitude)) extras.push('extra_altitude');
	if (toBool(t.maxAltitude)) extras.push('max_altitude');
	const depositMinor = majorToMinor(t.depositPaid);
	const paidMinor = majorToMinor(t.paymentAmount);
	const slot = refPath(t.tandemSlot);
	const status: BTandem['status'] =
		slot && completedSlots.has(slot)
			? 'completed'
			: toBool(t.manifested)
				? 'manifested'
				: toBool(t.indemnityCheck)
					? 'registered'
					: 'booked';
	const slotAt = toInstant(t.timeSlot);
	const gender = toStr(t.passangerGender)?.toLowerCase();
	const stripeTotal = toNum(t.stripeAmountTotal);
	return {
		ref: ref(path),
		confirmationNumber: toStr(t.confirmationNumber, 40),
		status,
		name: toStr(t.passangerName, 120) ?? 'Tandem passenger',
		email: toStr(t.passangerEmail, 254)?.toLowerCase() ?? null,
		phone: toStr(t.passangerPhone, 40),
		idNumber: toStr(t.passangerID, 60),
		gender: gender === 'male' || gender === 'female' || gender === 'other' ? gender : null,
		dob: toDate(t.passangerDOB, tz),
		nationality: toStr(t.passangerNationality, 80),
		heightCm: toNum(t.passangerHeight),
		weightKg: toNum(t.passangerWeight),
		addressLine1: toStr(t.passangerAddress1),
		addressLine2: toStr(t.passangerAddress2),
		city: toStr(t.passangerAddressCity, 120),
		postalCode: toStr(t.passangerAddressCode, 20),
		country: toStr(t.passangerAddressCntry, 80),
		guardianName: toStr(t.guardianName, 120),
		guardianEmail: toStr(t.guardianEmail, 254),
		guardianIdNumber: toStr(t.guardianID, 60),
		emergencyName: toStr(t.emergencyName, 120),
		emergencyEmail: toStr(t.emergencyEmail, 254),
		emergencyPhone: toStr(t.emergencyPhone, 40),
		jumpDate: toDate(t.jumpTime ?? t.timeSlot, tz),
		bookingTime: slotAt != null ? timeIn(slotAt, tz) : null,
		extras,
		heardFrom: toStr(t.marketing, 80),
		note: toStr(t.tandemNote, 2000),
		indemnitySignedAt: toIso(t.signDate),
		totalMinor: stripeTotal != null ? Math.round(stripeTotal) : 0,
		depositMinor,
		amountPaidMinor: Math.max(paidMinor, depositMinor),
		paymentStatus: tandemPaymentStatus(t, paidMinor, depositMinor),
		paymentMethod: toStr(t.paymentMethod, 40),
		onlineBooking: toBool(t.onlineBooking),
		manifested: toBool(t.manifested),
		createdAt: toIso(t.createdTime)
	};
}

function mapDropzone(
	dz: JmDropzoneDocs,
	tz: string,
	fallbackCurrency: string,
	now: number,
	addPerson: (path: string, hint?: { name?: string | null; email?: string | null; licence?: string | null }) => string | null,
	warnings: string[]
): BDropzone {
	const dzPath = refPath(dz.path) ?? `dropzones/${dz.id}`;
	const pricelist = dz.pricelist?.[0];
	const currency =
		currencyCode(dz.stripeCurrency) ?? currencyCode(pricelist?.dropzoneCurrency) ?? fallbackCurrency;
	const prices: Partial<Record<PriceCode, number>> = {};
	if (pricelist) {
		for (const [field, code] of Object.entries(JM_PRICE_FIELDS)) {
			if (pricelist[field] != null && pricelist[field] !== '') prices[code] = Math.max(0, majorToMinor(pricelist[field]));
		}
	}
	if ((dz.pricelist?.length ?? 0) > 1) warnings.push('More than one price list found; used the first.');

	const aircraft: BAircraft[] = (dz.planes ?? []).map((p) => ({
		ref: ref(docPath(p, `${dzPath}/planes`)),
		name: toStr(p.plane_name, 120) ?? 'Aircraft',
		tailNumber: toStr(p.tail_number, 40),
		capacity: Math.max(0, Math.round(toNum(p.pax) ?? 0)),
		weightLimitKg: toNum(p.weight_limit)
	}));

	// Staff (roles merged per person)
	const staffMap = new Map<string, BStaff>();
	const addRole = (path: string | null, role: DropzoneRole, col?: string | null) => {
		if (!path) return;
		const key = addPerson(path);
		if (!key) return;
		const s = staffMap.get(key) ?? { person: key, roles: [], colour: null };
		if (!s.roles.includes(role)) s.roles.push(role);
		if (col) s.colour = col;
		staffMap.set(key, s);
	};
	addRole(refPath(dz.owner), 'owner');
	for (const [field, role] of STAFF_LISTS) {
		const list = Array.isArray(dz[field]) ? (dz[field] as unknown[]) : [];
		for (const r of list) addRole(refPath(r), role);
	}
	const tiList = Array.isArray(dz.tandem_instructors_list) ? (dz.tandem_instructors_list as Record<string, unknown>[]) : [];
	for (const t of tiList) addRole(refPath(t?.user), 'tandem_instructor', colour(t?.color));

	const followers = (Array.isArray(dz.user_followers) ? dz.user_followers : [])
		.map((r) => {
			const p = refPath(r);
			return p ? addPerson(p) : null;
		})
		.filter((x): x is string => !!x);

	// Loads + slots
	const slotsByLoad = new Map<string, JmDoc[]>();
	for (const s of dz.slot ?? []) {
		const lp = refPath(s.load_number);
		if (!lp) {
			warnings.push(`Slot ${s.id} has no load; skipped.`);
			continue;
		}
		slotsByLoad.set(lp, [...(slotsByLoad.get(lp) ?? []), s]);
	}
	const today = dateIn(now, tz);
	const completedSlots = new Set<string>();
	let stale = 0;
	const loads: BLoad[] = [];
	const seenLoadKeys = new Set<string>();
	for (const l of dz.load ?? []) {
		const lp = docPath(l, `${dzPath}/load`);
		const at = toInstant(l.jumpTime) ?? toInstant(l.createdTime);
		const n = toNum(l.loadNumber);
		if (at == null || n == null || n < 1) {
			warnings.push(`Load ${l.id} has no date or number; skipped.`);
			continue;
		}
		const day = dateIn(at, tz);
		const key = `${day}#${Math.round(n)}`;
		if (seenLoadKeys.has(key)) {
			warnings.push(`Duplicate load ${Math.round(n)} on ${day}; kept the first.`);
			continue;
		}
		seenLoadKeys.add(key);
		const completed = toBool(l.loadCompleted);
		let status: BLoad['status'] = completed ? 'completed' : toBool(l.openToJump) ? 'open' : 'planned';
		if (!completed && day < today) {
			status = 'cancelled';
			stale++;
		}
		const slotDocs = (slotsByLoad.get(lp) ?? []).sort(
			(a, b) => (toInstant(a.created_time) ?? 0) - (toInstant(b.created_time) ?? 0)
		);
		const slots = slotDocs.map((s, i) => {
			const slot = mapSlot(s, dzPath, lp, i);
			const user = refPath(s.user);
			if (slot.person && user) {
				slot.person = addPerson(user, { name: slot.displayName, email: slot.email, licence: slot.licence });
			}
			if (completed) completedSlots.add(docPath(s, `${dzPath}/slot`));
			return slot;
		});
		slotsByLoad.delete(lp);
		const shut = toBool(l.shutdown) ? toNum(l.shutdownTime) : null;
		loads.push({
			ref: ref(lp),
			day,
			loadNumber: Math.round(n),
			status,
			isOpen: !completed && toBool(l.openToJump),
			aircraftName: toStr(l.airplane, 120),
			capacity: Math.max(slots.length, Math.round(toNum(l.pax) ?? 0)),
			weightLimitKg: toNum(l.weightLimit),
			pilotName: toStr(l.pilot, 120),
			pilotWeightKg: toNum(l.pilotweight),
			requirements: toStr(l.loadRequirements, 500),
			scheduledAt: toIso(l.jumpTime),
			refuel: toBool(l.refuel),
			shutdownMinutes: shut != null ? Math.round(shut) : null,
			slots
		});
	}
	if (stale) warnings.push(`${stale} past load(s) were never completed in Jump Master; imported as cancelled.`);
	const orphan = [...slotsByLoad.values()].reduce((n, s) => n + s.length, 0);
	if (orphan) warnings.push(`${orphan} slot(s) point to loads that weren't found; skipped.`);

	const teams: BTeam[] = (dz.teams ?? []).map((t) => {
		const members = (Array.isArray(t.users) ? t.users : [])
			.map((u) => {
				const p = refPath(u);
				return p ? addPerson(p) : null;
			})
			.filter((x): x is string => !!x);
		const coach = refPath(t.coach);
		const video = refPath(t.video);
		return {
			ref: ref(docPath(t, `${dzPath}/teams`)),
			name: toStr(t.teamName, 120) ?? 'Team',
			discipline: toStr(t.descipline, 80),
			colour: colour(t.slotColour),
			coach: coach ? addPerson(coach) : null,
			video: video ? addPerson(video) : null,
			members
		};
	});

	const bookingSlots: BBookingSlot[] = [];
	const seenBooking = new Set<string>();
	for (const b of dz.bookingSlots ?? []) {
		const at = toInstant(b.timeSlot);
		const time = at != null ? timeIn(at, tz) : null;
		if (!time) {
			warnings.push(`Booking slot ${b.id} has no time; skipped.`);
			continue;
		}
		const date = b.bookingDate != null ? toDate(b.bookingDate, tz) : null;
		const wd = date ? null : weekdayIndex(b.day);
		const key = `${date}|${wd}|${time}`;
		if (seenBooking.has(key)) continue;
		seenBooking.add(key);
		bookingSlots.push({
			ref: ref(docPath(b, `${dzPath}/bookingSlots`)),
			date: date ?? (wd == null && at != null ? dateIn(at, tz) : null),
			weekday: wd,
			time,
			capacity: Math.max(0, Math.round(toNum(b.slotAmount) ?? 1))
		});
	}

	const tandems = (dz.tandems ?? []).map((t) => mapTandem(t, dzPath, tz, completedSlots));

	const sections: BIndemnitySection[] = [...(dz.indemnityQuestions ?? [])]
		.sort((a, b) => (toInstant(a.createdTime) ?? 0) - (toInstant(b.createdTime) ?? 0))
		.map((q, i) => ({
			ref: ref(docPath(q, `${dzPath}/indemnityQuestions`)),
			audience: /tandem/i.test(toStr(q.sectionType) ?? '') ? 'tandem' : 'sport',
			position: i,
			title: toStr(q.sectionTitle, 200) ?? `Section ${i + 1}`,
			content: toStr(q.sectionContent, 20000) ?? ''
		}));
	if (dz.indemnityForms?.length) {
		warnings.push(
			`${dz.indemnityForms.length} signed sport waiver(s) stay in Jump Master: signature images and PDFs aren't copied.`
		);
	}

	const rigs = (dz.dzgear ?? []).map((g) =>
		mapRig(g, `${dzPath}/dzgear`, tz, /tandem/i.test(toStr(g.gear_type) ?? '') ? 'tandem' : 'rental')
	);

	const loc = dz.location as { latitude?: number; longitude?: number; lat?: number; lng?: number } | null;
	const days = [
		...new Set(
			[...(Array.isArray(dz.days_open) ? dz.days_open : []), ...(Array.isArray(dz.open_days) ? dz.open_days : [])]
				.map(weekday)
				.filter((d): d is NonNullable<ReturnType<typeof weekday>> => !!d)
		)
	];
	return {
		ref: ref(dzPath),
		name: toStr(dz.name, 120) ?? 'Dropzone',
		description: toStr(dz.description, 4000),
		address: toStr(dz.address, 500),
		lat: toNum(loc?.latitude ?? loc?.lat),
		lng: toNum(loc?.longitude ?? loc?.lng),
		contactEmail: toStr(dz.email, 254),
		contactPhone: toStr(dz.phone_number, 40),
		openDays: days,
		openTime: hhmm(dz.open_time),
		closeTime: hhmm(dz.close_time),
		currency,
		timezone: tz,
		paymentsOn: toBool(dz.paymentsOn),
		walletEnabled: toBool(dz.walletEnabled),
		payAtManifest: toBool(dz.paymentBypass),
		emailNotices: toBool(dz.emailNotices),
		indemnityTandemActive: toBool(dz.indemnityTandemActive),
		indemnitySportActive: toBool(dz.indemnitySportyActive),
		prices,
		aircraft,
		staff: [...staffMap.values()],
		followers,
		rigs,
		teams,
		bookingSlots,
		tandems,
		indemnitySections: sections,
		loads
	};
}

/** Convert raw Jump Master documents into a validated-shape bundle (+ human warnings). */
export function mapJumpMasterDocs(docs: JmDocs, opts: MapOptions = {}): MapResult {
	const tz = opts.timezone || 'UTC';
	const now = opts.now ?? Date.now();
	const warnings: string[] = [];
	const bundle = emptyBundle('jumpmaster', new Date(now));
	bundle.source.origin = 'jumpmaster';
	const people = new Map<string, BPerson>();
	const userDocs = new Map<string, JmDoc>();
	for (const u of [...(docs.users ?? []), ...(docs.user ? [docs.user] : [])]) {
		userDocs.set(refPath(u.path) ?? `users/${u.id}`, u);
	}
	/** Register a person by user path; returns its bundle ref (null when nothing is known). */
	const addPerson = (path: string, hint?: { name?: string | null; email?: string | null; licence?: string | null }) => {
		const key = ref(path);
		if (people.has(key)) {
			const p = people.get(key)!;
			if (!p.email && hint?.email) p.email = hint.email;
			if (!p.licence && hint?.licence) p.licence = hint.licence;
			return key;
		}
		const doc = userDocs.get(path);
		if (doc) {
			people.set(key, mapPerson(doc, tz));
			return key;
		}
		if (hint?.name || hint?.email) {
			people.set(key, {
				ref: key,
				name: hint.name ?? hint.email!.split('@')[0],
				email: hint.email ?? null,
				licence: hint.licence ?? null,
				ratings: []
			});
			return key;
		}
		return null;
	};

	if (docs.user) {
		const userPath = refPath(docs.user.path) ?? `users/${docs.uid ?? docs.user.id}`;
		const personRef = addPerson(userPath)!;
		const self = people.get(personRef)!;
		const jumps: BJump[] = [];
		let undated = 0;
		for (const j of docs.jumps ?? []) {
			const m = mapJump(j, userPath, tz);
			if (m) jumps.push(m);
			else undated++;
		}
		if (undated) warnings.push(`${undated} logbook jump(s) have no date; skipped.`);
		jumps.sort((a, b) => (a.jumpNumber ?? 1e9) - (b.jumpNumber ?? 1e9) || a.jumpDate.localeCompare(b.jumpDate));
		const rigs = (docs.gear ?? []).map((g) => mapRig(g, `${userPath}/gear`, tz));
		const u = docs.user;
		if (!rigs.length && (toStr(u.gear_container) || toStr(u.parachute_main))) {
			rigs.push({ ...mapRig({ ...u, id: 'legacy-rig' }, userPath, tz), ref: ref(`${userPath}#legacy-rig`) });
		}
		const wallets = mapWallets(docs.jumperAccounts ?? [], docs.ledgerEntries ?? [], userPath, self.ref, opts.currency ?? 'USD');
		bundle.jumper = { person: personRef, jumps, rigs, wallets };
	}
	if (docs.dropzone) {
		bundle.dropzone = mapDropzone(docs.dropzone, tz, opts.currency ?? 'USD', now, addPerson, warnings);
	}
	bundle.people = [...people.values()];
	return { bundle, warnings };
}
