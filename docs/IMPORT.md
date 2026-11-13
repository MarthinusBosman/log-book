# Import, export and federation

Everything that moves data in or out of an instance goes through one normalised format, the
**Log-Book bundle** (wire id `slot-bundle`, kept from the working name). Importers produce it, the exporter writes it, and the server applies it
idempotently. Federation (dropzone instance → global logbook) is described in
[`ARCHITECTURE.md`](ARCHITECTURE.md#federation).

| Code | What |
|---|---|
| `src/lib/import/bundle.ts` | Bundle types, limits, `parseBundle()` validation, `countBundle()` (client-safe) |
| `src/lib/import/csv.ts` | Logbook CSV parser, column auto-mapping, template, CSV writer (client-safe) |
| `src/lib/import/jumpmaster/` | Jump Master → bundle mapper (`map.ts`), value normalisers (`values.ts`), browser connector (`client.ts`) |
| `src/lib/server/import/apply.ts` | `importBundle()` (writes + `import_jobs` row) and `previewBundle()` |
| `src/lib/server/import/export.ts` | `exportJumper()`, `exportLogbookCsv()`, `exportDropzone()` |
| `src/lib/server/import/web.ts`, `export-web.ts` | Route glue: staging uploads, permissions, downloads |
| `src/lib/server/import/federation/` | OAuth server (global), client + outbox push (dropzone), crypto |
| `src/lib/server/domain/federation.ts` | Outbox queueing used by `completeLoad()` |

## Pages

| Route | Who | |
|---|---|---|
| `/app/import` | every user | Personal logbook import: Jump Master connector, bundle/Jump Master JSON, CSV with column mapping. Choose source → preview → confirm → result → history. |
| `/app/import/template.csv` | every user | Downloadable CSV template |
| `/app/settings/import` | `dz.settings` on the active DZ | Dropzone import (bundle / Jump Master dropzone docs / connector as the DZ owner), same steps |
| `/app/export` | every user (+ DZ section for `dz.settings`) | `me.json` (bundle), `logbook.csv`, `dropzone.json` |
| `/app/settings/federation` | DZ owners/admins, super admins | Global mode: register instances, rotate secrets, suspend/revoke. Dropzone mode: connect to global, test, outbox stats, *Sync now* |
| `/app/settings/linked-accounts` | every user | Dropzone mode: *Link global account* / unlink. Global mode: linked dropzones with sync stats, unlink |

Between **preview** and **confirm** the parsed bundle is stored as a private `files` row
(purpose `import`, owner = the user) through the `Storage` interface and deleted after the import or
on *Cancel*. Stale staged uploads (> 24 h) are pruned when the user opens the import page.

Uploads are capped at 10 MB (`MAX_UPLOAD_BYTES`). On the Bun target adapter-node also enforces
`BODY_SIZE_LIMIT` (default 512 KB) — set e.g. `BODY_SIZE_LIMIT=12M` for large dropzone files.

## The bundle (`format: "slot-bundle"`, `version: 1`)

```jsonc
{
  "format": "slot-bundle",
  "version": 1,
  "source": { "system": "slot" | "jumpmaster" | "csv", "origin": "https://…", "exportedAt": "2026-11-11T20:48:34Z" },
  "people":   [BPerson],          // everyone referenced anywhere, once
  "jumper":   { "person": "<ref>", "jumps": [BJump], "rigs": [BRig], "wallets": [BWallet] } | null,
  "dropzone": BDropzone | null    // settings, prices, aircraft, staff, rigs, teams, bookingSlots,
                                  // tandems, indemnitySections, loads[ slots[] ], wallets
}
```

Full field list: the `B*` types in `src/lib/import/bundle.ts`. Conventions:

* **`ref`** on every entity is a stable source reference used for idempotency: `jm:<firestore path>`
  for Jump Master data, `slot:<table>/<uuid>` for native rows exported from an instance, and
  `csv:<jump#>:<date>` (or a row hash) for CSV rows. Imported rows keep their original `ref` in
  `source_ref` (or get a deterministic UUID derived from it for tables without that column), so
  importing the same file twice **updates** rows and never duplicates them — also across
  export → import round trips between instances.
* **People** are referenced by `ref` everywhere else (`staff.person`, `slots.person`, …).
* **Money**: integer minor units (`*Minor`) in the dropzone currency. Jump Master stores wallet and
  ledger amounts in cents and price list / slot / tandem amounts in major units; the mapper
  converts (×100).
* **Dates**: calendar dates are `YYYY-MM-DD` (instants are converted in the dropzone's timezone,
  or the browser's for personal imports); instants are ISO-8601 strings.
* Limits (`BUNDLE_LIMITS`): 20 000 people, 50 000 jumps, 50 000 loads, 400 000 slots, 20 000 of
  anything else. `parseBundle()` validates and normalises every field and throws `BundleError`
  with a user-facing message.

Upload also accepts the **raw Jump Master JSON** (`format: "jumpmaster-docs"`) — the original's
documents as the connector fetches them (`user`, `jumps`, `gear`, `jumperAccounts`,
`ledgerEntries`, `dropzone` + its sub-lists `planes, pricelist, load, slot, tandems,
bookingSlots, teams, indemnityQuestions, indemnityForms, dzgear`, and referenced `users`), field
names as in the original app's record field names (see `src/lib/import/jumpmaster/map.ts`). It is mapped server-side with the same
mapper.

## Applying (`importBundle`)

Each run writes an `import_jobs` row: `running` → `succeeded` / `failed`, per-entity `counts`, and
up to 200 warnings in `log`. The importer never throws for bad data.

**Personal import** (`mode: 'jumper'`): only touches the importing user — logbook jumps
(`source='import'`, numbered after the existing logbook when the file has no numbers; a location
matching a dropzone name links the jump to it), personal rigs, ratings, and *blank* profile fields
(never overwrites what the user typed). Wallet balances are **not** taken from a personal file.

**Dropzone import** (`mode: 'dropzone'`, requires `dz.settings`):

* People are matched by `source_ref`, then **email**. Unknown people become **placeholder
  profiles** (no password, email `import-…@placeholder.invalid` when none is known); they claim
  the account with *Forgot password* once a real email is set, or are matched by email when they
  later import their own logbook.
* The source owner maps to the importing user; owner/admin roles from a file are only ever given
  to the importing user.
* Settings, prices (via `setPrices`), aircraft, staff roles, DZ rigs, teams, booking slots,
  tandem passengers, waiver sections, followers.
* Loads and slots are written as history: no wallet holds, charges or notifications. A load whose
  day + number is already taken by a native load is skipped with a warning. Past loads that were
  never completed are imported as cancelled.
* Wallet **opening balances** are applied once (`topUp` / `adjust` with a dedupe reason), only in
  the dropzone's currency.

**Preview** (`previewBundle`) returns counts, how many jumps are already imported (personal) or
how many people are new (dropzone), samples (first jumps, people, latest loads) and warnings
(e.g. currency mismatch).

## CSV logbook

`/app/import/template.csv`: `Jump #, Date, Dropzone, Aircraft, Altitude (ft), Freefall (s), Jump type, Description`.
Comma, semicolon and tab files work; the header is detected and columns auto-mapped by name
(English synonyms such as *No., DZ, Plane, Exit alt, FF, Discipline, Notes*). In the browser the
upload card shows a mapping grid (field → column), a *first row is a header* toggle and a date
order (auto, `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`) with a live count of readable rows; without
JS the server applies the auto-mapping. Bad rows are reported as warnings, not fatal. CSV exports
neutralise spreadsheet formula injection.

Optional *Signed by* / *Signer licence* columns (also *Signer*, *Sign-off by*, *Signer's licence no.*)
are kept on the jump as a **previous sign-off**: shown on the jump page and the printout as
imported, never counted as signed (no `signed_at`). Changing the jump's facts clears it, like a real
signature. Both logbook downloads (`/app/logbook/export.csv` and `/app/export/logbook.csv`) are the
same file (`logbookCsv`), and it reads back in with every column matched.

## Jump Master connector

*Connect Jump Master account* runs entirely in the browser (`src/lib/import/jumpmaster/client.ts`):

1. Firebase Auth REST `accounts:signInWithPassword` with the user's own email/password.
2. Firestore REST: the user's document and sub-collections (paged `documents` list), or — on the
   dropzone page — `runQuery` for dropzones whose `owner` is the user, then the dropzone's
   sub-lists and a `batchGet` of referenced user documents.
3. `mapJumpMasterDocs()` converts to a bundle (with mapping warnings) and the bundle is POSTed to
   the page's `?/upload` action like a file → preview.

The password goes **only** to the Firebase Auth endpoint: the inputs have no `name`, the form is
JS-only, and nothing is stored. Configuration (the original's public web config) comes from env:

| Env | |
|---|---|
| `JUMPMASTER_FIREBASE_PROJECT_ID`, `JUMPMASTER_FIREBASE_API_KEY` | Optional. Unset → read automatically from the original app's public web build (`main.dart.js`, cached 7 days; `JUMPMASTER_AUTODISCOVER=off` disables). If neither works the card says the connector is unavailable and points to upload |
| `JUMPMASTER_AUTH_BASE_URL`, `JUMPMASTER_FIRESTORE_BASE_URL` | Override the Google endpoints — **local mock only** |

The connector has only been exercised against the local mock
(`src/lib/server/import/mock-jumpmaster.ts`, same REST shapes and a security-rules imitation):

```sh
PORT=4425 bun scripts/mock-jumpmaster.ts
JUMPMASTER_FIREBASE_PROJECT_ID=mock-project JUMPMASTER_FIREBASE_API_KEY=mock-key \
JUMPMASTER_AUTH_BASE_URL=http://localhost:4425 JUMPMASTER_FIRESTORE_BASE_URL=http://localhost:4425 bun run dev
# jumper: jo.jumper@example.com / jm-secret-1   DZ owner: owner@jm-only.example / jm-secret-2
```

Untested against the real service: CORS from our origin, Firestore security rules (e.g. whether an
owner may read referenced user docs), App Check, and real-world field variants.

## Export

* `/app/export/me.json` — the user's bundle: profile + ratings, all logbook jumps (imported jumps
  keep their original `ref`), personal rigs. Wallets are not exported for personal bundles.
* `/app/export/logbook.csv` — one row per jump incl. signer and verified flag.
* `/app/export/dropzone.json` — the active dropzone (requires `dz.settings`): settings, prices,
  aircraft, staff, rigs, teams, booking slots, tandems, waiver sections, loads + slots, members and
  wallet balances. Contains personal data.

Importing these on another instance reproduces the data (round trip covered by tests).

## Tests

* `src/lib/server/import/mapping.test.ts`, `import.test.ts` — mapper, CSV, importer (idempotency,
  placeholders, permissions, wallets), export round trips, connector against the mock (incl. a check
  that the password is only ever sent to the auth endpoint).
* `src/lib/server/import/federation/federation.test.ts` — OAuth (PKCE, single-use codes, refresh
  rotation, revocation), linking, load completion → outbox → signed push → global logbook,
  idempotency, bad signatures, backoff, unlink.
* `e2e/import.spec.ts` — CSV import + export through the browser.
