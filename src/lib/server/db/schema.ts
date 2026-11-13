/**
 * Core schema — shared by Cloudflare D1 and bun:sqlite.
 *
 * Conventions (keep these when adding tables):
 *  - text primary keys (`newId()`), never autoincrement — ids must be safe to sync between instances
 *  - instants are integer milliseconds since epoch (`timestamp_ms` mode → JS Date)
 *  - calendar dates (DOB, jump date, load day, expiry/repack dates) are ISO `YYYY-MM-DD` text,
 *    in the dropzone's local timezone where relevant
 *  - money is always integer minor units (cents) + an ISO 4217 currency
 *  - snake_case column names, plural table names
 *  - JSON blobs as `text({ mode: 'json' })` with an explicit `$type<...>()`
 *  - imported rows carry `source_ref` for idempotent re-import
 *
 * docs/DOMAIN.md documents every table and the services that use them.
 */
import { sql } from 'drizzle-orm';
import {
	customType,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import {
	ASSOCIATIONS,
	DROPZONE_ROLES,
	GEAR_SERVICE_KINDS,
	GENDERS,
	INDEMNITY_AUDIENCES,
	INDEMNITY_SECTION_TYPES,
	JUMP_SOURCES,
	LEDGER_TYPES,
	LOAD_STATUSES,
	MEMBER_STATUSES,
	NOTIFICATION_TYPES,
	PAYMENT_PROVIDERS,
	PAYMENT_PURPOSES,
	PAYMENT_RECORD_STATUSES,
	PAYMENT_STATUSES,
	RATING_BODIES,
	RIG_KINDS,
	SLOT_STAFF_ROLES,
	TANDEM_STATUSES,
	type IndemnityAudience,
	type IndemnitySectionType,
	type NotificationPayload,
	type SlotExtra
} from '../../domain/constants.ts';

export { DROPZONE_ROLES, MEMBER_STATUSES };
export type { DropzoneRole, MemberStatus } from '../../domain/constants.ts';

const ms = (name: string) => integer(name, { mode: 'timestamp_ms' });
const bool = (name: string) => integer(name, { mode: 'boolean' });

const createdAt = () =>
	ms('created_at')
		.notNull()
		.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
		.$defaultFn(() => new Date());
const updatedAt = () =>
	ms('updated_at')
		.notNull()
		.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
		.$defaultFn(() => new Date());

// ═══ Identity ═══════════════════════════════════════════════════════════════

export const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		name: text('name').notNull(),
		phone: text('phone'),
		passwordHash: text('password_hash'),
		/** Legacy avatar URL/key; prefer `avatarFileId`. */
		avatar: text('avatar'),
		/** Federation: id of the linked account on the global instance (null when not linked / on global). */
		globalId: text('global_id'),
		emailVerifiedAt: ms('email_verified_at'),
		createdAt: createdAt(),
		// ── profile ──
		avatarFileId: text('avatar_file_id'),
		address: text('address'),
		/** YYYY-MM-DD */
		dob: text('dob'),
		emergencyName: text('emergency_name'),
		emergencyPhone: text('emergency_phone'),
		marketingOptIn: bool('marketing_opt_in').notNull().default(false),
		// ── credentials ──
		association: text('association', { enum: ASSOCIATIONS }),
		associationNumber: text('association_number'),
		/** YYYY-MM-DD */
		associationExpiry: text('association_expiry'),
		/** Set when membership was verified against PASA/USPA. */
		associationVerifiedAt: ms('association_verified_at'),
		licence: text('licence'),
		/** Jumps done before the logbook here started ("Number of Jumps" in the original). */
		declaredJumpCount: integer('declared_jump_count').notNull().default(0),
		weightKg: real('weight_kg'),
		/** Exit weight incl. gear — used as slot weight. */
		loadingWeightKg: real('loading_weight_kg'),
		isSuperAdmin: bool('is_super_admin').notNull().default(false),
		updatedAt: ms('updated_at'),
		sourceRef: text('source_ref'),
		/** Account deleted by its owner: the row is an anonymous tombstone kept for dropzone records (domain/account.ts). */
		deletedAt: ms('deleted_at')
	},
	(t) => [
		uniqueIndex('users_email_unique').on(t.email),
		index('users_global_id_idx').on(t.globalId),
		uniqueIndex('users_source_ref_unique').on(t.sourceRef)
	]
);

export const sessions = sqliteTable(
	'sessions',
	{
		/** sha256(token) hex — the raw token only ever lives in the cookie. */
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: ms('expires_at').notNull(),
		createdAt: createdAt(),
		userAgent: text('user_agent'),
		ip: text('ip')
	},
	(t) => [index('sessions_user_id_idx').on(t.userId)]
);

export const passwordResetTokens = sqliteTable(
	'password_reset_tokens',
	{
		/** sha256(token) hex */
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: ms('expires_at').notNull(),
		usedAt: ms('used_at'),
		createdAt: createdAt()
	},
	(t) => [index('password_reset_tokens_user_id_idx').on(t.userId)]
);

/** Pending self-service email changes: the link mailed to the NEW address (auth/email-change.ts). */
export const emailChangeTokens = sqliteTable(
	'email_change_tokens',
	{
		/** sha256(token) hex */
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Normalised address the user asked to switch to. */
		newEmail: text('new_email').notNull(),
		expiresAt: ms('expires_at').notNull(),
		usedAt: ms('used_at'),
		createdAt: createdAt()
	},
	(t) => [index('email_change_tokens_user_id_idx').on(t.userId)]
);

/** PASA string ratings and USPA dated ratings. */
export const userRatings = sqliteTable(
	'user_ratings',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		body: text('body', { enum: RATING_BODIES }).notNull(),
		rating: text('rating').notNull(),
		value: text('value'),
		/** YYYY-MM-DD */
		expiresOn: text('expires_on'),
		verifiedAt: ms('verified_at'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('user_ratings_unique').on(t.userId, t.body, t.rating)]
);

/** Jump buddies ("All friends"). Directional: user follows `buddyId`. */
export const userBuddies = sqliteTable(
	'user_buddies',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		buddyId: text('buddy_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.userId, t.buddyId] }), index('user_buddies_buddy_idx').on(t.buddyId)]
);

// ═══ Files ══════════════════════════════════════════════════════════════════

export const FILE_PURPOSES = ['avatar', 'dz_photo', 'dz_logo', 'signature', 'indemnity_pdf', 'tandem_pdf', 'import', 'other'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/** Metadata for blobs in the storage driver (STORAGE_DRIVER: disk on bun, `file_blobs` in the DB on Cloudflare, or R2). */
export const files = sqliteTable(
	'files',
	{
		id: text('id').primaryKey(),
		/**
		 * Storage key. New files are content-addressed (`<purpose>/<sha256>.<ext>`), so identical
		 * uploads share one stored object; several rows may point at the same key (deleteFile only
		 * removes the object once no row references it). Older rows use `<purpose>/<uuid>.<ext>`.
		 */
		key: text('key').notNull(),
		mime: text('mime').notNull(),
		size: integer('size').notNull(),
		purpose: text('purpose', { enum: FILE_PURPOSES }).notNull().default('other'),
		ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
		dropzoneId: text('dropzone_id').references((): AnySQLiteColumn => dropzones.id, { onDelete: 'set null' }),
		sha256: text('sha256'),
		createdAt: createdAt()
	},
	(t) => [
		index('files_key_idx').on(t.key),
		index('files_sha_idx').on(t.sha256),
		index('files_owner_idx').on(t.ownerUserId),
		index('files_dropzone_idx').on(t.dropzoneId)
	]
);

/** BLOB column as Uint8Array on both drivers (D1 may hand back ArrayBuffer or number[]). */
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array | ArrayBuffer | number[] }>({
	dataType: () => 'blob',
	toDriver: (v) => v,
	fromDriver: (v) =>
		v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : Uint8Array.from(v as number[])
});

/**
 * File bytes for the `db` storage driver (Cloudflare without R2, or self-hosted with STORAGE_DRIVER=db).
 * Split into ≤512 KB parts: D1 caps a row/value at ~2 MB. `key` matches `files.key`.
 */
export const fileBlobs = sqliteTable(
	'file_blobs',
	{
		key: text('key').notNull(),
		part: integer('part').notNull(),
		bytes: bytes('bytes').notNull(),
		contentType: text('content_type'),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.key, t.part] })]
);

// ═══ Dropzones & membership ═════════════════════════════════════════════════

export type DropzoneSettings = {
	units?: 'imperial' | 'metric';
	/** Default slot count for new loads when no aircraft is selected. */
	defaultCapacity?: number;
	/** Default exit altitude written into logbook entries (ft). */
	defaultAltitudeFt?: number;
	/** Days before due date that repack/AAD warnings start (default 30). */
	gearWarnDays?: number;
	/** Credit staff pay to the staff member's wallet on load completion. */
	staffPayToWallet?: boolean;
	/** Require an open check-in before a jumper can be manifested. */
	requireCheckin?: boolean;
	[key: string]: unknown;
};

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const dropzones = sqliteTable(
	'dropzones',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		/** ISO 3166-1 alpha-2 */
		country: text('country'),
		/** IANA tz, e.g. Africa/Johannesburg */
		timezone: text('timezone').notNull().default('UTC'),
		/** ISO 4217, e.g. ZAR — wallet + price list currency. */
		currency: text('currency').notNull().default('USD'),
		lat: real('lat'),
		lng: real('lng'),
		address: text('address'),
		contactEmail: text('contact_email'),
		contactPhone: text('contact_phone'),
		website: text('website'),
		settings: text('settings', { mode: 'json' }).$type<DropzoneSettings>().notNull().default({}),
		createdAt: createdAt(),
		// ── public profile ──
		description: text('description'),
		photoFileId: text('photo_file_id').references(() => files.id, { onDelete: 'set null' }),
		openDays: text('open_days', { mode: 'json' }).$type<Weekday[]>().notNull().default([]),
		/** HH:MM local */
		openTime: text('open_time'),
		closeTime: text('close_time'),
		/** Shown in the public dropzone directory. */
		listed: bool('listed').notNull().default(true),
		// ── switches ──
		paymentsOn: bool('payments_on').notNull().default(false),
		walletEnabled: bool('wallet_enabled').notNull().default(false),
		/** Let wallets go negative instead of refusing manifest on insufficient funds. */
		walletAllowNegative: bool('wallet_allow_negative').notNull().default(false),
		/** "Allow payment at manifest" for tandem bookings. */
		payAtManifest: bool('pay_at_manifest').notNull().default(true),
		emailNotices: bool('email_notices').notNull().default(false),
		indemnityTandemActive: bool('indemnity_tandem_active').notNull().default(false),
		indemnitySportActive: bool('indemnity_sport_active').notNull().default(false),
		/** Reserve repack interval override; null → country default → 180. */
		repackIntervalDays: integer('repack_interval_days'),
		sourceRef: text('source_ref')
	},
	(t) => [uniqueIndex('dropzones_slug_unique').on(t.slug)]
);

/** Payment provider config. Secrets are stored encrypted by the payments module (placeholder). */
export const dropzonePaymentConfigs = sqliteTable('dropzone_payment_configs', {
	dropzoneId: text('dropzone_id')
		.primaryKey()
		.references(() => dropzones.id, { onDelete: 'cascade' }),
	stripeAccountId: text('stripe_account_id'),
	stripeCountry: text('stripe_country'),
	stripeCurrency: text('stripe_currency'),
	stripeOnboarded: bool('stripe_onboarded').notNull().default(false),
	stripeChargesEnabled: bool('stripe_charges_enabled').notNull().default(false),
	stripePayoutsEnabled: bool('stripe_payouts_enabled').notNull().default(false),
	payfastMerchantId: text('payfast_merchant_id'),
	payfastMerchantKeyEnc: text('payfast_merchant_key_enc'),
	payfastPassphraseEnc: text('payfast_passphrase_enc'),
	payfastSandbox: bool('payfast_sandbox').notNull().default(true),
	/**
	 * Per-provider settings for the dropzone's OWN merchant accounts (PayFast, Paystack, Yoco,
	 * Stripe): `{ [provider]: { enabled, ...public fields, ...secrets as *Enc (AES-GCM, SECRETS_KEY) } }`.
	 * Shape: `ProviderSettings` in src/lib/server/payments/config.ts. (PayFast's merchant id/key/
	 * passphrase/sandbox keep their own columns above; the stripe_* Connect columns are unused.)
	 */
	providers: text('providers', { mode: 'json' }).$type<Record<string, Record<string, unknown>>>().notNull().default({}),
	updatedAt: updatedAt()
});

/** One row per (dropzone, user). Roles live in `dropzone_member_roles` (many per member). */
export const dropzoneMembers = sqliteTable(
	'dropzone_members',
	{
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		status: text('status', { enum: MEMBER_STATUSES }).notNull().default('active'),
		createdAt: createdAt()
	},
	(t) => [
		primaryKey({ columns: [t.dropzoneId, t.userId] }),
		index('dropzone_members_user_id_idx').on(t.userId)
	]
);

export const dropzoneMemberRoles = sqliteTable(
	'dropzone_member_roles',
	{
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role', { enum: DROPZONE_ROLES }).notNull(),
		/** Manifest colour for this role (tandem instructors are colour-coded). */
		colour: text('colour'),
		createdAt: createdAt()
	},
	(t) => [
		primaryKey({ columns: [t.dropzoneId, t.userId, t.role] }),
		index('dropzone_member_roles_user_idx').on(t.userId),
		index('dropzone_member_roles_role_idx').on(t.dropzoneId, t.role)
	]
);

/** Followers / favourite dropzones (new-load notifications go to followers). */
export const dropzoneFollows = sqliteTable(
	'dropzone_follows',
	{
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		favourite: bool('favourite').notNull().default(false),
		notify: bool('notify').notNull().default(true),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.dropzoneId, t.userId] }), index('dropzone_follows_user_idx').on(t.userId)]
);

export const dropzoneSubscriptions = sqliteTable('dropzone_subscriptions', {
	dropzoneId: text('dropzone_id')
		.primaryKey()
		.references(() => dropzones.id, { onDelete: 'cascade' }),
	plan: text('plan', { enum: ['trial', 'founding', 'standard', 'lifetime', 'self_hosted'] })
		.notNull()
		.default('trial'),
	status: text('status', { enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'] })
		.notNull()
		.default('trialing'),
	provider: text('provider'),
	providerCustomerId: text('provider_customer_id'),
	providerSubscriptionId: text('provider_subscription_id'),
	priceMinor: integer('price_minor'),
	currency: text('currency'),
	interval: text('interval', { enum: ['month', 'year', 'once'] }),
	startedAt: ms('started_at'),
	currentPeriodEnd: ms('current_period_end'),
	trialEndsAt: ms('trial_ends_at'),
	cancelAt: ms('cancel_at'),
	endedAt: ms('ended_at'),
	updatedAt: updatedAt()
});

// ═══ Aircraft & prices ══════════════════════════════════════════════════════

export const aircraft = sqliteTable(
	'aircraft',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tailNumber: text('tail_number'),
		/** Jumper slots (pax). */
		capacity: integer('capacity').notNull(),
		/** Max total jumper + pilot weight; null = unchecked. */
		weightLimitKg: real('weight_limit_kg'),
		defaultPilotId: text('default_pilot_id').references(() => users.id, { onDelete: 'set null' }),
		active: bool('active').notNull().default(true),
		createdAt: createdAt()
	},
	(t) => [index('aircraft_dropzone_idx').on(t.dropzoneId)]
);

/** Flexible price list: one row per (dropzone, code). See PRICE_ITEMS for codes. */
export const pricelistItems = sqliteTable(
	'pricelist_items',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),
		amountMinor: integer('amount_minor').notNull().default(0),
		/** Optional display override of the default label. */
		label: text('label'),
		active: bool('active').notNull().default(true),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('pricelist_items_dz_code_unique').on(t.dropzoneId, t.code)]
);

// ═══ Gear ═══════════════════════════════════════════════════════════════════

/** Personal rigs (userId) and dropzone tandem/rental/student rigs (dropzoneId). */
export const rigs = sqliteTable(
	'rigs',
	{
		id: text('id').primaryKey(),
		kind: text('kind', { enum: RIG_KINDS }).notNull().default('personal'),
		userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
		dropzoneId: text('dropzone_id').references(() => dropzones.id, { onDelete: 'cascade' }),
		/** Rig identifier / nickname, e.g. "Tandem 3". */
		name: text('name'),
		container: text('container'),
		mainCanopy: text('main_canopy'),
		mainSizeSqft: integer('main_size_sqft'),
		/** Stored when entered manually; otherwise derive from loading weight / main size. */
		wingLoading: real('wing_loading'),
		reserveCanopy: text('reserve_canopy'),
		reserveSizeSqft: integer('reserve_size_sqft'),
		/** YYYY-MM-DD of last reserve repack. */
		reserveRepackedOn: text('reserve_repacked_on'),
		/** Per-rig override of the repack interval. */
		repackIntervalDays: integer('repack_interval_days'),
		aad: text('aad'),
		aadSerial: text('aad_serial'),
		/** YYYY-MM-DD next AAD service due. */
		aadServiceDueOn: text('aad_service_due_on'),
		/** YYYY-MM-DD AAD end of life. */
		aadExpiresOn: text('aad_expires_on'),
		wingsuit: text('wingsuit'),
		notes: text('notes'),
		active: bool('active').notNull().default(true),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		sourceRef: text('source_ref')
	},
	(t) => [index('rigs_user_idx').on(t.userId), index('rigs_dropzone_idx').on(t.dropzoneId)]
);

export const gearServiceEvents = sqliteTable(
	'gear_service_events',
	{
		id: text('id').primaryKey(),
		rigId: text('rig_id')
			.notNull()
			.references(() => rigs.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: GEAR_SERVICE_KINDS }).notNull(),
		/** YYYY-MM-DD */
		performedOn: text('performed_on').notNull(),
		performedByUserId: text('performed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		performedByName: text('performed_by_name'),
		riggerNumber: text('rigger_number'),
		notes: text('notes'),
		createdAt: createdAt()
	},
	(t) => [index('gear_service_events_rig_idx').on(t.rigId, t.performedOn)]
);

// ═══ Check-ins ══════════════════════════════════════════════════════════════

export const checkins = sqliteTable(
	'checkins',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** DZ-local YYYY-MM-DD of check-in. */
		day: text('day').notNull(),
		checkedInAt: ms('checked_in_at').notNull(),
		checkedInBy: text('checked_in_by').references(() => users.id, { onDelete: 'set null' }),
		checkedOutAt: ms('checked_out_at'),
		checkedOutBy: text('checked_out_by').references(() => users.id, { onDelete: 'set null' }),
		/** Slot weight snapshot (loading weight). */
		weightKg: real('weight_kg'),
		gearRental: bool('gear_rental').notNull().default(false),
		rentalRigId: text('rental_rig_id').references(() => rigs.id, { onDelete: 'set null' }),
		/** Staff-verified (licence/membership checked). */
		verified: bool('verified').notNull().default(false),
		note: text('note')
	},
	(t) => [
		uniqueIndex('checkins_open_unique')
			.on(t.dropzoneId, t.userId)
			.where(sql`checked_out_at IS NULL`),
		index('checkins_dz_day_idx').on(t.dropzoneId, t.day),
		index('checkins_user_idx').on(t.userId)
	]
);

// ═══ Teams ══════════════════════════════════════════════════════════════════

/** DZ teams (dropzoneId set) or a jumper's personal team (dropzoneId null, ownerUserId set). */
export const teams = sqliteTable(
	'teams',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id').references(() => dropzones.id, { onDelete: 'cascade' }),
		ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		discipline: text('discipline'),
		colour: text('colour'),
		coachUserId: text('coach_user_id').references(() => users.id, { onDelete: 'set null' }),
		videoUserId: text('video_user_id').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('teams_dropzone_idx').on(t.dropzoneId), index('teams_owner_idx').on(t.ownerUserId)]
);

export const teamMembers = sqliteTable(
	'team_members',
	{
		teamId: text('team_id')
			.notNull()
			.references(() => teams.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.teamId, t.userId] }), index('team_members_user_idx').on(t.userId)]
);

// ═══ Tandems & online booking ═══════════════════════════════════════════════

export const bookingSlots = sqliteTable(
	'booking_slots',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		/** Specific YYYY-MM-DD, or null for a recurring weekly slot (see weekday). */
		date: text('date'),
		/** 0=Mon … 6=Sun when recurring. */
		weekday: integer('weekday'),
		/** HH:MM local */
		time: text('time').notNull(),
		capacity: integer('capacity').notNull(),
		createdAt: createdAt()
	},
	(t) => [
		uniqueIndex('booking_slots_unique').on(t.dropzoneId, t.date, t.weekday, t.time),
		index('booking_slots_dz_date_idx').on(t.dropzoneId, t.date)
	]
);

export const tandemPassengers = sqliteTable(
	'tandem_passengers',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		confirmationNumber: text('confirmation_number').notNull(),
		status: text('status', { enum: TANDEM_STATUSES }).notNull().default('booked'),
		// passenger
		name: text('name').notNull(),
		email: text('email'),
		phone: text('phone'),
		idNumber: text('id_number'),
		gender: text('gender', { enum: GENDERS }),
		dob: text('dob'),
		nationality: text('nationality'),
		heightCm: real('height_cm'),
		weightKg: real('weight_kg'),
		addressLine1: text('address_line1'),
		addressLine2: text('address_line2'),
		city: text('city'),
		postalCode: text('postal_code'),
		country: text('country'),
		// guardian (under 18)
		guardianName: text('guardian_name'),
		guardianEmail: text('guardian_email'),
		guardianIdNumber: text('guardian_id_number'),
		// emergency contact
		emergencyName: text('emergency_name'),
		emergencyEmail: text('emergency_email'),
		emergencyPhone: text('emergency_phone'),
		emergencyAddressLine1: text('emergency_address_line1'),
		emergencyAddressLine2: text('emergency_address_line2'),
		emergencyCity: text('emergency_city'),
		emergencyPostalCode: text('emergency_postal_code'),
		emergencyCountry: text('emergency_country'),
		// jump
		/** YYYY-MM-DD */
		jumpDate: text('jump_date'),
		bookingSlotId: text('booking_slot_id').references(() => bookingSlots.id, { onDelete: 'set null' }),
		/** HH:MM of the booked time slot. */
		bookingTime: text('booking_time'),
		extras: text('extras', { mode: 'json' }).$type<SlotExtra[]>().notNull().default([]),
		heardFrom: text('heard_from'),
		note: text('note'),
		// indemnity
		indemnitySignatureId: text('indemnity_signature_id').references(
			(): AnySQLiteColumn => indemnitySignatures.id,
			{ onDelete: 'set null' }
		),
		indemnitySignedAt: ms('indemnity_signed_at'),
		pdfFileId: text('pdf_file_id').references(() => files.id, { onDelete: 'set null' }),
		// money
		currency: text('currency').notNull(),
		totalMinor: integer('total_minor').notNull().default(0),
		depositMinor: integer('deposit_minor').notNull().default(0),
		amountPaidMinor: integer('amount_paid_minor').notNull().default(0),
		paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull().default('unpaid'),
		paymentMethod: text('payment_method'),
		paidAt: ms('paid_at'),
		// flags
		onlineBooking: bool('online_booking').notNull().default(false),
		manifested: bool('manifested').notNull().default(false),
		createdAt: createdAt(),
		sourceRef: text('source_ref')
	},
	(t) => [
		uniqueIndex('tandem_passengers_confirmation_unique').on(t.confirmationNumber),
		index('tandem_passengers_dz_status_date_idx').on(t.dropzoneId, t.status, t.jumpDate),
		index('tandem_passengers_booking_slot_idx').on(t.bookingSlotId)
	]
);

// ═══ Loads & slots ══════════════════════════════════════════════════════════

export const loads = sqliteTable(
	'loads',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		/** DZ-local YYYY-MM-DD; load numbers restart each day. */
		day: text('day').notNull(),
		loadNumber: integer('load_number').notNull(),
		status: text('status', { enum: LOAD_STATUSES }).notNull().default('planned'),
		/** Jumpers may self-manifest ("openToJump"). */
		isOpen: bool('is_open').notNull().default(false),
		aircraftId: text('aircraft_id').references(() => aircraft.id, { onDelete: 'set null' }),
		/** Snapshot / custom plane name. */
		aircraftName: text('aircraft_name'),
		capacity: integer('capacity').notNull(),
		weightLimitKg: real('weight_limit_kg'),
		pilotUserId: text('pilot_user_id').references(() => users.id, { onDelete: 'set null' }),
		pilotName: text('pilot_name'),
		pilotWeightKg: real('pilot_weight_kg'),
		pilotPayMinor: integer('pilot_pay_minor').notNull().default(0),
		requirements: text('requirements'),
		scheduledAt: ms('scheduled_at'),
		/** 20-minute call timer start / due. */
		callStartedAt: ms('call_started_at'),
		callDueAt: ms('call_due_at'),
		boardingAt: ms('boarding_at'),
		departedAt: ms('departed_at'),
		landedAt: ms('landed_at'),
		completedAt: ms('completed_at'),
		cancelledAt: ms('cancelled_at'),
		refuel: bool('refuel').notNull().default(false),
		/** Engine shutdown duration (minutes), null = none. */
		shutdownMinutes: integer('shutdown_minutes'),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('loads_dz_day_number_unique').on(t.dropzoneId, t.day, t.loadNumber),
		index('loads_dz_status_idx').on(t.dropzoneId, t.status)
	]
);

export type PriceLine = { code: string; label: string; amountMinor: number };

export const slots = sqliteTable(
	'slots',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		loadId: text('load_id')
			.notNull()
			.references(() => loads.id, { onDelete: 'cascade' }),
		/** Null for custom jumpers without an account and tandem passengers. */
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		displayName: text('display_name').notNull(),
		email: text('email'),
		licence: text('licence'),
		weightKg: real('weight_kg').notNull().default(0),
		jumpType: text('jump_type').notNull(),
		/** Jump group / tandem group: slots sharing a groupId jump together. */
		groupId: text('group_id'),
		teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
		teamName: text('team_name'),
		tandemPassengerId: text('tandem_passenger_id').references(() => tandemPassengers.id, {
			onDelete: 'set null'
		}),
		staffRole: text('staff_role', { enum: SLOT_STAFF_ROLES }),
		isLoadMaster: bool('is_load_master').notNull().default(false),
		extras: text('extras', { mode: 'json' }).$type<SlotExtra[]>().notNull().default([]),
		/** Manifest "Customize slot price" — replaces the base price only. */
		baseOverrideMinor: integer('base_override_minor'),
		priceBreakdown: text('price_breakdown', { mode: 'json' }).$type<PriceLine[]>().notNull().default([]),
		depositMinor: integer('deposit_minor').notNull().default(0),
		totalMinor: integer('total_minor').notNull().default(0),
		currency: text('currency').notNull(),
		paid: bool('paid').notNull().default(false),
		paidAt: ms('paid_at'),
		paidVia: text('paid_via', { enum: PAYMENT_PROVIDERS }),
		walletHoldId: text('wallet_hold_id').references((): AnySQLiteColumn => ledgerEntries.id, {
			onDelete: 'set null'
		}),
		staffPayMinor: integer('staff_pay_minor').notNull().default(0),
		note: text('note'),
		colour: text('colour'),
		position: integer('position').notNull().default(0),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('slots_load_idx').on(t.loadId),
		index('slots_user_paid_idx').on(t.userId, t.paid),
		index('slots_dz_idx').on(t.dropzoneId),
		index('slots_group_idx').on(t.groupId),
		index('slots_tandem_idx').on(t.tandemPassengerId)
	]
);

// ═══ Logbook ════════════════════════════════════════════════════════════════

export const logbookJumps = sqliteTable(
	'logbook_jumps',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		jumpNumber: integer('jump_number').notNull(),
		/** YYYY-MM-DD */
		jumpDate: text('jump_date').notNull(),
		dropzoneId: text('dropzone_id').references(() => dropzones.id, { onDelete: 'set null' }),
		/** Free-text location (DZ name when not linked). */
		location: text('location'),
		aircraft: text('aircraft'),
		altitudeFt: integer('altitude_ft'),
		freefallSeconds: integer('freefall_seconds'),
		jumpType: text('jump_type'),
		description: text('description'),
		rigId: text('rig_id').references(() => rigs.id, { onDelete: 'set null' }),
		// sign-off
		signerUserId: text('signer_user_id').references(() => users.id, { onDelete: 'set null' }),
		signerName: text('signer_name'),
		signerLicence: text('signer_licence'),
		signatureFileId: text('signature_file_id').references(() => files.id, { onDelete: 'set null' }),
		signedAt: ms('signed_at'),
		/** Created by a dropzone from a completed load. */
		verified: bool('verified').notNull().default(false),
		source: text('source', { enum: JUMP_SOURCES }).notNull().default('manual'),
		/** Dedupe key: slot id for source=load, original doc path for source=import. */
		sourceRef: text('source_ref'),
		slotId: text('slot_id').references(() => slots.id, { onDelete: 'set null' }),
		loadId: text('load_id').references(() => loads.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('logbook_jumps_user_number_idx').on(t.userId, t.jumpNumber),
		index('logbook_jumps_user_date_idx').on(t.userId, t.jumpDate),
		uniqueIndex('logbook_jumps_user_source_ref_unique').on(t.userId, t.source, t.sourceRef)
	]
);

// ═══ Indemnity ══════════════════════════════════════════════════════════════

export const indemnitySections = sqliteTable(
	'indemnity_sections',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		audience: text('audience', { enum: INDEMNITY_AUDIENCES }).notNull(),
		type: text('type', { enum: INDEMNITY_SECTION_TYPES }).notNull().default('text'),
		position: integer('position').notNull().default(0),
		title: text('title').notNull(),
		content: text('content').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('indemnity_sections_dz_audience_idx').on(t.dropzoneId, t.audience, t.position)]
);

export type IndemnitySnapshot = {
	dropzoneName: string;
	audience: IndemnityAudience;
	sections: { title: string; content: string; type: IndemnitySectionType }[];
	/** Per-section answers, same order as `sections` (JSON only — no column change). */
	answers?: IndemnityAnswer[];
	/** Signer details captured at signing time (shown on the PDF). */
	signer?: Record<string, string | null | undefined>;
};
export type IndemnityAnswer = { accepted?: boolean; initials?: string | null; signatureFileId?: string | null } | null;

export const indemnitySignatures = sqliteTable(
	'indemnity_signatures',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		audience: text('audience', { enum: INDEMNITY_AUDIENCES }).notNull(),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		tandemPassengerId: text('tandem_passenger_id').references((): AnySQLiteColumn => tandemPassengers.id, {
			onDelete: 'set null'
		}),
		signerName: text('signer_name').notNull(),
		signatureFileId: text('signature_file_id').references(() => files.id, { onDelete: 'set null' }),
		guardianName: text('guardian_name'),
		guardianSignatureFileId: text('guardian_signature_file_id').references(() => files.id, {
			onDelete: 'set null'
		}),
		/** Legacy: PDFs used to be stored. They're now rendered on demand from the snapshot. */
		pdfFileId: text('pdf_file_id').references(() => files.id, { onDelete: 'set null' }),
		snapshot: text('snapshot', { mode: 'json' }).$type<IndemnitySnapshot>().notNull(),
		/** sha256 over the snapshot + signature image hashes at signing time (integrity of on-demand PDFs). */
		snapshotHash: text('snapshot_hash'),
		signedAt: ms('signed_at').notNull(),
		createdAt: createdAt()
	},
	(t) => [
		index('indemnity_signatures_dz_user_idx').on(t.dropzoneId, t.userId),
		index('indemnity_signatures_tandem_idx').on(t.tandemPassengerId)
	]
);

// ═══ Money ══════════════════════════════════════════════════════════════════

export const walletAccounts = sqliteTable(
	'wallet_accounts',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		currency: text('currency').notNull(),
		availableMinor: integer('available_minor').notNull().default(0),
		/** Held for manifested, not-yet-completed slots. */
		pendingMinor: integer('pending_minor').notNull().default(0),
		lifetimeTopupMinor: integer('lifetime_topup_minor').notNull().default(0),
		lifetimeSpentMinor: integer('lifetime_spent_minor').notNull().default(0),
		lastActivityAt: ms('last_activity_at'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('wallet_accounts_user_dz_unique').on(t.userId, t.dropzoneId)]
);

/**
 * Wallet ledger. `amountMinor` is the (positive) size of the movement, except `adjustment`
 * which is signed. Effects on the account:
 *   topup/refund/staff_pay: available += a      hold:         available -= a, pending += a
 *   hold_release:           available += a, pending -= a
 *   charge:                 available -= a  (capturing a hold = hold_release + charge, relatedEntryId = hold)
 *   adjustment:             available += a (signed)
 * `availableAfterMinor` / `pendingAfterMinor` are the balances after the entry.
 */
export const ledgerEntries = sqliteTable(
	'ledger_entries',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => walletAccounts.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		type: text('type', { enum: LEDGER_TYPES }).notNull(),
		amountMinor: integer('amount_minor').notNull(),
		currency: text('currency').notNull(),
		availableAfterMinor: integer('available_after_minor').notNull(),
		pendingAfterMinor: integer('pending_after_minor').notNull(),
		slotId: text('slot_id').references((): AnySQLiteColumn => slots.id, { onDelete: 'set null' }),
		loadId: text('load_id').references(() => loads.id, { onDelete: 'set null' }),
		relatedEntryId: text('related_entry_id').references((): AnySQLiteColumn => ledgerEntries.id, {
			onDelete: 'set null'
		}),
		provider: text('provider', { enum: PAYMENT_PROVIDERS }),
		providerTxId: text('provider_tx_id'),
		/** Machine origin, e.g. manifest, hold_update, load_completed, load_deleted. */
		origin: text('origin'),
		/** Human reason, e.g. "Card Payment", "Account Credit". */
		reason: text('reason'),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [
		index('ledger_entries_account_idx').on(t.accountId, t.createdAt),
		index('ledger_entries_slot_idx').on(t.slotId),
		uniqueIndex('ledger_entries_provider_tx_unique').on(t.provider, t.providerTxId)
	]
);

export const payments = sqliteTable(
	'payments',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id')
			.notNull()
			.references(() => dropzones.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		tandemPassengerId: text('tandem_passenger_id').references(() => tandemPassengers.id, {
			onDelete: 'set null'
		}),
		purpose: text('purpose', { enum: PAYMENT_PURPOSES }).notNull(),
		provider: text('provider', { enum: PAYMENT_PROVIDERS }).notNull(),
		status: text('status', { enum: PAYMENT_RECORD_STATUSES }).notNull().default('pending'),
		amountMinor: integer('amount_minor').notNull(),
		currency: text('currency').notNull(),
		/** Checkout session / payment id at the provider. */
		providerRef: text('provider_ref'),
		/** Webhook event id — idempotency key. */
		providerEventId: text('provider_event_id'),
		slotIds: text('slot_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
		ledgerEntryId: text('ledger_entry_id').references(() => ledgerEntries.id, { onDelete: 'set null' }),
		metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		completedAt: ms('completed_at')
	},
	(t) => [
		index('payments_dz_idx').on(t.dropzoneId, t.createdAt),
		index('payments_user_idx').on(t.userId),
		uniqueIndex('payments_provider_event_unique').on(t.provider, t.providerEventId)
	]
);

// ═══ Notifications ══════════════════════════════════════════════════════════

/** One row per recipient. */
export const notifications = sqliteTable(
	'notifications',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dropzoneId: text('dropzone_id').references(() => dropzones.id, { onDelete: 'cascade' }),
		type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
		payload: text('payload', { mode: 'json' }).$type<NotificationPayload>().notNull().default({}),
		actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		read: bool('read').notNull().default(false),
		readAt: ms('read_at'),
		createdAt: createdAt()
	},
	(t) => [index('notifications_user_read_idx').on(t.userId, t.read, t.createdAt)]
);

// ═══ Federation & import ════════════════════════════════════════════════════

/** Global side: registered self-hosted dropzone instances (OAuth clients). */
export const instances = sqliteTable(
	'instances',
	{
		id: text('id').primaryKey(),
		dropzoneId: text('dropzone_id').references(() => dropzones.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		origin: text('origin').notNull(),
		redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().notNull().default([]),
		clientId: text('client_id').notNull(),
		clientSecretHash: text('client_secret_hash').notNull(),
		publicKeyJwk: text('public_key_jwk', { mode: 'json' }).$type<Record<string, unknown>>(),
		status: text('status', { enum: ['active', 'suspended', 'revoked'] }).notNull().default('active'),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('instances_client_id_unique').on(t.clientId)]
);

/** Dropzone side: local user ↔ global identity link. */
export const linkedAccounts = sqliteTable(
	'linked_accounts',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		issuer: text('issuer').notNull(),
		/** Global user id. */
		subject: text('subject').notNull(),
		refreshTokenEnc: text('refresh_token_enc'),
		scopes: text('scopes'),
		linkedAt: ms('linked_at').notNull(),
		lastSyncAt: ms('last_sync_at')
	},
	(t) => [
		uniqueIndex('linked_accounts_issuer_subject_unique').on(t.issuer, t.subject),
		index('linked_accounts_user_idx').on(t.userId)
	]
);

/** Dropzone side: queued logbook sync to the global instance. */
export const federationOutbox = sqliteTable(
	'federation_outbox',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['jump_upsert', 'jump_delete'] }).notNull(),
		entityId: text('entity_id').notNull(),
		payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
		attempts: integer('attempts').notNull().default(0),
		nextAttemptAt: ms('next_attempt_at'),
		lastError: text('last_error'),
		sentAt: ms('sent_at'),
		createdAt: createdAt()
	},
	(t) => [index('federation_outbox_pending_idx').on(t.sentAt, t.nextAttemptAt)]
);

export type ImportCounts = Partial<Record<'jumps' | 'rigs' | 'ratings' | 'ledger' | 'skipped' | 'errors', number>>;

export const importJobs = sqliteTable(
	'import_jobs',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		source: text('source', { enum: ['jumpmaster', 'file'] }).notNull().default('jumpmaster'),
		status: text('status', { enum: ['pending', 'running', 'succeeded', 'failed'] })
			.notNull()
			.default('pending'),
		counts: text('counts', { mode: 'json' }).$type<ImportCounts>().notNull().default({}),
		log: text('log', { mode: 'json' }).$type<string[]>().notNull().default([]),
		error: text('error'),
		startedAt: ms('started_at'),
		finishedAt: ms('finished_at'),
		createdAt: createdAt()
	},
	(t) => [index('import_jobs_user_idx').on(t.userId, t.createdAt)]
);

// ═══ Association membership verification (PASA; USPA later) ═════════════════

export type MembershipCheckRating = { rating: string; value: string | null };

/**
 * Last association lookup per user (one association per user). Holds what the association
 * returned, whether it was applied to the profile, and the bookkeeping for re-checks/cooldowns.
 * `status`: verified (applied) | needs_review (name mismatch, staff must confirm) |
 * lapsed (found, not on the current members list) | rejected (staff said no).
 */
export const membershipChecks = sqliteTable(
	'membership_checks',
	{
		userId: text('user_id')
			.primaryKey()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: text('provider', { enum: ['pasa', 'uspa'] }).notNull(),
		number: text('number').notNull(),
		status: text('status', { enum: ['verified', 'needs_review', 'lapsed', 'rejected'] }).notNull(),
		memberName: text('member_name'),
		licence: text('licence'),
		dropzone: text('dropzone'),
		ratings: text('ratings', { mode: 'json' }).$type<MembershipCheckRating[]>().notNull().default([]),
		/** On the association's current (paid-up) members list at the last check. */
		current: bool('current').notNull().default(false),
		/** YYYY-MM-DD, derived (PASA memberships run to 31 March). */
		expiry: text('expiry'),
		checkedAt: ms('checked_at').notNull(),
		/** Last live request on behalf of this user (per-user cooldown). */
		lastAttemptAt: ms('last_attempt_at'),
		reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
		reviewedAt: ms('reviewed_at'),
		expiredNotifiedAt: ms('expired_notified_at'),
		lastError: text('last_error'),
		createdAt: createdAt()
	},
	(t) => [index('membership_checks_status_idx').on(t.provider, t.status)]
);

/** Small response cache for association lookups (member pages 24h, members list 1 day). */
export const providerCache = sqliteTable('provider_cache', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
	fetchedAt: ms('fetched_at').notNull(),
	expiresAt: ms('expires_at').notNull()
});

/**
 * In-app feedback posted as public GitHub issues (src/lib/server/feedback). One row per accepted
 * submission: drives the per-user rate limit and maps `reporter_ref` (the anonymous HMAC printed in
 * the issue) back to the user. A row is inserted before the GitHub call (issue columns null) and
 * deleted again if the call fails. Deleted with the account.
 */
export const feedbackSubmissions = sqliteTable(
	'feedback_submissions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: createdAt(),
		githubIssueNumber: integer('github_issue_number'),
		githubIssueUrl: text('github_issue_url'),
		reporterRef: text('reporter_ref').notNull()
	},
	(t) => [index('feedback_submissions_user_idx').on(t.userId, t.createdAt), index('feedback_submissions_ref_idx').on(t.reporterRef)]
);

// ═══ Row types ══════════════════════════════════════════════════════════════

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserRating = typeof userRatings.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Dropzone = typeof dropzones.$inferSelect;
export type DropzonePaymentConfig = typeof dropzonePaymentConfigs.$inferSelect;
export type DropzoneMember = typeof dropzoneMembers.$inferSelect;
export type DropzoneMemberRole = typeof dropzoneMemberRoles.$inferSelect;
export type DropzoneSubscription = typeof dropzoneSubscriptions.$inferSelect;
export type Aircraft = typeof aircraft.$inferSelect;
export type PricelistItem = typeof pricelistItems.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type BookingSlot = typeof bookingSlots.$inferSelect;
export type TandemPassenger = typeof tandemPassengers.$inferSelect;
export type Load = typeof loads.$inferSelect;
export type Slot = typeof slots.$inferSelect;
export type LogbookJump = typeof logbookJumps.$inferSelect;
export type Rig = typeof rigs.$inferSelect;
export type GearServiceEvent = typeof gearServiceEvents.$inferSelect;
export type IndemnitySection = typeof indemnitySections.$inferSelect;
export type IndemnitySignature = typeof indemnitySignatures.$inferSelect;
export type WalletAccount = typeof walletAccounts.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Instance = typeof instances.$inferSelect;
export type LinkedAccount = typeof linkedAccounts.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type MembershipCheck = typeof membershipChecks.$inferSelect;
export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
