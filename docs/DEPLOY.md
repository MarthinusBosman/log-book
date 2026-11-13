# Deploying the hosted instance (Cloudflare Workers + D1)

Uploaded files (avatars, logos, DZ photos, signatures, staged imports) live in **R2** bucket
`log-book-files` (binding `FILES`, `STORAGE_DRIVER=r2`). Files stored in D1 before the switch
(`file_blobs`, the old `db` driver) are still read from there; `STORAGE_DRIVER=db` keeps everything
in D1 if R2 is ever unavailable. Waiver/tandem PDFs are not stored at all (rendered on demand).

Config lives in `wrangler.jsonc`:

| Setting | Value |
|---|---|
| Worker | `dzapp-preview` → `https://dzapp-preview.<account-subdomain>.workers.dev` |
| D1 binding `DB` | `dzapp-preview` (`e3434e08-d6bf-4804-b912-ea742fd4aeb8`), migrations from `drizzle/` |
| vars | `INSTANCE_MODE=global`, `STORAGE_DRIVER=r2` |
| R2 binding `FILES` | bucket `log-book-files` |
| cron trigger | `17 * * * *` → `scheduled()` → in-process `POST /api/cron` |

## One-time setup

```sh
bunx wrangler login                       # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
bunx wrangler secret put SECRETS_KEY      # paste: openssl rand -base64 48  (keep a copy — see below)
```

The D1 database already exists. For another environment: `bunx wrangler d1 create <name>` and put
the id into `wrangler.jsonc`.

## Deploy

```sh
bash scripts/deploy-cf.sh          # DRY RUN (default): check + build + `wrangler deploy --dry-run`; nothing remote
bash scripts/deploy-cf.sh --yes    # check + build + `wrangler d1 migrations apply DB --remote` + `wrangler deploy`
```

Flags: `--skip-build`, `--skip-migrate` (code-only). Equivalent manual steps:

```sh
bun run build:cf                                   # vite build + scripts/cf-postbuild.ts (adds scheduled())
bunx wrangler d1 migrations apply DB --remote
bunx wrangler deploy
curl -s https://dzapp-preview.<subdomain>.workers.dev/api/health   # {"ok":true,"version":"…","db":{"ok":true}}
```

Migrations are additive SQL from `drizzle/`; always apply them **before** `wrangler deploy`.

## Secrets and variables

Set secrets with `bunx wrangler secret put <NAME>` (locally: `.dev.vars`, see `.dev.vars.example`).
Plain values go in `vars` in `wrangler.jsonc`.

| Name | Kind | Needed | Notes |
|---|---|---|---|
| `SECRETS_KEY` | secret | **yes** | Encrypts stored payment-provider credentials (PayFast). Unset = insecure built-in dev key. Changing it makes saved credentials unreadable. |
| `APP_ORIGIN` | var | no | Canonical public URL for emails/OAuth links. Unset = taken from each request (fine on workers.dev). Set it when a custom domain is attached. |
| `INSTANCE_MODE` | var | set | `global` (identity provider for self-hosted dropzones). |
| `STORAGE_DRIVER` | var | set | `r2` (bucket via the `FILES` binding, reads legacy D1 blobs as fallback) or `db` (D1 only). |
| `CRON_SECRET` | secret | no | Only to call `POST /api/cron` from outside; the cron trigger needs nothing. |
| `JUMPMASTER_FIREBASE_PROJECT_ID`, `JUMPMASTER_FIREBASE_API_KEY` | var | no | Optional overrides; the Jump Master connector discovers them automatically (docs/IMPORT.md). |
| `FEDERATION_*` | — | no | Dropzone-instance side only; not used by the global instance. |

## Custom domain (hosted)

The worker runs on `workers.dev` until a custom domain is attached. To serve it on e.g.
`log-book.app` (domain must be a zone on the same Cloudflare account):

1. Add to `wrangler.jsonc`: `"routes": [{ "pattern": "log-book.app", "custom_domain": true }]`
   (Cloudflare creates the DNS record and certificate on deploy), or attach it in the dashboard
   under Workers → `dzapp-preview` → Settings → Domains & Routes.
2. Set `APP_ORIGIN` in `vars` to `https://log-book.app` so links in emails and OAuth redirect URIs
   use the canonical name.
3. Keep the `workers.dev` URL enabled for self-hosted dropzones that already linked jumpers:
   their links are stored against the global URL they registered with (`linked_accounts.issuer` =
   `FEDERATION_GLOBAL_URL`). Changing `FEDERATION_GLOBAL_URL` on a dropzone orphans those links
   (queued jumps of unmatched users are dropped on the next flush) and jumpers must link again.
   Migrating issuers is not built.

Not done yet: no custom domain is attached today, and `*.log-book.app` subdomains for self-hosted
dropzones are not offered (docs/SELF_HOSTING.md → Custom domain).

## Payments (hosted)

Same state as self-hosted (docs/SELF_HOSTING.md → Payments): pay-at-manifest, staff wallet
top-ups and wallet payments work; PayFast/Stripe are stubs that store credentials (encrypted with
`SECRETS_KEY`) and make no network calls. Each dropzone is its own merchant: it enters its own
PayFast merchant ID/key/passphrase under Settings → Payments, and money settles directly to the
dropzone. Live checkout + webhooks (PayFast ITN, Stripe) are planned; when they land, the webhook
URLs will be on `APP_ORIGIN`.

## Scheduled work

adapter-cloudflare only emits a `fetch` handler, so `scripts/cf-postbuild.ts` wraps
`.svelte-kit/cloudflare/_worker.js`: the wrapper's `scheduled()` mints a random per-invocation
token on `globalThis` and calls the app's own fetch handler with `POST /api/cron`
(header `x-dz-cron-token`) — no network hop, no secret. `/api/cron` runs:

* deletion of expired sessions and old password-reset tokens,
* deletion of orphaned `file_blobs` (bytes stored but metadata insert failed) older than 1 h,
* storage sweep: staged import uploads older than a day, legacy stored waiver/tandem PDFs (record
  hash sealed first), signature images older than a day that no logbook jump or waiver references
  (≤ 100 per run) and R2 objects no `files` row references (older than 1 h, ≤ 2000 per run),
* a federation outbox flush on dropzone instances (no-op on the global instance).

Account deletion (`/app/profile/delete`) removes the user's avatar and the sign-off images on their
own jumps immediately (objects only when no other `files` row shares the key); waiver signatures
and sign-offs they gave on others' jumps are kept. An object whose delete fails is picked up by
the orphan-object sweep above.

Test locally: `wrangler dev --test-scheduled`, then `curl -X POST "localhost:8788/__scheduled?cron=17+*+*+*+*"`.
The opportunistic outbox flush after mutating `/app` requests still runs as before.

## Limits worth knowing (free plan)

* Worker bundle ≈ 0.7 MB gzip (limit 3 MB). D1: 5 GB total storage, 500 MB per database on free.
  R2 free tier: 10 GB. Uploads are re-encoded in the browser and content-addressed (identical files
  stored once). Measured per object: avatar ≈ 5 KB (256 px WebP), logo ≈ 8–15 KB (512 px PNG),
  DZ photo ≈ 110 KB (1600 px WebP), signature ≈ 6 KB (trimmed PNG), waiver/tandem PDF 0 B stored
  (rendered on demand, ≈ 7–14 KB). No-JS uploads: avatar ≤ 1.5 MB, logo ≤ 1 MB, photo ≤ 3 MB,
  metadata stripped server-side.
* Workers CPU time is 10 ms per request on free; PBKDF2 is capped at 100k iterations for this
  reason. PDF generation (pdf-lib) on large waivers is the heaviest path — watch the dashboard.

## Local verification (no remote calls)

```sh
bun run build:cf
CI=true bunx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e-state
CI=true bunx wrangler dev --port 8788 --persist-to .wrangler/e2e-state --test-scheduled \
  --var SECRETS_KEY:local-dev-secrets-key
BASE=http://localhost:8788 bash scripts/smoke.sh
CI=true bunx wrangler d1 execute DB --local --persist-to .wrangler/e2e-state \
  --command "select key, part, length(bytes) from file_blobs"
```

## Domains: log-book.app (primary) and log-book.io

`log-book.app` is the canonical host; `log-book.io` (and any `www.` variant) must **301 to
`https://log-book.app` with the same path and query**. The app does this itself when
`CANONICAL_HOST=log-book.app` is set (`src/lib/server/canonical.ts`, first hook in
`hooks.server.ts`): hosts sharing the name (`log-book.io`, `www.log-book.app`) redirect
(301 for GET/HEAD, 308 otherwise); `*.workers.dev`, localhost and unrelated domains are never
redirected. Unset = no redirect. Attach both domains as custom domains of the worker, set
`CANONICAL_HOST` (plain var) and `APP_ORIGIN=https://log-book.app`.
