# Domain layer

Everything UI work needs: tables, vocabulary and service functions. Routes should call these
services and never write domain tables directly. The schema is complete for every SPEC feature, so
UI work shouldn't need schema changes. If one turns out to be unavoidable, add a new migration and
leave `0001_domain` as it is.

| Where | What |
|---|---|
| `src/lib/domain/constants.ts` | **Client-safe** enums, labels, price codes, capabilities, `formatMoney`, `renderNotification`. Import from Svelte components. |
| `src/lib/server/db/schema.ts` | Drizzle schema + row types (`Load`, `Slot`, `LedgerEntry`, …). |
| `src/lib/server/domain/*.ts` | Services: pure TS, first arg `db: Database`, safe on D1 and bun:sqlite. |
| `src/lib/server/storage/` | Blob storage (`getStorage()`): local disk on bun (`UPLOADS_DIR`, default `data/uploads`); R2 on Cloudflare is a **stub** that expects a `FILES` binding, which doesn't exist yet. |
| `scripts/seed.ts` | `bun run db:seed [-- --reset]` creates the demo DZ (logins are printed; password `blue-skies-123`). |

## Conventions

* **Ids** are text UUIDs (`newId()`). **Instants** are `timestamp_ms` columns that read back as JS
  `Date`. **Calendar dates** (load day, jump date, DOB, expiry, repack) are `YYYY-MM-DD` text in the
  DZ's timezone. Use `localDate(now, dz.timezone)` to get "today".
* **Money** is always an integer in minor units (cents) plus a currency (`dz.currency`, e.g. `ZAR`).
  Display it with `formatMoney(minor, currency)`.
* Services take `now?: number` (ms) and `by?: userId` (the actor) so they're testable and can notify.
* Errors: services throw `DomainError(code, message, details?)`. Codes: `not_found`, `forbidden`, `invalid`,
  `conflict`, `load_full`, `overweight`, `load_locked`, `already_on_load`, `invalid_transition`,
  `insufficient_funds` (details `{availableMinor, requiredMinor, currency}`), `currency_mismatch`,
  `wallet_disabled`, `membership_expired`, `not_checked_in`, `cannot_sign_own_jump`,
  `signer_not_licensed`, `booking_full`. In form actions use `isDomainError(e)` and return `fail(400, { message: e.message, code: e.code })`.
* **Atomicity**: `runAtomic(db, statements)` uses `db.batch` on D1 and a synchronous transaction on
  bun:sqlite. `chunkedInsert` keeps multi-row inserts under D1's 100-bound-parameter limit. Never use
  `db.transaction` directly.
* **Permissions**: check with `requireCan(db, userId, dzId, capability)` in every staff action.

## Tables

| Table | Purpose / key columns |
|---|---|
| `users` | Identity + profile (`phone, address, dob, emergencyName/Phone, marketingOptIn, avatarFileId`) + credentials (`association` pasa/pasa_temp/pasa_student/uspa/other, `associationNumber, associationExpiry, associationVerifiedAt, licence, declaredJumpCount, weightKg, loadingWeightKg`), `isSuperAdmin`, `deletedAt` (anonymous tombstone, see account.ts). |
| `user_ratings` | `(userId, body pasa/uspa/other, rating)` unique, `value`, `expiresOn`, `verifiedAt`. |
| `user_buddies` | Jump buddies, one row per direction (`userId → buddyId`). |
| `files` | Blob metadata: `key` (storage key), `mime, size, purpose` (avatar/dz_photo/signature/indemnity_pdf/tandem_pdf/import/other), owner, dz. |
| `dropzones` | Profile (`description, photoFileId, openDays ['mon'…], openTime/closeTime 'HH:MM', address, lat/lng, contact*`), `currency, timezone, country`, switches (`paymentsOn, walletEnabled, walletAllowNegative, payAtManifest, emailNotices, indemnityTandemActive, indemnitySportActive, listed`), `repackIntervalDays`, `settings` JSON (`units, defaultCapacity, defaultAltitudeFt, gearWarnDays, staffPayToWallet, requireCheckin`). |
| `dropzone_payment_configs` | The dropzone's OWN provider accounts: PayFast columns + `providers` JSON (Paystack/Yoco/Stripe; secrets `*Enc`, AES-GCM with `SECRETS_KEY`). See docs/PAYMENTS.md. `stripe_*` Connect columns unused. |
| `dropzone_members` | `(dropzoneId, userId)` + `status` active/invited/suspended. |
| `dropzone_member_roles` | **Many roles per member**: `(dropzoneId, userId, role)` + `colour` (TI colour). Roles: owner, admin, manifest, staff, tandem_instructor, aff_instructor, instructor, coach, videographer, rigger, pilot, jumper. |
| `dropzone_follows` | Followers / favourites (`favourite`, `notify`). Followers get `new_loads`. |
| `dropzone_subscriptions` | Unused: the app is free for dropzones (no subscription billing). |
| `aircraft` | `name, tailNumber, capacity (pax), weightLimitKg, defaultPilotId, active`. |
| `pricelist_items` | One row per `(dropzoneId, code)`: `amountMinor`, optional `label`, `active`. Codes are in `PRICE_ITEMS`. |
| `checkins` | `day, checkedInAt/By, checkedOutAt/By, weightKg, gearRental, rentalRigId, verified`. At most one open check-in per (dz, user), enforced by a partial unique index. |
| `teams`, `team_members` | DZ teams (`dropzoneId`) or personal teams (`ownerUserId`); `discipline, colour, coachUserId, videoUserId`. |
| `booking_slots` | Online tandem availability: `date` (or recurring `weekday` with date null), `time 'HH:MM'`, `capacity`. |
| `tandem_passengers` | Passenger, guardian, emergency, address fields; `jumpDate, bookingTime, bookingSlotId, extras[]`; indemnity (`indemnitySignatureId, indemnitySignedAt, pdfFileId`); money (`totalMinor, depositMinor, amountPaidMinor, paymentStatus, paymentMethod`); `status` booked/registered/manifested/completed/cancelled; `confirmationNumber`, `onlineBooking`, `manifested`. |
| `loads` | `day, loadNumber` (unique per dz+day), `status` planned/open/called/boarding/departed/landed/completed/cancelled, `isOpen` (self-manifest), plane snapshot (`aircraftId, aircraftName, capacity, weightLimitKg`), pilot (`pilotUserId, pilotName, pilotWeightKg, pilotPayMinor`), `requirements, scheduledAt, callStartedAt/callDueAt` (20-min timer), `boardingAt…cancelledAt`, `refuel, shutdownMinutes`. |
| `slots` | One person on a load: `userId?` (null = custom jumper/passenger), `displayName, email, licence, weightKg, jumpType, groupId` (jump/tandem group), `teamId/teamName, tandemPassengerId, staffRole` (tandem_instructor/videographer/coach/aff_instructor/jumpmaster), `isLoadMaster, extras[]`, money (`baseOverrideMinor, priceBreakdown [{code,label,amountMinor}], depositMinor, totalMinor, currency, paid, paidAt, paidVia, walletHoldId, staffPayMinor`), `note, colour, position`. |
| `logbook_jumps` | `jumpNumber, jumpDate, dropzoneId?` + free-text `location`, `aircraft, altitudeFt, freefallSeconds, jumpType` (new), `description, rigId`; sign-off (`signerUserId, signerName, signerLicence, signatureFileId, signedAt`); `verified`; `source` manual/load/import + `sourceRef` (unique per user+source, used for dedupe); `slotId, loadId`. |
| `rigs` | Personal (`userId`) or DZ rigs (`dropzoneId`, kind tandem/rental/student): container, main + size, wing loading, reserve + size, `reserveRepackedOn, repackIntervalDays`, `aad, aadSerial, aadServiceDueOn, aadExpiresOn`, `wingsuit, notes, active`. |
| `gear_service_events` | Service history: `kind` (reserve_repack/aad_service/main_reline/inspection/other), `performedOn`, who, rigger number. |
| `indemnity_sections` | Form builder: `audience` tandem/sport, `type` text/acknowledgement, `position, title, content`. |
| `indemnity_signatures` | Signed record: audience, `userId` or `tandemPassengerId`, signer/guardian names and signature file ids, `pdfFileId`, `snapshot` (the form text that was signed), `signedAt`. |
| `wallet_accounts` | One per (user, dz): `currency, availableMinor, pendingMinor` (held), `lifetimeTopupMinor, lifetimeSpentMinor`. |
| `ledger_entries` | Append-only. `type` topup/hold/hold_release/charge/refund/adjustment/staff_pay, `amountMinor` (positive; signed for adjustment), `availableAfterMinor, pendingAfterMinor`, `slotId, loadId, relatedEntryId, provider, providerTxId` (unique per provider, used for idempotency), `origin, reason, createdBy`. |
| `payments` | Provider/manual payments: `purpose` (wallet_topup/slots/tandem/tandem_deposit/subscription), `provider`, `status`, `amountMinor, currency, providerRef, providerEventId` (unique), `slotIds[]`. |
| `notifications` | One row per recipient: `type`, `payload` JSON, `read/readAt`, `actorUserId`. Render with `renderNotification(type, payload)`. |
| `instances`, `linked_accounts`, `federation_outbox` | Federation (see ARCHITECTURE.md → Federation): registered clients (global), links (dropzone) / grants with issuer `instance:<id>` (global), queued logbook pushes. |
| `feedback_submissions` | In-app feedback posted as GitHub issues (`src/lib/server/feedback`): `userId, createdAt, githubIssueNumber/Url` (null while in flight), `reporterRef` (HMAC printed in the issue). Rate limit + reporter lookup. |
| `import_jobs` | Import runs (see IMPORT.md): `source, status, counts, log, error`. |

## Vocabulary (`#lib/domain/constants.ts`)

`JUMP_TYPES` (belly, freefly, tracking, angle, wingsuit, hop_pop, crw, aff_1_3, aff_4_7, aff_8_10,
static_line, isp, coaching, tandem, other) with `JUMP_TYPE_LABELS`. `SOLO_JUMP_TYPES` is the
self-manifest list. `SLOT_EXTRAS` / `SPORT_EXTRAS` / `TANDEM_EXTRAS` come with labels. `PRICE_ITEMS`
maps each code to `{category, label}`. `ROLE_LABELS`, `ROLE_CAPABILITIES`, `CAPABILITIES`,
`LOAD_STATUSES` (+ labels, `EDITABLE_LOAD_STATUSES`), `LEDGER_TYPE_LABELS`, `ASSOCIATION_LABELS`,
`KNOWN_RATINGS`, `HEARD_FROM`, `NOTIFICATION_TYPES`.

Capabilities: `dz.settings, staff.manage, pricing.manage, manifest, checkin.manage, tandems.manage,
teams.manage, payments.manage, gear.manage, aircraft.manage, indemnity.manage, reports.view, loads.view`.
owner and admin have every capability. manifest has manifest, check-in, tandems, teams, payments,
reports, loads.view and aircraft. rigger has gear.manage. Other staff roles have loads.view. jumper has none.

## Services (`src/lib/server/domain/`)

`index.ts` re-exports each module as a namespace (`import { loads, wallet } from '#lib/server/domain/index.ts'`).
Optional trailing args (`now`, `opts`) are left out below.

### permissions.ts
- `rolesCan(roles, cap)` / `capabilitiesOf(roles)`: pure.
- `getRoles(db, userId, dzId)`, `can(db, userId, dzId, cap)` (super-admins pass), `requireCan(…)` throws `forbidden`.
- Routes: the session user (`locals.user`) carries `isSuperAdmin`, so prefer `actorCan(user, roles, caps)` (pure, roles from `currentMembership`) for the active dropzone and `canAny(db, user, dzId, caps)` (one roles read) for another dropzone over looping `can()` (2 statements per denied cap).
- `grantRole(db, {dropzoneId, userId, role, colour?, by?, dropzoneName?})`: idempotent, creates the membership, notifies `added_staff`.
- `revokeRole(db, dzId, userId, role)` refuses to remove the last owner. `ensureMember`, `listUsersWithRole(db, dzId, role)` (pickers: pilots, TIs…).
- `src/lib/server/dropzones/index.ts`: `listMemberships(db, userId)` returns `{dropzone, roles[], role /*primary*/}`. Also `createDropzone` (seeds a zeroed price list), `hasStaffRole(roles)`.

### pricing.ts
- `computeSlotPrice({prices, jumpType, extras?, staffRole?, baseOverrideMinor?, depositMinor?})` → `{lines, baseMinor, extrasMinor, depositMinor, totalMinor}`. Base price comes from the jump type, the same way the original app does it. Tandem slots use the `tandem_*` extras. Working staff jump free. The override replaces only the base. The deposit is deducted and the total is never below 0.
- `computeStaffPay(prices, staffRole, groupExtras)`: TI gets `pay_tandem`, plus `pay_handcam` when the passenger has handcam; video gets `pay_tandem_video`; AFF-I gets `pay_aff`; coach gets `pay_coach`.
- `quoteTandem(prices, extras, jumpers)` → `{perJumper, totalMinor, depositMinor}`.
- `getPriceMap`, `listPricelist` (every code with category/label/amount), `setPrices(db, dzId, {code: minor})`, `getPrice`.

### wallet.ts
- `getAccount`, `getOrCreateAccount`, `listAccountsForUser`, `listLedger(db, accountId)`, `listLedgerWithLoads` (adds `loadNumber`/`loadDay`). The jumper wallet page shows it through `walletHistory()` (`#lib/domain/wallet-history.ts`): released holds and their `hold_release` rows are hidden, an open hold is a neutral "reserved" row, and the balance column is available + pending so each row moves it by its own amount. Staff views keep the raw ledger.
- `topUp(db, {userId, dropzoneId, amountMinor, provider, providerTxId?, currency?, reason?, createdBy?})`: idempotent on `provider+providerTxId`; throws `currency_mismatch`.
- `adjust(db, {…, amountMinor (signed), reason, createdBy})`, `refund(…)`.
- `placeHold(db, slotId)`, `updateHold(db, slotId)` (release + re-hold), `releaseHold(db, slotId, {origin})`. `addSlot`/`updateSlot`/`removeSlot` call these for you.
- `captureLoadHolds(db, loadId)`: release + charge, marks slots paid. `completeLoad` calls it.
- `paySlotsFromWallet(db, {userId, dropzoneId, slotIds})`: the "Pay with Wallet" button.
- Rules: holds only apply when `dz.walletEnabled`, the slot has a user, isn't staff, isn't paid and costs more than 0. `insufficient_funds` is thrown unless `dz.walletAllowNegative`.

### loads.ts
- Pure: `loadStats(load, slots)` → `{used, free, weightKg (incl. pilot), weightLimitKg, full, overweight}`; `assertFits`; `canTransition(from, to)`; `describeJump(type, groupSize, staffRole)`.
- Reads: `getLoad(db, id)` → `LoadWithSlots` (`slots`, `stats`); `listLoadsForDay(db, dzId, day, {onlyOpen?, includeCancelled?})`; `openLoadsToday(db, dzId)` (Join Load screen and hangar display); `nextLoadNumber`.
- `createLoads(db, {dropzoneId, day, count?, aircraftId? | aircraftName+capacity+weightLimitKg, pilotUserId?, pilotName?, pilotWeightKg?, requirements?, open?, scheduledAt?, spacingMinutes?, createdBy?})`: numbers continue within the day; with `spacingMinutes` load i is at `scheduledAt + i × gap` (0–600, must stay on the same local day); follows notify.
- `updateLoad(db, id, patch)`: change plane/pilot, refuel, `shutdownMinutes`, capacity. `setLoadOpen(db, id, bool)`. `deleteLoad` releases holds.
- Lifecycle: `startCall` (status `called`, `callDueAt = now+20min`, notifies), `cancelCall`, `boardLoad` (gear up, notifies), `departLoad`, `landLoad`, `cancelLoad` (releases holds), `completeLoad(db, id, {by})` → `{load, logbookEntries, chargedSlotIds, notified}`.
  - Completion captures holds, writes verified `source='load'` logbook entries (next jump number, DZ, aircraft, `settings.defaultAltitudeFt`, description), sets pilot pay, credits staff pay to wallets when `settings.staffPayToWallet`, completes tandem passengers and sends `load_completed`.
- Slots: `addSlot(db, loadId, SlotInput, opts)` / `addSlots` (all-or-nothing). They check the load is editable, capacity and weight including the pilot, duplicates, membership expiry (`opts.allowExpired`) and `settings.requireCheckin`. Weight defaults to the check-in weight, then the loading weight. They price the slot, place the hold (`opts.skipWallet` skips it) and notify `added_to_load`.
  - `SlotInput = {userId? | displayName, weightKg?, jumpType, extras?, staffRole?, isLoadMaster?, groupId?, teamId?, teamName?, tandemPassengerId?, baseOverrideMinor?, depositMinor?, note?, colour?}`.
  - `opts = {by?, now?, allowExpired?, selfManifest?, skipWallet?}`.
- `joinLoad(db, {loadId, userId, jumpType, extras?})` (self-manifest; the load must be open), `leaveLoad(db, loadId, userId)`.
- `addTandemGroup(db, {loadId, passengerId, instructorUserId, videographerUserId?})` creates 2–3 slots that share a `groupId`.
- `updateSlot(db, slotId, patch)` reprices and re-holds; it rolls back on `insufficient_funds`. `removeSlot(db, slotId, {withGroup?})`, `moveSlot(db, slotId, toLoadId, {withGroup?})`.

### checkins.ts
`checkIn(db, {dropzoneId, userId, by?, weightKg?, gearRental?})` is idempotent. A self check-in closes any open check-in at another DZ. When staff check someone in, the check-in is marked `verified` and the jumper is notified.
Also: `checkOut`, `checkOutAll(db, dzId, by)`, `listCheckedIn(db, dzId)` (with credential snapshot), `getOpenCheckin`, `isCheckedIn`, `currentCheckin(db, userId)`, `updateCheckin`.

### teams.ts
`createTeam(db, {dropzoneId}|{userId}, {name, discipline?, colour?, coachUserId?, videoUserId?, memberIds?})`, `updateTeam`, `deleteTeam`,
`addTeamMember` (notifies `team_add`), `removeTeamMember`, `getTeam` (with members), `listDropzoneTeams`, `listUserTeams`.
`manifestTeam(db, {teamId, loadId, jumpType, extras?, memberIds?, includeStaff?})` puts the whole team on one load as a single group; the coach and video join as staff slots.
`manifestGroup(db, {loadId, userIds, jumpType, …})` does the same for an ad-hoc group. Buddies: `addBuddy` (notifies `friend_add`), `removeBuddy`, `listBuddies`.

### logbook.ts
`nextJumpNumber(db, userId)` = max(highest logged, `declaredJumpCount`) + 1.
`addJump(db, userId, {jumpDate, jumpNumber?, dropzoneId?, location?, aircraft?, altitudeFt?, freefallSeconds?, jumpType?, description?, rigId?})`.
`updateJump(db, userId, jumpId, patch)`: only the owner can edit. On verified jumps the date, DZ, aircraft and number are locked. Changing facts clears the signature.
`deleteJump`. `signJump(db, {jumpId, signerUserId, signatureFileId?})`: the signer can't be the owner and must have a licence or a rating. The signer's name and licence are stored as a snapshot and the owner gets `jump_signed`.
`listJumps(db, userId, {limit, offset, from, to, order})`, `logbookTotals(db, userId, today)` → `{logged, totalJumps, totalFreefallSeconds, signed, verified, lastJumpDate, last30Days, last12Months}`, `importJumps(db, userId, rows)` (idempotent on `sourceRef`).

### gear.ts
Pure helpers:
- `repackStatus(rig, {today, intervalDays?, warnDays?})` and `aadStatus(rig, {today})` → `{dueOn, daysLeft, status: ok|due_soon|overdue|unknown}`. due_soon means within `warnDays` (default 30).
- `repackIntervalDays({rig, dropzoneDays, country})`: rig override, then DZ, then country (`COUNTRY_REPACK_DAYS`), then 180.
- `wingLoading(kg, sqft)` returns lb/sqft.

DB functions:
- `createRig(db, {userId}|{dropzoneId}, RigInput)`: the reserve repack date is required. Also `updateRig`, `deleteRig`, `getRig`, `listUserRigs`, `listDropzoneRigs`.
- `recordService(db, {rigId, kind, performedOn, performedBy*, nextDueOn?})` moves `reserveRepackedOn` and the AAD due date. `listServiceHistory`.
- `dropzoneGearStatus(db, dzId, today)`, `notifyRiggersOfDueRepacks(db, dzId, today)`, `nextUserRepack(db, userId, today)` (the Home stat).

### tandems.ts
`createPassenger(db, dzId, PassengerInput)` prices the passenger from the DZ price list. Under 12 is blocked; under 18 needs guardian fields. `updatePassenger` reprices when extras change. `getPassenger`, `findByConfirmation`,
`listPassengers(db, dzId, {tab: ready|completed|all, date?, search?})`, `recordTandemPayment(db, {passengerId, amountMinor, provider, isDeposit?})`, `tandemOutstanding(p)`.
Booking: `addBookingSlots(db, {dropzoneId, date, time, capacity, repeat: none|daily|weekly})` → `{added, existing}`, `availabilityForDate(db, dzId, date)` → slots with `remaining`, `bookableDates(db, dzId, from, to)`,
`createOnlineBooking(db, {dropzoneId, date, time, jumpers[1..5], depositPaid?})` throws `booking_full`.

### indemnity.ts
`listSections`, `addSection`, `updateSection`, `deleteSection`, `setIndemnityActive(db, dzId, audience, bool)`, `snapshotForm`,
`signIndemnity(db, {dropzoneId, audience, signerName, userId? | tandemPassengerId?, signatureFileId?, guardianName?, guardianSignatureFileId?, pdfFileId?})` stores a text snapshot. Signing a tandem form marks the passenger `registered`.
`latestUserSignature`, `needsSportIndemnity(db, dzId, userId)` (run this before Join Load).

### online-payments.ts
Online payments through the dropzone's own provider account (docs/PAYMENTS.md): `createOnlineTopUp`, `createOnlineTandemPayment(db, {allocations[], deposit})`,
`confirmOnlinePayment(db, {paymentId, provider, outcome, providerTxId, amountMinor, currency})` (idempotent; credits the wallet or marks passengers paid),
`cancelPendingOnlinePayment`, `listOnlinePayments`, `paymentCovers(payment, passengerId)`, `pendingTandemCheckout` (newest pending online tandem checkout covering a passenger, younger than `ABANDONED_CHECKOUT_MS`). Provider adapters live in `src/lib/server/payments/`.

### payments.ts
`unpaidSlots` / `paidSlots(db, userId, dzId)` (Jumper Account tabs), `outstandingByJumper(db, dzId, day)` (Jump Payments › Sporties),
`markSlotsPaid(db, {dropzoneId, slotIds, provider: cash|card|eft|manual|stripe|payfast, by})` releases wallet holds and records a `payments` row,
`sendPaymentReminder` (`payment_notice`), `staffEarnings(db, dzId, day)` (Staff tab, includes pilot pay).

### reports.ts
`jumpReport(db, dzId, from, to, {statuses?=['completed']})` → `{totals: {loads, slots, extraAltitude, maxAltitude, beachLanding, tandems, handcam, outsideVideo, extremeRide, sporties, aff, staticLine, gearRental, coachJumps}, perDay, perAircraft, perStaff, revenue}`.
It uses the original's counting rules: sporties are slots that aren't tandem or coach. `buildReport` is the pure core.

### notifications.ts
`notify(db, {userIds, type, dropzoneId?, actorUserId?, payload})`, `notifyStatements` (for batching), `listNotifications(db, userId, {unreadOnly?, limit?})` (rendered with title/body/href), `unreadCount`, `markRead(db, userId, ids?)`.

### dropzone-admin.ts
Dropzone:
- `getDropzone`, `updateDropzone(db, id, patch)` (validates times and days), `updateDropzoneSettings`.
- `listPublicDropzones({search, requireSubscription})`, `distanceKm(a, b)`.

Members and followers:
- `listMembers(db, dzId)` (members with all roles), `setRoleColour`, `removeMember`.
- `followDropzone`, `unfollowDropzone`, `listFollowedDropzones`.

Aircraft and payments:
- `createAircraft`, `updateAircraft`, `deleteAircraft`, `listAircraft`.
- `getPaymentConfig`, `savePaymentConfig`, `getSubscription`, `upsertSubscription`.

### profile.ts, files.ts, imports.ts, time.ts
- `updateProfile(db, userId, patch)` validates the input. `membershipStatus(user, today)` returns none, valid, expiring (≤30 days) or expired. `listRatings`, `setRatings(db, userId, body, ratings, {verified})`, `searchUsers(db, q)`.
- `saveFile(db, storage, {data, mime, purpose, ownerUserId?, dropzoneId?})` accepts png/jpg/webp/pdf/json/csv up to 10 MB. `getFile`, `readFileBlob`, `deleteFile`, `decodeDataUrl` (signature pads). Get the storage with `getStorage()` from `#lib/server/storage/index.ts`.
- `startImportJob`, `finishImportJob`, `listImportJobs`. The importer itself lives in `src/lib/server/import/` (docs/IMPORT.md).

### auth/email-change.ts (self-service email change, Profile → Security)
- `requestEmailChange(db, {userId, newEmail, password, now})` checks the current password (skipped for accounts without one, e.g. signed in via a linked account), `validateEmail`, not the same address, not used by another account (tombstones included); replaces any earlier link (`email_change_tokens`, one open row per user, token stored as sha256) and returns the raw token. The route mails `/confirm-email?token=…` (1 h) to the NEW address; a send failure cancels the request.
- `pendingEmailChange`, `cancelEmailChange`, `peekEmailChange` (the confirm page's GET only shows the address: mail scanners prefetch links, so the change needs the POST).
- `confirmEmailChange(db, token, now)` is single-use, re-checks the address is still free (else drops the link, nothing changes), sets `users.email`, keeps sessions; the route then notifies the OLD address. Housekeeping deletes expired/used links after a day.

### account.ts (self-service deletion, `/app/profile/delete`)
- `accountDeletionPreview(db, userId)` → `{hasPassword, email, soleOwnerOf[], activeLoads[], wallets[] (non-zero), retained {waivers, slots, ledgerEntries, checkins, payments}, linkedAccounts, blocked}`; `blockedMessage(preview)`.
- `deleteAccount(db, storage, userId, {now})` throws `conflict` when the user is the **only owner** of a dropzone or is on a load that isn't completed/cancelled.
- The `users` row is **never deleted**: `wallet_accounts`, `ledger_entries` and `checkins` cascade from it and the dropzone must keep them. It becomes a tombstone: `deletedAt`, name `Deleted user`, email `deleted-<id>@deleted.invalid` (frees the real address for signup), every profile/credential column null, no password. `searchUsers` and `findUserByEmail` (sign-in, password reset) skip tombstones; `validateEmail` refuses `.invalid` addresses (no signup/invite onto a placeholder); `getMailer()` never sends to `.invalid` (`isPlaceholderEmail`); the signed-waivers list shows "account deleted" instead of the placeholder address.
- **Cancelled**: pending pay-at-manifest (`provider='manual'`) wallet top-up requests. Online checkouts stay pending (a late provider confirmation is recorded; the DZ refunds).
- **Deleted** (one `runAtomic` batch): sessions, reset tokens, pending email-change links, linked accounts/grants, federation outbox, ratings, PASA check, buddies (both directions), notifications, import jobs, feedback submissions (the GitHub issues stay; they carry no identity), own logbook jumps, personal rigs + service history, personal teams, team memberships, dropzone memberships/roles/follows.
- **Detached** (link nulled, row kept): sign-offs the user gave on others' jumps (`signerUserId`; name/licence snapshot stays), team coach/video, aircraft default pilot, notification actor, service-event performer, `files.ownerUserId` of kept files. Open check-ins are closed.
- **Retained, pointing at the tombstone**: indemnity signatures (+ their signature images), slots (their `displayName`/`licence` snapshot is the DZ's copy), wallet accounts + ledger, check-ins, payments, loads (pilot/creator).
- **Files**: candidates = avatar, the user's own `dropzoneId IS NULL` uploads (avatar/signature/import/other) and sign-off images on the user's own jumps; any still referenced by a waiver (columns or snapshot JSON), another user's logbook, a dropzone photo/logo or a tandem PDF is kept. Rows go in the batch; afterwards each object is deleted only if no `files` row still shares its content-addressed key (a failure is left to the orphan-object sweep).
- **Federation**: global side, the user's grants go, so further pushes for that `sub` are dropped; dropzone side, the outgoing link + queued pushes go. Copies already on another instance are not touched (separate account there: the user deletes it there). Documented on the confirmation screen.

### federation.ts
- `outboxStatementsForJumps(db, jumps, now)` — called by `completeLoad()` inside its atomic batch; queues `jump_upsert` rows for jumpers with an outgoing global link.
- `enqueueUserJumps`, `dueOutbox`, `hasDueOutbox`, `markSent`, `markFailed` (exponential backoff), `outboxStats`, `linkedUserIds`. Pushing is in `src/lib/server/import/federation/client.ts`.
- `localDate`, `isIsoDate`, `addDays`, `daysBetween`, `weekdayIndex`, `ageOn`.

## Testing

`src/lib/server/domain/testing.ts` provides `freshDb()` (in-memory SQLite with the real migrations), `makeDropzone(db, patch?, prices?)` (ZAR, `TEST_PRICES`), `makeUser`, `makeMember(db, dzId, roles)`, `DAY` and `NOW`.
Run with `bun run test`. On D1, `runAtomic` takes the `db.batch` path; it was verified against local Miniflare D1 with `getPlatformProxy`.
