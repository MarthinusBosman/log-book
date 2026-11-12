/**
 * Client-safe domain vocabulary: enums, labels and code lists shared by the schema,
 * the server-side domain services and the UI. No server imports here.
 */

// ── Membership roles & capabilities ─────────────────────────────────────────

/** A user can hold several of these per dropzone (`dropzone_member_roles`). */
export const DROPZONE_ROLES = [
	'owner',
	'admin',
	'manifest',
	'staff',
	'tandem_instructor',
	'aff_instructor',
	'instructor',
	'coach',
	'videographer',
	'rigger',
	'pilot',
	'jumper'
] as const;
export type DropzoneRole = (typeof DROPZONE_ROLES)[number];

export const ROLE_LABELS: Record<DropzoneRole, string> = {
	owner: 'Owner',
	admin: 'Admin',
	manifest: 'Manifest / Manager',
	staff: 'Staff',
	tandem_instructor: 'Tandem instructor',
	aff_instructor: 'AFF instructor',
	instructor: 'Instructor',
	coach: 'Coach',
	videographer: 'Videographer',
	rigger: 'Rigger',
	pilot: 'Pilot',
	jumper: 'Jumper'
};

/** Highest first — used to pick a "primary" role for display. */
export const ROLE_PRECEDENCE: readonly DropzoneRole[] = DROPZONE_ROLES;

/** Roles that see the staff/back-office navigation. */
export const STAFF_ROLES: readonly DropzoneRole[] = DROPZONE_ROLES.filter((r) => r !== 'jumper');

export const CAPABILITIES = [
	'dz.settings', // dropzone details, payment setup, subscription
	'staff.manage', // add/remove members and roles, staff pay prices
	'pricing.manage',
	'manifest', // create/edit loads and slots, call loads, complete loads
	'checkin.manage', // check jumpers in/out
	'tandems.manage',
	'teams.manage',
	'payments.manage', // mark paid, manual wallet funds, refunds
	'gear.manage', // DZ rigs, record repacks/AAD service
	'aircraft.manage',
	'indemnity.manage',
	'reports.view',
	'loads.view' // see the full manifest (staff); jumpers only see open loads
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ALL_CAPS = [...CAPABILITIES];
export const ROLE_CAPABILITIES: Record<DropzoneRole, readonly Capability[]> = {
	owner: ALL_CAPS,
	admin: ALL_CAPS,
	manifest: [
		'manifest',
		'checkin.manage',
		'tandems.manage',
		'teams.manage',
		'payments.manage',
		'reports.view',
		'loads.view',
		'aircraft.manage'
	],
	staff: ['loads.view', 'checkin.manage'],
	tandem_instructor: ['loads.view'],
	aff_instructor: ['loads.view'],
	instructor: ['loads.view'],
	coach: ['loads.view'],
	videographer: ['loads.view'],
	rigger: ['loads.view', 'gear.manage'],
	pilot: ['loads.view'],
	jumper: []
};

export const MEMBER_STATUSES = ['active', 'invited', 'suspended'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

// ── Jumper credentials ──────────────────────────────────────────────────────

export const ASSOCIATIONS = ['pasa', 'pasa_temp', 'pasa_student', 'uspa', 'other'] as const;
export type Association = (typeof ASSOCIATIONS)[number];
export const ASSOCIATION_LABELS: Record<Association, string> = {
	pasa: 'PASA',
	pasa_temp: 'PASA Temp (3 months)',
	pasa_student: 'PASA Student',
	uspa: 'USPA',
	other: 'Other'
};

export const RATING_BODIES = ['pasa', 'uspa', 'other'] as const;
export type RatingBody = (typeof RATING_BODIES)[number];
/** Known rating names per body (free text is allowed too). */
export const KNOWN_RATINGS: Record<RatingBody, readonly string[]> = {
	pasa: [
		'Jumpmaster',
		'Instructor',
		'AFF Instructor',
		'Coach',
		'Tandem',
		'PRO Rating',
		'Parachute Technician',
		'Master Parachute Technician',
		'Senior Parachute Technician'
	],
	uspa: ['PRO', 'Coach', 'SLI', 'IADI', 'AFFI', 'TANI', 'CoachE', 'SLIE', 'IADIE', 'AFFIE', 'TANIE', 'PROHP'],
	other: []
};

// ── Jump types ──────────────────────────────────────────────────────────────

export const JUMP_TYPES = [
	'belly',
	'freefly',
	'tracking',
	'angle',
	'wingsuit',
	'hop_pop',
	'crw',
	'aff_1_3',
	'aff_4_7',
	'aff_8_10',
	'static_line',
	'isp',
	'coaching',
	'tandem',
	'other'
] as const;
export type JumpType = (typeof JUMP_TYPES)[number];
export const JUMP_TYPE_LABELS: Record<JumpType, string> = {
	belly: 'Belly',
	freefly: 'Freeflying',
	tracking: 'Tracking',
	angle: 'Angle',
	wingsuit: 'Wingsuiting',
	hop_pop: 'Hop & Pop',
	crw: 'CRW',
	aff_1_3: 'AFF 1-3',
	aff_4_7: 'AFF 4-7',
	aff_8_10: 'AFF 8-10',
	static_line: 'Static line',
	isp: 'ISP',
	coaching: 'Coaching',
	tandem: 'Tandem',
	other: 'Other'
};
/** Self-manifest (solo) options in the original app. */
export const SOLO_JUMP_TYPES: readonly JumpType[] = ['belly', 'freefly', 'tracking', 'angle', 'wingsuit', 'hop_pop', 'crw'];
export const AFF_JUMP_TYPES: readonly JumpType[] = ['aff_1_3', 'aff_4_7', 'aff_8_10'];

// ── Slots ───────────────────────────────────────────────────────────────────

/** Role a staff member works on a slot. Working staff slots are free to the staff member. */
export const SLOT_STAFF_ROLES = ['tandem_instructor', 'videographer', 'coach', 'aff_instructor', 'jumpmaster'] as const;
export type SlotStaffRole = (typeof SLOT_STAFF_ROLES)[number];
export const SLOT_STAFF_ROLE_LABELS: Record<SlotStaffRole, string> = {
	tandem_instructor: 'TI',
	videographer: 'Video',
	coach: 'Coach',
	aff_instructor: 'AFF-I',
	jumpmaster: 'Jumpmaster'
};

export const SLOT_EXTRAS = [
	'gear_rental',
	'extra_altitude',
	'max_altitude',
	'special_event',
	'handcam',
	'outside_video',
	'extreme_ride',
	'beach_landing'
] as const;
export type SlotExtra = (typeof SLOT_EXTRAS)[number];
export const SLOT_EXTRA_LABELS: Record<SlotExtra, string> = {
	gear_rental: 'Gear rental',
	extra_altitude: 'Extra altitude',
	max_altitude: 'Max altitude',
	special_event: 'Special event',
	handcam: 'Handcam',
	outside_video: 'Outside video',
	extreme_ride: 'Extreme ride',
	beach_landing: 'Beach landing'
};
export const SPORT_EXTRAS: readonly SlotExtra[] = ['gear_rental', 'extra_altitude', 'max_altitude', 'special_event'];
export const TANDEM_EXTRAS: readonly SlotExtra[] = [
	'handcam',
	'outside_video',
	'extreme_ride',
	'beach_landing',
	'extra_altitude',
	'max_altitude'
];

// ── Price list ──────────────────────────────────────────────────────────────

export const PRICE_CATEGORIES = ['sport', 'student', 'aff', 'tandem', 'staff_pay'] as const;
export type PriceCategory = (typeof PRICE_CATEGORIES)[number];

/** Every price-list item (one row per code per DZ in `pricelist_items`). */
export const PRICE_ITEMS = {
	sport_slot: { category: 'sport', label: 'Sport slot' },
	hop_pop: { category: 'sport', label: 'Hop & Pop' },
	gear_rental: { category: 'sport', label: 'Gear rental' },
	extra_altitude: { category: 'sport', label: 'Extra altitude' },
	max_altitude: { category: 'sport', label: 'Max altitude' },
	special_event: { category: 'sport', label: 'Special event' },
	static_line: { category: 'student', label: 'Static line jump' },
	static_line_course: { category: 'student', label: 'Static line course' },
	isp: { category: 'student', label: 'ISP jump' },
	coach: { category: 'student', label: 'Coaching jump' },
	aff_1_3: { category: 'aff', label: 'AFF jump 1-3' },
	aff_4_7: { category: 'aff', label: 'AFF jump 4-7' },
	aff_8_10: { category: 'aff', label: 'AFF jump 8-10' },
	aff_course: { category: 'aff', label: 'AFF course' },
	tandem_deposit: { category: 'tandem', label: 'Tandem booking deposit' },
	tandem_slot: { category: 'tandem', label: 'Tandem jump' },
	tandem_outside_video: { category: 'tandem', label: 'Outside video' },
	tandem_handcam: { category: 'tandem', label: 'Handcam' },
	tandem_extreme_ride: { category: 'tandem', label: 'Extreme ride' },
	tandem_beach_landing: { category: 'tandem', label: 'Beach landing' },
	tandem_extra_altitude: { category: 'tandem', label: 'Tandem extra altitude' },
	tandem_max_altitude: { category: 'tandem', label: 'Tandem max altitude' },
	pay_tandem: { category: 'staff_pay', label: 'Tandem instructor (per jump)' },
	pay_tandem_video: { category: 'staff_pay', label: 'Tandem videographer (per jump)' },
	pay_handcam: { category: 'staff_pay', label: 'Handcam (extra per jump)' },
	pay_aff: { category: 'staff_pay', label: 'AFF instructor (per jump)' },
	pay_coach: { category: 'staff_pay', label: 'Coach (per jump)' },
	pay_pilot: { category: 'staff_pay', label: 'Pilot (per load)' }
} as const satisfies Record<string, { category: PriceCategory; label: string }>;
export type PriceCode = keyof typeof PRICE_ITEMS;
export const PRICE_CODES = Object.keys(PRICE_ITEMS) as PriceCode[];

// ── Loads ───────────────────────────────────────────────────────────────────

export const LOAD_STATUSES = [
	'planned',
	'open',
	'called',
	'boarding',
	'departed',
	'landed',
	'completed',
	'cancelled'
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];
export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
	planned: 'Planned',
	open: 'Open',
	called: '20 min call',
	boarding: 'Boarding',
	departed: 'Departed',
	landed: 'Landed',
	completed: 'Completed',
	cancelled: 'Cancelled'
};
/** Statuses during which slots can still be added/removed/moved. */
export const EDITABLE_LOAD_STATUSES: readonly LoadStatus[] = ['planned', 'open', 'called', 'boarding'];
export const CALL_MINUTES = 20;

// ── Logbook ─────────────────────────────────────────────────────────────────

export const JUMP_SOURCES = ['manual', 'load', 'import'] as const;
export type JumpSource = (typeof JUMP_SOURCES)[number];

// ── Gear ────────────────────────────────────────────────────────────────────

export const RIG_KINDS = ['personal', 'tandem', 'rental', 'student'] as const;
export type RigKind = (typeof RIG_KINDS)[number];
export const GEAR_SERVICE_KINDS = ['reserve_repack', 'aad_service', 'main_reline', 'inspection', 'other'] as const;
export type GearServiceKind = (typeof GEAR_SERVICE_KINDS)[number];
export const DEFAULT_REPACK_DAYS = 180;
export type DueStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown';

// ── Tandems / bookings / indemnity ──────────────────────────────────────────

export const TANDEM_STATUSES = ['booked', 'registered', 'manifested', 'completed', 'cancelled'] as const;
export type TandemStatus = (typeof TANDEM_STATUSES)[number];
export const PAYMENT_STATUSES = ['unpaid', 'deposit_paid', 'partially_paid', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const GENDERS = ['male', 'female', 'other'] as const;
export const HEARD_FROM = [
	'Voucher',
	'Friend',
	'Pamphlet / Brochure',
	'Tourguide',
	'Facebook',
	'Instagram',
	'Tour Company',
	'Google Advert',
	'Google Search',
	'Youtube'
] as const;

export const INDEMNITY_AUDIENCES = ['tandem', 'sport'] as const;
export type IndemnityAudience = (typeof INDEMNITY_AUDIENCES)[number];
/** text = read only; acknowledgement = required checkbox; initials = typed initials; signature = extra signature pad. */
export const INDEMNITY_SECTION_TYPES = ['text', 'acknowledgement', 'initials', 'signature'] as const;
export type IndemnitySectionType = (typeof INDEMNITY_SECTION_TYPES)[number];

// ── Money ───────────────────────────────────────────────────────────────────

export const LEDGER_TYPES = ['topup', 'hold', 'hold_release', 'charge', 'refund', 'adjustment', 'staff_pay'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];
export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
	topup: 'Top-up',
	hold: 'Jump reserved',
	hold_release: 'Reservation cancelled',
	charge: 'Jump charged',
	refund: 'Refund',
	adjustment: 'Account adjustment',
	staff_pay: 'Staff pay'
};

export const PAYMENT_PROVIDERS = ['stripe', 'payfast', 'paystack', 'yoco', 'manual', 'cash', 'card', 'eft', 'wallet'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export const PAYMENT_PURPOSES = ['wallet_topup', 'slots', 'tandem', 'tandem_deposit', 'subscription'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];
export const PAYMENT_RECORD_STATUSES = ['pending', 'succeeded', 'failed', 'refunded', 'cancelled'] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

/** Format integer minor units for display, e.g. formatMoney(12345, 'ZAR') → "R 123.45". */
export function formatMoney(minor: number, currency: string, locale = 'en-ZA'): string {
	try {
		return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
	} catch {
		return `${currency} ${(minor / 100).toFixed(2)}`;
	}
}

// ── Notifications ───────────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
	'call_20min',
	'added_to_load',
	'removed_from_load',
	'new_loads',
	'load_completed',
	'repack_due',
	'payment_notice',
	'team_add',
	'added_staff',
	'friend_add',
	// push-only kinds in the original, in-app here too
	'gear_up',
	'moved_load',
	'checked_in',
	'checked_out',
	'jump_signed',
	'general'
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPayload = {
	dropzoneName?: string;
	loadNumber?: number;
	fromLoadNumber?: number;
	count?: number;
	day?: string;
	actorName?: string;
	rig?: string;
	title?: string;
	body?: string;
	href?: string;
	[key: string]: unknown;
};

/** 'YYYY-MM-DD' → 'Wed 11 Nov' for notification copy ('today' when missing). */
export function notificationDay(day: unknown): string {
	if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'today';
	return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Title/body/link for a notification (based on the original app's copy). */
export function renderNotification(
	type: NotificationType,
	p: NotificationPayload
): { title: string; body: string; href: string | null } {
	const dz = p.dropzoneName ?? 'the dropzone';
	const n = p.loadNumber ?? '?';
	switch (type) {
		case 'call_20min':
			return { title: '20 min call', body: `A 20 minute call has been made for load ${n}.`, href: '/app/check-in' };
		case 'added_to_load':
			return { title: 'Added to load', body: `You have been added to load ${n} at ${dz}.`, href: '/app/check-in' };
		case 'removed_from_load':
			return { title: 'Removed from load', body: `You have been removed from load ${n} at ${dz}.`, href: '/app/check-in' };
		case 'new_loads': {
			const count = Number(p.count ?? 1);
			return {
				title: 'New loads available',
				body: `${dz} just opened ${count} new load${count === 1 ? '' : 's'} for ${notificationDay(p.day)}.`,
				href: '/app/check-in'
			};
		}
		case 'load_completed':
			return {
				title: 'Load completed',
				body: `Load ${n} (${notificationDay(p.day)}) is in your logbook. Add your freefall time and notes.`,
				href: '/app/logbook'
			};
		case 'repack_due':
			return {
				title: 'Repack notice',
				body: `There is an upcoming repack at ${dz} on rig: ${p.rig ?? 'unknown'}. Please check the gear out.`,
				href: '/app/gear'
			};
		case 'payment_notice':
			return {
				title: 'Outstanding payment',
				body: `You have some outstanding payments at ${dz}. Please pay for your jumps.`,
				href: '/app/wallet'
			};
		case 'team_add':
			return { title: 'Added to a team', body: `${p.actorName ?? 'Someone'} has added you to their team.`, href: '/app/team' };
		case 'added_staff':
			return { title: 'Added as staff', body: `${dz} has added you as a staff member.`, href: '/app' };
		case 'friend_add':
			return { title: 'New jump buddy', body: `You have a new jump buddy: ${p.actorName ?? 'someone'}.`, href: '/app/team' };
		case 'gear_up':
			return { title: 'Gear up & go', body: `Gear up and go has been called for load ${n}.`, href: '/app/check-in' };
		case 'moved_load':
			return {
				title: 'Moved to load',
				body: `You've been moved from load ${p.fromLoadNumber ?? '?'} to load ${n}.`,
				href: '/app/check-in'
			};
		case 'checked_in':
			return { title: 'Checked in', body: `You have been checked in at ${dz}.`, href: '/app' };
		case 'checked_out':
			return { title: 'Checked out', body: `You have been checked out at ${dz}.`, href: '/app' };
		case 'jump_signed':
			return { title: 'Jump signed', body: `${p.actorName ?? 'Someone'} signed your jump.`, href: '/app/logbook' };
		case 'general':
			return { title: p.title ?? 'Notice', body: p.body ?? '', href: p.href ?? null };
	}
}
