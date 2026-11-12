# Log-Book

Run the dropzone. Log every jump. Free, open-source (AGPL-3.0) dropzone management + jumper logbook for skydiving. Hosted at [log-book.app](https://log-book.app) or self-hosted with Docker.

SvelteKit 3 · Svelte 5 · Tailwind v4 · Drizzle/SQLite.
One codebase, two targets:

* **Hosted (global)** — Cloudflare Workers + D1 (`DEPLOY_TARGET=cloudflare`)
* **Self-hosted (dropzone)** — Bun + SQLite file in Docker (`DEPLOY_TARGET=bun`, default)

Brand name lives in one place: `src/lib/brand.ts`. Design and federation plan: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Install (self-hosted dropzone)

No source needed: a prebuilt multi-arch image (`linux/amd64`, `linux/arm64` for Raspberry Pi 4/5 on a
64-bit OS) is published as `ghcr.io/marthinusbosman/log-book`. With Docker + the Compose plugin:

```sh
curl -fsSL https://log-book.app/install.sh | bash
```

The installer ([scripts/install.sh](scripts/install.sh)) creates `./log-book`, asks how people reach
the server and its hostname, generates the secrets, writes `.env`, runs `docker compose up -d` and
prints the URL. Manual install takes three steps: download `docker-compose.yml`, `.env.example` and
`deploy/Caddyfile.*`, edit `.env`, then `docker compose up -d`
([guide](docs/SELF_HOSTING.md#manual-install-3-steps)). Update with
`docker compose pull && docker compose up -d` after a backup (migrations run on start). Pin a
release with `LOG_BOOK_VERSION=0.1.0` in `.env`.

Front ends (one at a time; the installer sets `COMPOSE_PROFILES` in `.env`):

| | Profile | Guide |
|---|---|---|
| Own domain + Let's Encrypt | `https` | [Custom domain](docs/SELF_HOSTING.md#custom-domain-public-internet) |
| Cloudflare Tunnel (no static IP / CGNAT) | `tunnel` | [Tunnel](docs/SELF_HOSTING.md#b-no-static-ip-or-behind-cgnat-cloudflare-tunnel) |
| Dropzone WiFi only, HTTPS (local CA) | `lan` | [Local-only](docs/SELF_HOSTING.md#local-only-dropzone-wifi-no-domain) |
| Dropzone WiFi only, plain HTTP | `lan-http` | [Local-only](docs/SELF_HOSTING.md#local-only-dropzone-wifi-no-domain) |

Payments: pay-at-manifest, staff wallet top-ups and wallet payments work today; PayFast/Stripe
credentials can be saved but online checkout is not live yet
([Payments](docs/SELF_HOSTING.md#payments)). Backups, hangar TV, linking jumper accounts and every
env var: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md). Hosted instance on Cloudflare (free plan,
no R2): [docs/DEPLOY.md](docs/DEPLOY.md).

## Requirements

* [Bun](https://bun.sh) ≥ 1.4 (everything runs through bun)
* Node ≥ 20 on PATH (used by wrangler / Playwright)

## Quickstart — self-hosted target (Bun + SQLite)

```sh
bun install
bun run dev            # http://localhost:5173 — runs Vite under the Bun runtime (needs bun:sqlite)
```

The SQLite file is created at `data/app.db` and migrations in `drizzle/` are applied on startup.
Sign up at `/signup`, then create a dropzone from the switcher.

Production build + run:

```sh
bun run build:bun
PORT=3000 ORIGIN=http://localhost:3000 bun run start     # bun build/server.js (sets BODY_SIZE_LIMIT=12M)
```

Docker from this checkout: uncomment `build:` in `docker-compose.yml`, then

```sh
docker compose up -d --build       # http://localhost:3000, data in the `slot-data` volume
```

Set `ORIGIN` to the public URL (CSRF protection rejects form posts from other origins). Behind a TLS
reverse proxy set the `*_HEADER` vars (docs/SELF_HOSTING.md).

## Quickstart — Cloudflare target (Workers + D1)

Local only — nothing here creates remote resources:

```sh
bun run db:migrate:d1:local        # apply drizzle/ migrations to the local D1 in .wrangler/
bun run dev:cf                     # Vite dev with Miniflare bindings (local D1)
bun run preview:cf                 # build:cf + local migrations + wrangler dev → http://localhost:8787
```

Deploy: `bash scripts/deploy-cf.sh` (dry run) / `--yes` (migrate D1 + `wrangler deploy`) — see
[docs/DEPLOY.md](docs/DEPLOY.md) for secrets and the cron trigger.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `dev:cf` | dev server for the Bun / Cloudflare target |
| `build:bun` / `build:cf` | production build per target (`build` = bun); post-build steps write `build/server.js` / wrap the Worker with `scheduled()` |
| `start` | run the Bun build (`bun build/server.js`) |
| `deploy:cf` | `scripts/deploy-cf.sh` — dry run unless `--yes` |
| `check` | `svelte-kit sync` + `svelte-check` |
| `test` | unit tests (`bun test`: password hashing, sessions, reset tokens — against in-memory SQLite with the real migrations) |
| `test:e2e` | Playwright smoke: builds the Bun target, signup → dashboard → logout → login (desktop + mobile) |
| `db:generate` | generate a migration from `src/lib/server/db/schema.ts` |
| `db:migrate:d1:local` / `:remote` | apply migrations to D1 |
| `scripts/smoke.sh` | curl end-to-end smoke against a running server (`BASE=http://localhost:4317`) |
| `scripts/backup.ts` | consistent SQLite snapshot (`VACUUM INTO`), see docs/SELF_HOSTING.md |
| `scripts/install.sh` | self-host installer, served by the site at `/install.sh` (`src/routes/install.sh/+server.ts`) |
| `scripts/docker-smoke.sh` | start an image, wait for its HEALTHCHECK, signup/login/CSRF/backup checks (CI) |

## Environment

See `.env.example`. Runtime vars are declared in `src/env.ts` (SvelteKit 3 `defineEnvVars`) and
read from `$app/env/private`.

| Var | Default | Notes |
|---|---|---|
| `DEPLOY_TARGET` | `bun` | build-time only |
| `INSTANCE_MODE` | `global` on CF, `dropzone` on Bun | federation role |
| `APP_ORIGIN` | request origin | used for email links |
| `SECRETS_KEY` | insecure dev key | **set in production** (encrypts payment-provider secrets) |
| `STORAGE_DRIVER` | `disk` on Bun, `db` on CF | `disk` \| `db` (files in the database) \| `r2` |
| `DATABASE_PATH` | `data/app.db` | Bun target |
| `UPLOADS_DIR` | `data/uploads` | Bun target, `STORAGE_DRIVER=disk` |
| `MIGRATIONS_DIR` | `drizzle` | Bun target |
| `CRON_SECRET` | — | bearer for `POST /api/cron` from outside |
| `ORIGIN`, `PORT`, `*_HEADER` | — | adapter-node runtime |

Full reference: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md#environment-reference), Cloudflare secrets: [docs/DEPLOY.md](docs/DEPLOY.md).

## Layout

```
src/
  env.ts                    runtime env var declarations
  hooks.server.ts           db → session → theme → security headers
  lib/brand.ts              product name/tagline (single source)
  lib/nav.ts                staff + jumper navigation
  lib/ui/                   design-system primitives
  lib/components/           app-level components (Logo, ThemeToggle, DropzoneSwitcher)
  lib/server/db/            schema, driver selection (D1 / bun:sqlite)
  lib/server/auth/          password hashing, sessions, users, reset tokens
  lib/server/email/         Mailer interface (console in dev)
  lib/server/dropzones/     memberships, roles
  routes/                   /, (auth)/login|signup|logout|forgot-password|reset-password, /app/**
drizzle/                    SQL migrations (shared by D1 and bun:sqlite)
e2e/                        Playwright tests
```

## CI and releases

* `.github/workflows/ci.yml` (every push / PR): `check`, `test`, `build:bun`, `build:cf`, shellcheck,
  Docker build + `scripts/docker-smoke.sh`, Playwright (chromium) in its own job.
* `.github/workflows/docker.yml` (tags `v*`, or run by hand): builds `linux/amd64` + `linux/arm64`,
  smoke-tests amd64, pushes `ghcr.io/marthinusbosman/log-book` tagged `X.Y.Z`, `X.Y`, `X` (from 1.0),
  `latest` (stable tags only) and `sha-<commit>`.

Release: bump `version` in `package.json`, commit, `git tag v0.1.0 && git push origin v0.1.0`.

## Licence

[GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`). If you run a
modified version for other people, AGPL §13 requires offering them your source: set `sourceUrl` in
`src/lib/brand.ts` (shown as "Source code" in the site and login footers).
