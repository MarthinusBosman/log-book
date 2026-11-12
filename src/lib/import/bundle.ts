/**
 * The normalised "Log-Book bundle" — the single interchange format for imports and exports.
 * Client-safe (no server imports): used by the browser connector, the CSV mapper, the server
 * importer and the exporter. Documented in docs/IMPORT.md.
 *
 * Conventions:
 *  - every entity carries `ref`, a stable source reference (e.g. `jm:users/abc/jumps/xyz`) used for
 *    idempotent re-import: importing the same bundle twice updates rows, never duplicates them
 *  - money: integer minor units (cents) + the dropzone currency
 *  - calendar dates: `YYYY-MM-DD`; instants: ISO-8601 strings
 *  - people are listed once in `people` and referenced by `ref` everywhere else
 */
import {
	ASSOCIATIONS,
	DROPZONE_ROLES,
	PRICE_CODES,
	RATING_BODIES,
	SLOT_EXTRAS,
	SLOT_STAFF_ROLES,
	type Association,
	type DropzoneRole,
	type PriceCode,
	type RatingBody,
	type SlotExtra,
	type SlotStaffRole
} from '../domain/constants.ts';

/** Wire id kept from the working name so existing exports stay importable. */
export const BUNDLE_FORMAT = 'slot-bundle';
export const BUNDLE_VERSION = 1;
/** Hard limits so a hostile upload can't exhaust the server. */
export const BUNDLE_LIMITS = { people: 20_000, jumps: 50_000, loads: 50_000, slots: 400_000, other: 20_000 } as const;

export type BundleSource = {
	/** Where the data came from. */
	system: 'jumpmaster' | 'slot' | 'csv';
	/** Origin of the exporting instance (Log-Book exports) or the source project. */
	origin?: string | null;
	exportedAt: string;
};

export type BPerson = {
	ref: string;
	email?: string | null;
	name: string;
	phone?: string | null;
	address?: string | null;
	dob?: string | null;
	emergencyName?: string | null;
	emergencyPhone?: string | null;
	association?: Association | null;
	associationNumber?: string | null;
	associationExpiry?: string | null;
	licence?: string | null;
	declaredJumpCount?: number | null;
	weightKg?: number | null;
	loadingWeightKg?: number | null;
	marketingOptIn?: boolean | null;
	ratings?: BRating[];
};

export type BRating = { body: RatingBody; rating: string; value?: string | null; expiresOn?: string | null };

export type BJump = {
	ref: string;
	jumpNumber?: number | null;
	jumpDate: string;
	location?: string | null;
	aircraft?: string | null;
	altitudeFt?: number | null;
	freefallSeconds?: number | null;
	jumpType?: string | null;
	description?: string | null;
	signerName?: string | null;
	signerLicence?: string | null;
	/** The source system marked this jump as created by a dropzone (informational only). */
	dzVerified?: boolean;
};

export type BRig = {
	ref: string;
	kind?: 'personal' | 'tandem' | 'rental' | 'student';
	name?: string | null;
	container?: string | null;
	mainCanopy?: string | null;
	mainSizeSqft?: number | null;
	wingLoading?: number | null;
	reserveCanopy?: string | null;
	reserveSizeSqft?: number | null;
	reserveRepackedOn?: string | null;
	aad?: string | null;
	aadServiceDueOn?: string | null;
	wingsuit?: string | null;
	notes?: string | null;
};

export type BWallet = {
	ref: string;
	person: string;
	/** Source dropzone reference (e.g. `jm:dropzones/x`) — used to find the dropzone here. */
	dropzoneRef?: string | null;
	currency: string;
	availableMinor: number;
	lifetimeTopupMinor?: number;
	lifetimeSpentMinor?: number;
	/** History, kept for the record; only the opening balance is applied. */
	ledger?: { ref: string; type: string; amountMinor: number; at?: string | null; reason?: string | null }[];
};

export type BAircraft = {
	ref: string;
	name: string;
	tailNumber?: string | null;
	capacity: number;
	weightLimitKg?: number | null;
};

export type BStaff = { person: string; roles: DropzoneRole[]; colour?: string | null };

export type BTeam = {
	ref: string;
	name: string;
	discipline?: string | null;
	colour?: string | null;
	coach?: string | null;
	video?: string | null;
	members: string[];
};

export type BBookingSlot = { ref: string; date?: string | null; weekday?: number | null; time: string; capacity: number };

export type BTandem = {
	ref: string;
	confirmationNumber?: string | null;
	status?: 'booked' | 'registered' | 'manifested' | 'completed' | 'cancelled';
	name: string;
	email?: string | null;
	phone?: string | null;
	idNumber?: string | null;
	gender?: 'male' | 'female' | 'other' | null;
	dob?: string | null;
	nationality?: string | null;
	heightCm?: number | null;
	weightKg?: number | null;
	addressLine1?: string | null;
	addressLine2?: string | null;
	city?: string | null;
	postalCode?: string | null;
	country?: string | null;
	guardianName?: string | null;
	guardianEmail?: string | null;
	guardianIdNumber?: string | null;
	emergencyName?: string | null;
	emergencyEmail?: string | null;
	emergencyPhone?: string | null;
	jumpDate?: string | null;
	bookingTime?: string | null;
	extras?: SlotExtra[];
	heardFrom?: string | null;
	note?: string | null;
	indemnitySignedAt?: string | null;
	totalMinor?: number;
	depositMinor?: number;
	amountPaidMinor?: number;
	paymentStatus?: 'unpaid' | 'deposit_paid' | 'partially_paid' | 'paid' | 'refunded';
	paymentMethod?: string | null;
	onlineBooking?: boolean;
	manifested?: boolean;
	createdAt?: string | null;
};

export type BIndemnitySection = {
	ref: string;
	audience: 'tandem' | 'sport';
	position?: number;
	title: string;
	content: string;
};

export type BSlot = {
	ref: string;
	person?: string | null;
	displayName: string;
	email?: string | null;
	licence?: string | null;
	weightKg?: number | null;
	jumpType: string;
	groupId?: string | null;
	teamName?: string | null;
	tandem?: string | null;
	staffRole?: SlotStaffRole | null;
	isLoadMaster?: boolean;
	extras?: SlotExtra[];
	priceLines?: { code: string; label: string; amountMinor: number }[];
	depositMinor?: number;
	totalMinor?: number;
	paid?: boolean;
	staffPayMinor?: number;
	colour?: string | null;
	position?: number;
};

export type BLoad = {
	ref: string;
	day: string;
	loadNumber: number;
	status: 'planned' | 'open' | 'completed' | 'cancelled';
	isOpen?: boolean;
	aircraftName?: string | null;
	capacity: number;
	weightLimitKg?: number | null;
	pilotName?: string | null;
	pilotWeightKg?: number | null;
	requirements?: string | null;
	scheduledAt?: string | null;
	refuel?: boolean;
	shutdownMinutes?: number | null;
	slots: BSlot[];
};

export type BDropzone = {
	ref: string;
	name: string;
	description?: string | null;
	address?: string | null;
	lat?: number | null;
	lng?: number | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	openDays?: string[];
	openTime?: string | null;
	closeTime?: string | null;
	currency?: string | null;
	timezone?: string | null;
	paymentsOn?: boolean;
	walletEnabled?: boolean;
	payAtManifest?: boolean;
	emailNotices?: boolean;
	indemnityTandemActive?: boolean;
	indemnitySportActive?: boolean;
	prices?: Partial<Record<PriceCode, number>>;
	aircraft?: BAircraft[];
	staff?: BStaff[];
	followers?: string[];
	rigs?: BRig[];
	teams?: BTeam[];
	bookingSlots?: BBookingSlot[];
	tandems?: BTandem[];
	indemnitySections?: BIndemnitySection[];
	loads?: BLoad[];
	wallets?: BWallet[];
};

export type BJumper = {
	person: string;
	jumps?: BJump[];
	rigs?: BRig[];
	wallets?: BWallet[];
};

export type Bundle = {
	format: typeof BUNDLE_FORMAT;
	version: typeof BUNDLE_VERSION;
	source: BundleSource;
	people: BPerson[];
	jumper?: BJumper | null;
	dropzone?: BDropzone | null;
};

// ── helpers ──────────────────────────────────────────────────────────────────

export function emptyBundle(system: BundleSource['system'], now = new Date()): Bundle {
	return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, source: { system, exportedAt: now.toISOString() }, people: [] };
}

export function isBundle(x: unknown): x is { format: string } {
	return !!x && typeof x === 'object' && (x as { format?: unknown }).format === BUNDLE_FORMAT;
}

export type BundleCounts = Record<string, number>;

/** Entity counts (for previews and job summaries). */
export function countBundle(b: Bundle): BundleCounts {
	const c: BundleCounts = {};
	const add = (k: string, n: number | undefined) => {
		if (n) c[k] = (c[k] ?? 0) + n;
	};
	add('people', b.people.length);
	if (b.jumper) {
		add('jumps', b.jumper.jumps?.length);
		add('rigs', b.jumper.rigs?.length);
		add('wallets', b.jumper.wallets?.length);
	}
	const dz = b.dropzone;
	if (dz) {
		add('dropzone', 1);
		add('prices', Object.keys(dz.prices ?? {}).length);
		add('aircraft', dz.aircraft?.length);
		add('staff', dz.staff?.length);
		add('rigs', dz.rigs?.length);
		add('teams', dz.teams?.length);
		add('bookingSlots', dz.bookingSlots?.length);
		add('tandems', dz.tandems?.length);
		add('indemnitySections', dz.indemnitySections?.length);
		add('loads', dz.loads?.length);
		add('slots', dz.loads?.reduce((n, l) => n + l.slots.length, 0));
		add('wallets', dz.wallets?.length);
	}
	return c;
}

export const COUNT_LABELS: Record<string, string> = {
	people: 'People',
	jumps: 'Logbook jumps',
	rigs: 'Rigs',
	wallets: 'Wallets',
	dropzone: 'Dropzone profile',
	prices: 'Price list items',
	aircraft: 'Aircraft',
	staff: 'Staff',
	teams: 'Teams',
	bookingSlots: 'Booking slots',
	tandems: 'Tandem passengers',
	indemnitySections: 'Waiver sections',
	loads: 'Loads',
	slots: 'Slots',
	ratings: 'Ratings',
	created: 'Created',
	updated: 'Updated',
	skipped: 'Skipped',
	placeholders: 'Placeholder profiles'
};

// ── validation ───────────────────────────────────────────────────────────────

export class BundleError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

function str(o: Obj, k: string, path: string, opts: { required?: boolean; max?: number } = {}): string | null {
	const v = o[k];
	if (v == null || v === '') {
		if (opts.required) throw new BundleError(`${path}.${k} is required`);
		return null;
	}
	if (typeof v !== 'string') throw new BundleError(`${path}.${k} must be a string`);
	return v.slice(0, opts.max ?? 2000);
}
function num(o: Obj, k: string, path: string, opts: { required?: boolean; int?: boolean; min?: number } = {}): number | null {
	const v = o[k];
	if (v == null || v === '') {
		if (opts.required) throw new BundleError(`${path}.${k} is required`);
		return null;
	}
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new BundleError(`${path}.${k} must be a number`);
	if (opts.int && !Number.isInteger(v)) throw new BundleError(`${path}.${k} must be a whole number`);
	if (opts.min !== undefined && v < opts.min) throw new BundleError(`${path}.${k} must be ≥ ${opts.min}`);
	return v;
}
function date(o: Obj, k: string, path: string, required = false): string | null {
	const v = str(o, k, path, { required });
	if (v != null && !DATE_RE.test(v)) throw new BundleError(`${path}.${k} must be YYYY-MM-DD`);
	return v;
}
function bool(o: Obj, k: string): boolean | undefined {
	const v = o[k];
	return typeof v === 'boolean' ? v : undefined;
}
function arr(o: Obj, k: string, path: string, limit: number): unknown[] {
	const v = o[k];
	if (v == null) return [];
	if (!Array.isArray(v)) throw new BundleError(`${path}.${k} must be an array`);
	if (v.length > limit) throw new BundleError(`${path}.${k} has too many entries (max ${limit})`);
	return v;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
	return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function objAt(x: unknown, path: string): Obj {
	if (!isObj(x)) throw new BundleError(`${path} must be an object`);
	return x;
}

function vPerson(x: unknown, path: string): BPerson {
	const o = objAt(x, path);
	const ratings = arr(o, 'ratings', path, 100).map((r, i) => {
		const ro = objAt(r, `${path}.ratings[${i}]`);
		const body = oneOf(ro.body, RATING_BODIES);
		if (!body) throw new BundleError(`${path}.ratings[${i}].body is invalid`);
		return {
			body,
			rating: str(ro, 'rating', `${path}.ratings[${i}]`, { required: true, max: 80 })!,
			value: str(ro, 'value', path, { max: 200 }),
			expiresOn: date(ro, 'expiresOn', `${path}.ratings[${i}]`)
		};
	});
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		email: str(o, 'email', path, { max: 254 })?.trim().toLowerCase() ?? null,
		name: str(o, 'name', path, { max: 120 }) ?? 'Unnamed jumper',
		phone: str(o, 'phone', path, { max: 40 }),
		address: str(o, 'address', path, { max: 500 }),
		dob: date(o, 'dob', path),
		emergencyName: str(o, 'emergencyName', path, { max: 120 }),
		emergencyPhone: str(o, 'emergencyPhone', path, { max: 40 }),
		association: oneOf(o.association, ASSOCIATIONS),
		associationNumber: str(o, 'associationNumber', path, { max: 60 }),
		associationExpiry: date(o, 'associationExpiry', path),
		licence: str(o, 'licence', path, { max: 60 }),
		declaredJumpCount: num(o, 'declaredJumpCount', path, { int: true, min: 0 }),
		weightKg: num(o, 'weightKg', path, { min: 0 }),
		loadingWeightKg: num(o, 'loadingWeightKg', path, { min: 0 }),
		marketingOptIn: bool(o, 'marketingOptIn') ?? null,
		ratings
	};
}

function vJump(x: unknown, path: string): BJump {
	const o = objAt(x, path);
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		jumpNumber: num(o, 'jumpNumber', path, { int: true, min: 1 }),
		jumpDate: date(o, 'jumpDate', path, true)!,
		location: str(o, 'location', path, { max: 200 }),
		aircraft: str(o, 'aircraft', path, { max: 120 }),
		altitudeFt: num(o, 'altitudeFt', path, { min: 0 }),
		freefallSeconds: num(o, 'freefallSeconds', path, { min: 0 }),
		jumpType: str(o, 'jumpType', path, { max: 40 }),
		description: str(o, 'description', path, { max: 4000 }),
		signerName: str(o, 'signerName', path, { max: 120 }),
		signerLicence: str(o, 'signerLicence', path, { max: 60 }),
		dzVerified: bool(o, 'dzVerified')
	};
}

function vRig(x: unknown, path: string): BRig {
	const o = objAt(x, path);
	const kind = oneOf(o.kind, ['personal', 'tandem', 'rental', 'student'] as const) ?? undefined;
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		kind,
		name: str(o, 'name', path, { max: 120 }),
		container: str(o, 'container', path, { max: 200 }),
		mainCanopy: str(o, 'mainCanopy', path, { max: 200 }),
		mainSizeSqft: num(o, 'mainSizeSqft', path, { int: true, min: 0 }),
		wingLoading: num(o, 'wingLoading', path, { min: 0 }),
		reserveCanopy: str(o, 'reserveCanopy', path, { max: 200 }),
		reserveSizeSqft: num(o, 'reserveSizeSqft', path, { int: true, min: 0 }),
		reserveRepackedOn: date(o, 'reserveRepackedOn', path),
		aad: str(o, 'aad', path, { max: 200 }),
		aadServiceDueOn: date(o, 'aadServiceDueOn', path),
		wingsuit: str(o, 'wingsuit', path, { max: 200 }),
		notes: str(o, 'notes', path, { max: 2000 })
	};
}

function vWallet(x: unknown, path: string): BWallet {
	const o = objAt(x, path);
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		person: str(o, 'person', path, { required: true, max: 300 })!,
		dropzoneRef: str(o, 'dropzoneRef', path, { max: 300 }),
		currency: (str(o, 'currency', path, { max: 3 }) ?? 'USD').toUpperCase(),
		availableMinor: num(o, 'availableMinor', path, { int: true }) ?? 0,
		lifetimeTopupMinor: num(o, 'lifetimeTopupMinor', path, { int: true, min: 0 }) ?? 0,
		lifetimeSpentMinor: num(o, 'lifetimeSpentMinor', path, { int: true, min: 0 }) ?? 0,
		ledger: arr(o, 'ledger', path, BUNDLE_LIMITS.other).map((e, i) => {
			const eo = objAt(e, `${path}.ledger[${i}]`);
			return {
				ref: str(eo, 'ref', path, { required: true, max: 300 })!,
				type: str(eo, 'type', path, { max: 40 }) ?? 'adjustment',
				amountMinor: num(eo, 'amountMinor', path, { int: true }) ?? 0,
				at: str(eo, 'at', path, { max: 40 }),
				reason: str(eo, 'reason', path, { max: 200 })
			};
		})
	};
}

function vSlot(x: unknown, path: string): BSlot {
	const o = objAt(x, path);
	const extras = arr(o, 'extras', path, 20)
		.map((e) => oneOf(e, SLOT_EXTRAS))
		.filter((e): e is SlotExtra => !!e);
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		person: str(o, 'person', path, { max: 300 }),
		displayName: str(o, 'displayName', path, { max: 120 }) ?? 'Jumper',
		email: str(o, 'email', path, { max: 254 }),
		licence: str(o, 'licence', path, { max: 60 }),
		weightKg: num(o, 'weightKg', path, { min: 0 }),
		jumpType: str(o, 'jumpType', path, { max: 40 }) ?? 'other',
		groupId: str(o, 'groupId', path, { max: 300 }),
		teamName: str(o, 'teamName', path, { max: 120 }),
		tandem: str(o, 'tandem', path, { max: 300 }),
		staffRole: oneOf(o.staffRole, SLOT_STAFF_ROLES),
		isLoadMaster: bool(o, 'isLoadMaster'),
		extras,
		priceLines: arr(o, 'priceLines', path, 20).map((l, i) => {
			const lo = objAt(l, `${path}.priceLines[${i}]`);
			return {
				code: str(lo, 'code', path, { max: 40 }) ?? 'other',
				label: str(lo, 'label', path, { max: 80 }) ?? '',
				amountMinor: num(lo, 'amountMinor', path, { int: true }) ?? 0
			};
		}),
		depositMinor: num(o, 'depositMinor', path, { int: true, min: 0 }) ?? 0,
		totalMinor: num(o, 'totalMinor', path, { int: true }) ?? 0,
		paid: bool(o, 'paid'),
		staffPayMinor: num(o, 'staffPayMinor', path, { int: true, min: 0 }) ?? 0,
		colour: str(o, 'colour', path, { max: 20 }),
		position: num(o, 'position', path, { int: true, min: 0 }) ?? undefined
	};
}

function vLoad(x: unknown, path: string): BLoad {
	const o = objAt(x, path);
	const status = oneOf(o.status, ['planned', 'open', 'completed', 'cancelled'] as const) ?? 'planned';
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		day: date(o, 'day', path, true)!,
		loadNumber: num(o, 'loadNumber', path, { required: true, int: true, min: 1 })!,
		status,
		isOpen: bool(o, 'isOpen'),
		aircraftName: str(o, 'aircraftName', path, { max: 120 }),
		capacity: num(o, 'capacity', path, { int: true, min: 0 }) ?? 0,
		weightLimitKg: num(o, 'weightLimitKg', path, { min: 0 }),
		pilotName: str(o, 'pilotName', path, { max: 120 }),
		pilotWeightKg: num(o, 'pilotWeightKg', path, { min: 0 }),
		requirements: str(o, 'requirements', path, { max: 500 }),
		scheduledAt: str(o, 'scheduledAt', path, { max: 40 }),
		refuel: bool(o, 'refuel'),
		shutdownMinutes: num(o, 'shutdownMinutes', path, { int: true, min: 0 }),
		slots: arr(o, 'slots', path, 200).map((s, i) => vSlot(s, `${path}.slots[${i}]`))
	};
}

function vTandem(x: unknown, path: string): BTandem {
	const o = objAt(x, path);
	const s = (k: string, max = 200) => str(o, k, path, { max });
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		confirmationNumber: s('confirmationNumber', 40),
		status: oneOf(o.status, ['booked', 'registered', 'manifested', 'completed', 'cancelled'] as const) ?? undefined,
		name: s('name', 120) ?? 'Tandem passenger',
		email: s('email', 254),
		phone: s('phone', 40),
		idNumber: s('idNumber', 60),
		gender: oneOf(o.gender, ['male', 'female', 'other'] as const),
		dob: date(o, 'dob', path),
		nationality: s('nationality', 80),
		heightCm: num(o, 'heightCm', path, { min: 0 }),
		weightKg: num(o, 'weightKg', path, { min: 0 }),
		addressLine1: s('addressLine1'),
		addressLine2: s('addressLine2'),
		city: s('city', 120),
		postalCode: s('postalCode', 20),
		country: s('country', 80),
		guardianName: s('guardianName', 120),
		guardianEmail: s('guardianEmail', 254),
		guardianIdNumber: s('guardianIdNumber', 60),
		emergencyName: s('emergencyName', 120),
		emergencyEmail: s('emergencyEmail', 254),
		emergencyPhone: s('emergencyPhone', 40),
		jumpDate: date(o, 'jumpDate', path),
		bookingTime: (() => {
			const t = s('bookingTime', 5);
			return t && TIME_RE.test(t) ? t : null;
		})(),
		extras: arr(o, 'extras', path, 20)
			.map((e) => oneOf(e, SLOT_EXTRAS))
			.filter((e): e is SlotExtra => !!e),
		heardFrom: s('heardFrom', 80),
		note: s('note', 2000),
		indemnitySignedAt: s('indemnitySignedAt', 40),
		totalMinor: num(o, 'totalMinor', path, { int: true, min: 0 }) ?? 0,
		depositMinor: num(o, 'depositMinor', path, { int: true, min: 0 }) ?? 0,
		amountPaidMinor: num(o, 'amountPaidMinor', path, { int: true, min: 0 }) ?? 0,
		paymentStatus:
			oneOf(o.paymentStatus, ['unpaid', 'deposit_paid', 'partially_paid', 'paid', 'refunded'] as const) ?? undefined,
		paymentMethod: s('paymentMethod', 40),
		onlineBooking: bool(o, 'onlineBooking'),
		manifested: bool(o, 'manifested'),
		createdAt: s('createdAt', 40)
	};
}

function vDropzone(x: unknown, path: string): BDropzone {
	const o = objAt(x, path);
	const prices: Partial<Record<PriceCode, number>> = {};
	if (o.prices != null) {
		const p = objAt(o.prices, `${path}.prices`);
		for (const [k, v] of Object.entries(p)) {
			if ((PRICE_CODES as string[]).includes(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0) {
				prices[k as PriceCode] = v;
			}
		}
	}
	const L = BUNDLE_LIMITS.other;
	return {
		ref: str(o, 'ref', path, { required: true, max: 300 })!,
		name: str(o, 'name', path, { required: true, max: 120 })!,
		description: str(o, 'description', path, { max: 4000 }),
		address: str(o, 'address', path, { max: 500 }),
		lat: num(o, 'lat', path),
		lng: num(o, 'lng', path),
		contactEmail: str(o, 'contactEmail', path, { max: 254 }),
		contactPhone: str(o, 'contactPhone', path, { max: 40 }),
		openDays: arr(o, 'openDays', path, 7).filter((d): d is string => typeof d === 'string'),
		openTime: str(o, 'openTime', path, { max: 5 }),
		closeTime: str(o, 'closeTime', path, { max: 5 }),
		currency: str(o, 'currency', path, { max: 3 })?.toUpperCase() ?? null,
		timezone: str(o, 'timezone', path, { max: 60 }),
		paymentsOn: bool(o, 'paymentsOn'),
		walletEnabled: bool(o, 'walletEnabled'),
		payAtManifest: bool(o, 'payAtManifest'),
		emailNotices: bool(o, 'emailNotices'),
		indemnityTandemActive: bool(o, 'indemnityTandemActive'),
		indemnitySportActive: bool(o, 'indemnitySportActive'),
		prices,
		aircraft: arr(o, 'aircraft', path, L).map((a, i) => {
			const p = `${path}.aircraft[${i}]`;
			const ao = objAt(a, p);
			return {
				ref: str(ao, 'ref', p, { required: true, max: 300 })!,
				name: str(ao, 'name', p, { max: 120 }) ?? 'Aircraft',
				tailNumber: str(ao, 'tailNumber', p, { max: 40 }),
				capacity: num(ao, 'capacity', p, { int: true, min: 0 }) ?? 0,
				weightLimitKg: num(ao, 'weightLimitKg', p, { min: 0 })
			};
		}),
		staff: arr(o, 'staff', path, L).map((s, i) => {
			const p = `${path}.staff[${i}]`;
			const so = objAt(s, p);
			return {
				person: str(so, 'person', p, { required: true, max: 300 })!,
				roles: arr(so, 'roles', p, 20)
					.map((r) => oneOf(r, DROPZONE_ROLES))
					.filter((r): r is DropzoneRole => !!r),
				colour: str(so, 'colour', p, { max: 20 })
			};
		}),
		followers: arr(o, 'followers', path, BUNDLE_LIMITS.people).filter((f): f is string => typeof f === 'string'),
		rigs: arr(o, 'rigs', path, L).map((r, i) => vRig(r, `${path}.rigs[${i}]`)),
		teams: arr(o, 'teams', path, L).map((t, i) => {
			const p = `${path}.teams[${i}]`;
			const to = objAt(t, p);
			return {
				ref: str(to, 'ref', p, { required: true, max: 300 })!,
				name: str(to, 'name', p, { max: 120 }) ?? 'Team',
				discipline: str(to, 'discipline', p, { max: 80 }),
				colour: str(to, 'colour', p, { max: 20 }),
				coach: str(to, 'coach', p, { max: 300 }),
				video: str(to, 'video', p, { max: 300 }),
				members: arr(to, 'members', p, 200).filter((m): m is string => typeof m === 'string')
			};
		}),
		bookingSlots: arr(o, 'bookingSlots', path, L).map((b, i) => {
			const p = `${path}.bookingSlots[${i}]`;
			const bo = objAt(b, p);
			const time = str(bo, 'time', p, { required: true, max: 5 })!;
			if (!TIME_RE.test(time)) throw new BundleError(`${p}.time must be HH:MM`);
			return {
				ref: str(bo, 'ref', p, { required: true, max: 300 })!,
				date: date(bo, 'date', p),
				weekday: num(bo, 'weekday', p, { int: true, min: 0 }),
				time,
				capacity: num(bo, 'capacity', p, { int: true, min: 0 }) ?? 1
			};
		}),
		tandems: arr(o, 'tandems', path, L).map((t, i) => vTandem(t, `${path}.tandems[${i}]`)),
		indemnitySections: arr(o, 'indemnitySections', path, 500).map((s, i) => {
			const p = `${path}.indemnitySections[${i}]`;
			const so = objAt(s, p);
			return {
				ref: str(so, 'ref', p, { required: true, max: 300 })!,
				audience: oneOf(so.audience, ['tandem', 'sport'] as const) ?? 'sport',
				position: num(so, 'position', p, { int: true, min: 0 }) ?? i,
				title: str(so, 'title', p, { max: 200 }) ?? 'Section',
				content: str(so, 'content', p, { max: 20000 }) ?? ''
			};
		}),
		loads: arr(o, 'loads', path, BUNDLE_LIMITS.loads).map((l, i) => vLoad(l, `${path}.loads[${i}]`)),
		wallets: arr(o, 'wallets', path, BUNDLE_LIMITS.people).map((w, i) => vWallet(w, `${path}.wallets[${i}]`))
	};
}

/** Validate + normalise an untrusted bundle. Throws BundleError with a readable path. */
export function parseBundle(input: unknown): Bundle {
	const o = objAt(input, 'bundle');
	if (o.format !== BUNDLE_FORMAT) throw new BundleError(`Not a ${BUNDLE_FORMAT} file`);
	if (o.version !== BUNDLE_VERSION) throw new BundleError(`Unsupported bundle version ${String(o.version)}`);
	const so = objAt(o.source ?? {}, 'source');
	const system = oneOf(so.system, ['jumpmaster', 'slot', 'csv'] as const) ?? 'slot';
	const people = arr(o, 'people', 'bundle', BUNDLE_LIMITS.people).map((p, i) => vPerson(p, `people[${i}]`));
	let jumper: BJumper | null = null;
	if (o.jumper != null) {
		const jo = objAt(o.jumper, 'jumper');
		jumper = {
			person: str(jo, 'person', 'jumper', { required: true, max: 300 })!,
			jumps: arr(jo, 'jumps', 'jumper', BUNDLE_LIMITS.jumps).map((j, i) => vJump(j, `jumper.jumps[${i}]`)),
			rigs: arr(jo, 'rigs', 'jumper', BUNDLE_LIMITS.other).map((r, i) => vRig(r, `jumper.rigs[${i}]`)),
			wallets: arr(jo, 'wallets', 'jumper', BUNDLE_LIMITS.other).map((w, i) => vWallet(w, `jumper.wallets[${i}]`))
		};
	}
	const dropzone = o.dropzone != null ? vDropzone(o.dropzone, 'dropzone') : null;
	const slotCount = dropzone?.loads?.reduce((n, l) => n + l.slots.length, 0) ?? 0;
	if (slotCount > BUNDLE_LIMITS.slots) throw new BundleError('Too many slots in this bundle');
	return {
		format: BUNDLE_FORMAT,
		version: BUNDLE_VERSION,
		source: {
			system,
			origin: str(so, 'origin', 'source', { max: 300 }),
			exportedAt: str(so, 'exportedAt', 'source', { max: 40 }) ?? new Date(0).toISOString()
		},
		people,
		jumper,
		dropzone
	};
}
