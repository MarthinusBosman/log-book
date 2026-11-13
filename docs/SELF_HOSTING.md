# Self-hosting a dropzone instance

One container: SvelteKit (adapter-node output) on Bun, a SQLite file and an uploads folder on the
`/data` volume. Migrations run automatically on startup. An optional second container (Caddy or
cloudflared) gives it a proper address.

Written for a dropzone owner plus one "tech friend": someone comfortable with a terminal, a router
admin page and DNS settings. South African examples first.

**Contents:** [Install](#install) · [Choose how people reach it](#choose-how-people-reach-it) ·
[Payments](#payments) · [Custom domain (internet)](#custom-domain-public-internet) ·
[Local-only (dropzone WiFi)](#local-only-dropzone-wifi-no-domain) ·
[Linked accounts, phones and offline](#linked-accounts-phones-and-offline) ·
[Hangar TV](#hangar-display-tv) · [Environment](#environment-reference) · [Backups](#backups) ·
[Updating](#updating) · [Licence](#licence)

## Install

You don't need the source code. Log-Book ships as a prebuilt image,
`ghcr.io/marthinusbosman/log-book`, for `linux/amd64` (any PC, NAS or VPS) and `linux/arm64`
(Raspberry Pi 4/5, ARM mini PCs). You need Docker with the Compose plugin
(`docker compose version`). On Debian, Ubuntu or Raspberry Pi OS: `curl -fsSL https://get.docker.com | sh`.

### One-line installer

```sh
curl -fsSL https://log-book.app/install.sh | bash
```

The script creates `./log-book` (set `LOG_BOOK_DIR` to change it) and asks how people will reach the
server: public domain, Cloudflare Tunnel, LAN with HTTPS, or LAN with plain HTTP. It asks for the
hostname, generates `SECRETS_KEY` and `CRON_SECRET`, writes `.env` and runs `docker compose up -d`.
At the end it prints the URL and first-login steps. Running it again refreshes the compose and Caddy
files and restarts. It keeps your `.env` and never replaces secrets in it. To read it first:
`curl -fsSL https://log-book.app/install.sh -o install.sh && less install.sh && bash install.sh`.
The site serves `scripts/install.sh` from this repository unchanged. Without a terminal (provisioning
scripts), pass the answers as variables, e.g. `LOG_BOOK_MODE=lan-http`. The full list is at the top
of the script.

### Manual install (3 steps)

```sh
mkdir log-book && cd log-book
RAW=https://raw.githubusercontent.com/MarthinusBosman/log-book/main
# 1. download the compose file, the env template and the Caddy front-end configs
curl -fsSLO $RAW/docker-compose.yml && curl -fsSL $RAW/.env.example -o .env
mkdir -p deploy && for f in Caddyfile.public Caddyfile.lan Caddyfile.lan-http; do curl -fsSL $RAW/deploy/$f -o deploy/$f; done
# 2. edit .env: ORIGIN (the URL people type), SECRETS_KEY (openssl rand -hex 32), and
#    COMPOSE_PROFILES=https|tunnel|lan|lan-http for a front end (see below)
nano .env
# 3. start
docker compose up -d        # pulls the image, serves http://localhost:3000 (+ the front end)
```

Then open the URL and sign up. Whoever creates the dropzone (switcher → **New dropzone**) becomes
its owner.

**Developers** building from a checkout: uncomment `build:` in `docker-compose.yml` and run
`docker compose up -d --build`, or `docker build -t log-book .` and set `LOG_BOOK_IMAGE=log-book`
plus `LOG_BOOK_VERSION=latest` in `.env`.

Without Docker (Bun ≥ 1.4):

```sh
bun install && bun run build:bun
ORIGIN=https://manifest.example.com SECRETS_KEY=… bun build/server.js   # PORT defaults to 3000
```

Use `build/server.js`, not `build/index.js`: it sets `BODY_SIZE_LIMIT=12M` (adapter-node's 512K
default rejects photo uploads, PDFs and logbook imports) and treats empty env vars as unset.

**Hardware.** Any 64-bit machine that runs Docker: a second-hand mini PC, a NAS with Docker
support, or a Raspberry Pi 4/5 (4 GB RAM is plenty; boot from an SSD rather than an SD card if you
can). **Raspberry Pi:** install the **64-bit** Raspberry Pi OS (or another arm64 Linux). Docker
picks the `arm64` image by itself. There is no 32-bit ARM (`armv7`) image, so 32-bit Raspberry Pi OS
and the Pi 2/Zero/Zero W don't work (`uname -m` must say `aarch64`). Put it on a UPS together with the router: losing power mid-write is the most
common way to damage a database on cheap hardware.

## Choose how people reach it

| Mode | Who can open it | You need | Compose profile |
|---|---|---|---|
| **Public, own domain** | anyone, anywhere | a domain (`manifest.mydz.co.za`), a public IP, ports 80/443 forwarded | `--profile https` |
| **Public via Cloudflare Tunnel** | anyone, anywhere | a domain on Cloudflare (free plan). No static IP needed, works behind CGNAT | `--profile tunnel` |
| **LAN with HTTPS** | devices on the dropzone WiFi | nothing to buy; install a certificate once per staff device | `--profile lan` |
| **LAN, plain HTTP** | devices on the dropzone WiFi | nothing; trusted WiFi only | `--profile lan-http` |

Use one front end at a time. The installer writes it to `.env` as `COMPOSE_PROFILES=<name>`, so
plain `docker compose up -d` / `pull` include it. Without that line, pass `--profile <name>` on every
command.

You need a **public** address (first two rows) for:

* online tandem bookings from the dropzone's website (`/dz/<slug>/book`),
* jumpers using the app from home or on mobile data,
* online card payments once they ship ([Payments](#payments)): PayFast/Stripe must be able to reach
  the server to confirm payments.

Manifest, check-in, waivers, pay-at-manifest, wallets and the hangar display work on a LAN-only
server.

## Payments

### How money flows

**The dropzone is the merchant.** Money goes from the jumper or tandem customer to the dropzone's
own PayFast or Stripe account and settles into the dropzone's bank account. Log-Book never holds
your money and takes no cut on a self-hosted server. You sign the merchant agreement with PayFast
or Stripe yourself and pay their fees.

### What works today

Online card payments are **not live yet**. The PayFast and Stripe integrations are stubs: you can
save credentials, but the app makes no calls to either service and never offers them at checkout.
What does work:

| Today | Where |
|---|---|
| **Pay at manifest**: staff mark slots paid by cash, card machine or EFT | Manifest → open a load → select slots → **Mark paid** |
| **Wallet top-ups by staff**: jumper pays at the desk, staff credit the wallet | Jumpers → pick the jumper → **Add funds** (cash, card or EFT) |
| **Jumpers pay slots from their wallet** | Settings → Features → **Jumper wallet** (optionally **Allow negative balance**) |
| **Tandem bookings without online payment**: customers book and pay at check-in | Settings → Features → **Allow tandems to pay at manifest**, or leave **In-app payments** off |
| **Staff pay into wallets** | Settings → Features → **Pay staff into their wallet** |

Card machines (SnapScan, Yoco, a bank speedpoint) stay separate: take the payment on the machine,
then mark the slot paid as "card".

A jumper can also press **Add funds → Pay at manifest** in their own wallet. That only records a
pending request the jumper sees (and can cancel). Confirming those requests from the staff side
isn't built yet (**planned**); staff use **Add funds** on the jumper's page instead.

### Before you save any credentials

Set `SECRETS_KEY` in `.env` (`openssl rand -base64 48`) and restart. It encrypts the PayFast
merchant key and passphrase in the database. Keep a copy with your backups: if you lose or change
it, saved credentials can't be decrypted and you have to re-enter them. Settings → Payments shows a
warning while the built-in development key is in use.

### PayFast (South Africa)

1. Sign up for a merchant account at [payfast.io](https://payfast.io) in the dropzone's (business)
   name and complete their verification (ID, bank account, business documents).
2. For testing, register a separate sandbox account at
   [sandbox.payfast.co.za](https://sandbox.payfast.co.za). It has its own merchant ID and key.
3. In the PayFast dashboard, find **Merchant ID** and **Merchant Key** (Settings → Developer
   Settings, or Account → Personal Information). Set a **Salt Passphrase** on the settings page.
4. In Log-Book open **Settings → Payments → PayFast** and enter:
   * Merchant ID (digits only), Merchant key, Passphrase (the same one you set at PayFast),
   * **Test mode** on for sandbox credentials, off for live ones.

   Press **Connect PayFast**. The card shows "Connected"; key and passphrase are stored encrypted
   and shown masked.
5. *Coming soon*: once the payments module ships, switching on **Settings → Features → In-app
   payments** will offer PayFast to jumpers (wallet top-ups) and tandem customers. PayFast confirms
   each payment by calling your server (ITN), so the server will need a public address (own domain
   or Cloudflare Tunnel). Until then nothing is charged and customers see no change.

### Stripe (outside South Africa)

Stripe lists South Africa under its "extended network" (served through partners), so for a South
African dropzone PayFast is the practical choice. Elsewhere:

1. Create a Stripe account for the dropzone at [stripe.com](https://stripe.com) and finish
   verification. Stripe has a test mode built into its dashboard.
2. In **Settings → Payments → Stripe** choose country and currency and save. The form also takes a
   connected account ID (`acct_…`); the status row (Onboarded / Payments / Payouts) is meant to be
   updated by Stripe webhooks, which don't exist yet.
3. *Planned*: connecting your Stripe account from this page, and card checkout. How a self-hosted
   server connects to Stripe isn't final, so don't sign anything with Stripe just for Log-Book
   yet. Payouts will go to the dropzone's own Stripe balance and bank account.

## Custom domain (public internet)

### (a) Your own domain, e.g. `manifest.mydz.co.za`

You need a public IP on the router (see CGNAT below) and access to its port-forwarding page.

1. **Domain.** Register one (a `.co.za` costs roughly R50–R150 a year at most registrars) or use the
   dropzone's existing website domain and add a subdomain such as `manifest`.
2. **DNS.** In the registrar's DNS settings add a record for `manifest`:
   * `A` → your public IPv4 address (whatismyip.com, opened from the dropzone), and/or
   * `AAAA` → the server's public IPv6 address, if your ISP provides IPv6,
   * or `CNAME` → a dynamic-DNS name (DuckDNS, the router's DDNS) if the public IP changes.
3. **Router.** Give the server a fixed LAN IP ([below](#1-fixed-lan-address)), then forward TCP 80
   and TCP 443 (optionally UDP 443) to it.
4. **`.env`:**

   ```sh
   DOMAIN=manifest.mydz.co.za
   ORIGIN=https://manifest.mydz.co.za
   PROTOCOL_HEADER=x-forwarded-proto
   HOST_HEADER=x-forwarded-host
   ADDRESS_HEADER=x-forwarded-for
   XFF_DEPTH=1
   APP_BIND=127.0.0.1          # optional: hide port 3000 from the network
   SECRETS_KEY=…
   ```

5. `docker compose --profile https up -d`. Caddy (`deploy/Caddyfile.public`) gets a Let's
   Encrypt certificate and renews it on its own. Check `https://manifest.mydz.co.za/api/health`.

`ORIGIN` must be exactly the URL people use; form posts from other addresses are rejected (403).
If HTTPS doesn't come up, `docker compose logs caddy` usually says why (DNS not pointing here yet,
port 80 blocked).

**Your own proxy instead** (nginx, Traefik, Caddy on the host): forward to `127.0.0.1:3000`, set
the same `ORIGIN`/`*_HEADER` vars, allow request bodies ≥ 12 MB (nginx:
`client_max_body_size 12m;`) and pass the `Host` header.

### (b) No static IP, or behind CGNAT: Cloudflare Tunnel

Many fibre and practically all LTE/5G connections in South Africa are behind CGNAT: there is no
public IP to forward ports to. Check: if the WAN IP on the router's status page differs from what
whatismyip.com shows, or starts with `100.64.`–`100.127.`, you're behind CGNAT. A tunnel connects
outwards from the server, so no ports need opening.

1. Create a free Cloudflare account and add your domain. Cloudflare becomes its DNS: you change the
   nameservers at your registrar (minutes to a day). You still buy the domain from a registrar.
2. In the Cloudflare dashboard open **Zero Trust → Networks → Tunnels → Create a tunnel →
   Cloudflared**. (Cloudflare asks for a card when you first activate Zero Trust, even on the free
   plan.) Name it and copy the token from the install command it shows (the long string after
   `--token`).
3. Add a **public hostname**: subdomain `manifest`, domain `mydz.co.za`, service type `HTTP`,
   URL `app:3000`.
4. `.env`:

   ```sh
   TUNNEL_TOKEN=eyJ…
   ORIGIN=https://manifest.mydz.co.za
   ADDRESS_HEADER=cf-connecting-ip
   APP_BIND=127.0.0.1
   SECRETS_KEY=…
   ```

5. `docker compose --profile tunnel up -d`. The tunnel shows "Healthy" in the dashboard
   within a minute; Cloudflare handles HTTPS.

Cloudflare's "quick tunnels" (random `*.trycloudflare.com` names, no account) change on every
restart and are meant for testing, not for running a dropzone.

### (c) Free names

* **DuckDNS** gives you a free `mydz.duckdns.org` and keeps it pointed at a changing home IP (run
  their updater, or use the router's DDNS setting if it supports DuckDNS). Then do (a) with
  `DOMAIN=mydz.duckdns.org`, `ORIGIN=https://mydz.duckdns.org`, ports 80/443 forwarded,
  `--profile https`. It does **not** work behind CGNAT: DuckDNS only points at your IP.
* **Cloudflare Tunnel** costs nothing, but needs a domain you own on Cloudflare ((b) above).
* We do **not** hand out `*.log-book.app` subdomains for self-hosted servers. That may come later;
  nothing is promised or scheduled.

## Local-only (dropzone WiFi, no domain)

The server sits in the manifest office and is only reachable on the dropzone's own network.
Nothing is bought, nothing is exposed to the internet, and manifest keeps working when the internet
line is down (the router and WiFi must still have power).

### 1. Fixed LAN address

Give the server an address that never changes: in the router's DHCP settings add a **DHCP
reservation** ("static lease", "address binding") for the server's MAC address, e.g.
`192.168.1.10`. Reboot the server and check it got that address (`ip addr`, or the router's client
list).

### 2. Pick a name people type

**Option A: a name in the router or local DNS** (best). Use a name under `.internal`, which ICANN
reserved for private networks in 2024, e.g. `logbook.internal`. Avoid made-up endings such as `.dz`
(Algeria's real country domain); `.local` is reserved for option B.

* Many routers (MikroTik, pfSense/OPNsense, ASUS, some TP-Link): "DNS static entries" / "Local DNS"
  → `logbook.internal` → `192.168.1.10`. ISP-supplied routers often don't have this.
* **Pi-hole**: Local DNS → DNS Records → `logbook.internal` → `192.168.1.10`.
* **AdGuard Home**: Filters → DNS rewrites → `logbook.internal` → `192.168.1.10`.
* **OpenWrt / dnsmasq**: `address=/logbook.internal/192.168.1.10` (OpenWrt: Network → DHCP and DNS
  → Addresses).

Pi-hole/AdGuard only answer if the router hands them out as the DNS server (DHCP option), so set
that too. Phones on mobile data won't resolve the name, which is expected for LAN-only.

**Option B: mDNS name `logbook.local`** (no router config). Set the server's hostname to `logbook`
and run Avahi (`sudo hostnamectl set-hostname logbook`, `sudo apt install avahi-daemon`; Raspberry
Pi OS has it already). Devices then find `logbook.local` by themselves. Caveats: iPhone/iPad, macOS
and Windows 10/11 resolve `.local` reliably; Android only from Android 13 and not in every browser;
smart TVs, WiFi with "client isolation" and networks split across VLANs often don't. Keep the IP
(option C) as a fallback.

**Option C: the plain IP**, `http://192.168.1.10`. Always works, harder to remember. Print it as a
QR code for the manifest desk.

For every option: type the full `http://` or `https://` prefix the first time, or Chrome may
search for `logbook.internal` instead of opening it. Then bookmark it or "Add to Home screen".

### 3. HTTP or HTTPS on the LAN

**LAN with HTTPS (recommended for staff devices).** Caddy runs its own small certificate authority
(`tls internal`) and issues certificates for your names and IPs. Each device has to trust that
authority once, otherwise browsers show a certificate warning.

```sh
# .env
LAN_HOSTS=logbook.internal, logbook.local, 192.168.1.10   # every name/IP people may type
ORIGIN=                                                   # empty: accept all of the above
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
APP_BIND=127.0.0.1
SECRETS_KEY=…
```

```sh
docker compose --profile lan up -d     # deploy/Caddyfile.lan
```

Install the certificate on each staff device from `http://192.168.1.10/ca.crt` (plain HTTP on
purpose; the certificate is public):

* **iPhone/iPad**: open the link in Safari → Allow → Settings → *Profile Downloaded* → Install.
  Then Settings → General → About → Certificate Trust Settings → switch on "Caddy Local Authority".
* **Android**: download it, then Settings → Security → Encryption & credentials → Install a
  certificate → **CA certificate** (wording varies by brand). Chrome trusts it; some other apps
  don't.
* **Windows**: open the `.crt` → Install Certificate → Local Machine → "Trusted Root Certification
  Authorities".
* **macOS**: open it in Keychain Access → System keychain → double-click → Trust → Always Trust.
* **Linux, ChromeOS, TVs**: varies; use plain HTTP for these or skip them.

The authority lives in the `caddy-data` volume and is valid for 10 years. Back that volume up: if
it's lost, Caddy creates a new one and every device must install it again. Jumpers' own phones
would need it too, which is why plain HTTP is often the easier choice for a jumper-facing LAN.

**LAN, plain HTTP.** No certificates at all.

```sh
# .env
ORIGIN=                    # empty: accept any name/IP that reaches port 80
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
APP_BIND=127.0.0.1
SECRETS_KEY=…
```

```sh
docker compose --profile lan-http up -d   # deploy/Caddyfile.lan-http, port 80
```

Caveats, checked against the app:

* Logins work over plain HTTP: the session cookie is only marked `Secure` on HTTPS requests.
  Tested in a browser on a LAN IP (not localhost) behind `Caddyfile.lan-http`.
* Nothing is encrypted: anyone on the same WiFi can read the traffic, passwords included. Use a
  WPA2/WPA3 password on the staff network and don't run this on an open guest WiFi.
* Browsers restrict some features to HTTPS. **"Near me" on the Dropzones page** (geolocation) fails
  with "Couldn't get your location". **Copy-link buttons** fall back to selecting the text, and the
  **share sheet** isn't offered. The signature pad, waivers, photo uploads and the hangar display
  all work.
* Don't move a name from HTTPS back to HTTP: the app sends HSTS on HTTPS, so browsers that once
  opened `https://logbook.internal` refuse plain HTTP for that name for a year. Use a new name or
  the IP instead.

**Why `ORIGIN=` (empty)?** The app rejects form posts whose origin doesn't match `ORIGIN` exactly
(CSRF protection). An empty `ORIGIN` plus `PROTOCOL_HEADER`/`HOST_HEADER` makes the app take the
origin from each request Caddy forwards, so `logbook.internal`, `logbook.local` and the IP all work.
Only do this behind one of the bundled Caddy front ends. To allow exactly one name, set it instead,
e.g. `ORIGIN=http://logbook.internal`. Without any proxy, run the app with
`ORIGIN=http://192.168.1.10:3000`. The server warns at startup if `ORIGIN` and `PROTOCOL_HEADER`
are both missing, because every request then counts as HTTPS and plain-HTTP logins fail.

Without Docker, the same Caddyfiles work with a host-installed Caddy:
`UPSTREAM=127.0.0.1:3000 caddy run --config deploy/Caddyfile.lan-http` (for `Caddyfile.lan` also
set `CA_DIR=~/.local/share/caddy/pki/authorities/local`).

## Linked accounts, phones and offline

**Jumpers' phones.** Jumpers use the web app in their phone browser (nothing to install from an
app store). On a LAN-only server they reach it only while on the dropzone WiFi; from home or on
mobile data they can't. There's no offline mode on the phone: if it loses the WiFi, pages don't
load until it's back.

**Internet down, LAN up.** Manifest, check-in, desk payments, wallets, waivers and the hangar
display keep working; they only need the server. What stops: online bookings and outside access
(public modes) and syncing to the hosted logbook (below).

**"Link global account" (the jumper's hosted logbook).** Setup: the owner registers this server on
the hosted Log-Book (Settings → Federation there), then enters the URL, client ID and secret in
Settings → Federation on this server (or sets `FEDERATION_*` in `.env`). Register the address
people actually use here (e.g. `http://logbook.internal`): after the jumper approves, the hosted
site sends their browser back to it.

* **Linking** (Settings → Linked accounts → Link global account) needs internet on **both** the
  phone and the server: the phone opens the hosted sign-in page and the server then exchanges the
  code with the hosted site. A LAN-only server needs an internet line for this, but doesn't need to
  be reachable *from* the internet.
* **Jump sync** is a push from this server. When manifest completes a load, each linked jumper's
  jumps are queued in the same database transaction. The queue is sent after the next staff
  action, hourly in the background, or with **Sync now** on Settings → Federation. Without
  internet the jumps stay queued; nothing is lost. Failed sends back off (1, 2, 4 … minutes, at most
  6 hours), so after a long outage it can take up to 6 hours for everything to arrive. **Sync now**
  also waits for that back-off.
* Only load completion is queued. Later edits or deletions of a synced jump here aren't sent, and
  nothing is pulled from the hosted site (licence, currency): **planned**.

**Email.** Email sending isn't built yet for any install: password-reset and booking-confirmation
emails are written to the server log (`docker compose logs app | grep -A6 '\[email\]'`), where
staff can find a reset link for a jumper.

## Hangar display (TV)

1. With a staff login open **Display** (`/app/display`). It refreshes itself every 10 seconds.
2. For a TV that shouldn't hold a staff login, the owner/admin opens the menu → **Public display
   link → Create link** and uses that URL (`/dz/<slug>/display?token=…`). Anyone with the link
   sees today's loads; **Rotate link** if it leaks.
3. Open the LAN URL full screen on the TV:
   * **Raspberry Pi / mini PC on the TV**: start
     `chromium --kiosk --noerrdialogs 'http://logbook.internal/dz/<slug>/display?token=…'` at login
     (Raspberry Pi OS: desktop autostart) and turn off screen blanking.
   * **Smart TV / Android TV / Fire TV stick**: a kiosk browser app with "start on boot" and "keep
     screen on", pointed at the same URL. Use the IP or a router DNS name: TVs rarely resolve
     `.local` and can't easily install the LAN certificate, so plain HTTP (or a public URL) is
     simplest for the TV.
4. If the internet drops, the board keeps updating as long as TV and server share the network.

## Environment reference

| Var | Default | Notes |
|---|---|---|
| `ORIGIN` | compose: `http://localhost:3000` | The URL people use, e.g. `https://manifest.mydz.co.za` (CSRF + absolute URLs). Empty (`ORIGIN=`) = taken from each request; only behind a proxy with `PROTOCOL_HEADER`/`HOST_HEADER` (LAN with several names). |
| `APP_ORIGIN` | `ORIGIN`, else the request | Canonical URL in emails / booking confirmations. |
| `RESEND_API_KEY` | — | Send email through [Resend](https://resend.com) (password resets, staff invites, tandem confirmations). Unset = emails are only printed to the log (`docker compose logs app`). |
| `EMAIL_FROM` | `Log-Book <noreply@log-book.app>` | Sender address; use a domain you verified in Resend, e.g. `Skydive Example <noreply@your-dz.co.za>`. |
| `EMAIL_REPLY_TO` | — | Optional Reply-To address. |
| `GITHUB_FEEDBACK_TOKEN` | — | Optional in-app *Feedback* button: posts what users send as **public** issues on `FEEDBACK_REPO` (fine-grained GitHub token with *Issues: read and write* on that repo). Unset = no button. Point it at your own repo. |
| `FEEDBACK_REPO` | `MarthinusBosman/log-book` | `owner/repo` that receives feedback issues. Self-hosters: use your own repo. |
| `SECRETS_KEY` | insecure dev key | **Set this.** Encrypts stored payment-provider secrets. Keep it with your backups; changing it makes saved PayFast credentials unreadable. |
| `PORT` | `3000` | Host port of the app (compose) / listen port (bare Bun). |
| `APP_BIND` | `0.0.0.0` | Compose: host address port 3000 is published on. `127.0.0.1` when a front end is in use. |
| `DOMAIN` | `localhost` | `--profile https`: public name Caddy gets a certificate for. |
| `TUNNEL_TOKEN` | — | `--profile tunnel`: Cloudflare Tunnel token. |
| `LAN_HOSTS` | `logbook.internal` | `--profile lan`: comma-separated names/IPs for Caddy's local certificates. |
| `INSTANCE_MODE` | `dropzone` | `global` only for the hosted identity provider. |
| `STORAGE_DRIVER` | `disk` | `disk` = files in `UPLOADS_DIR`; `db` = files inside the SQLite DB (one file to back up). Switching does not migrate existing files. |
| `DATABASE_PATH` | `data/app.db` (image: `/data/app.db`) | SQLite file (WAL mode). |
| `UPLOADS_DIR` | `data/uploads` (image: `/data/uploads`) | Used when `STORAGE_DRIVER=disk`. |
| `MIGRATIONS_DIR` | `drizzle` | Applied on startup. |
| `HOST` | `0.0.0.0` | Listen address (bare Bun). |
| `BODY_SIZE_LIMIT` | `12M` (via `build/server.js`) | Max request body. App limits: images 5 MB, PDFs/imports 10 MB. |
| `PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER`, `XFF_DEPTH` | — | Behind a reverse proxy: `x-forwarded-proto`, `x-forwarded-host`, `x-forwarded-for` (Cloudflare Tunnel: `ADDRESS_HEADER=cf-connecting-ip`), `1`. |
| `CRON_SECRET` | — | Enables `POST /api/cron` from outside (`Authorization: Bearer <CRON_SECRET>`). Housekeeping already runs hourly in-process. |
| `FEDERATION_GLOBAL_URL`, `FEDERATION_CLIENT_ID`, `FEDERATION_CLIENT_SECRET` | — | Link jumpers to the hosted instance; can also be entered at `/app/settings/federation`. |
| `FEDERATION_FLUSH_SECRET` | client secret | Bearer for `POST /api/federation/flush`. |
| `JUMPMASTER_FIREBASE_PROJECT_ID`, `JUMPMASTER_FIREBASE_API_KEY` | — | Optional overrides for the Jump Master import connector; discovered automatically when unset (docs/IMPORT.md). |
| `GIT_SHA` (build arg) | — | Shown in `/api/health` `version`. |
| `LOG_BOOK_VERSION` | `latest` | Compose: image tag to run, e.g. `0.1.0` or `0.1` ([Pinning](#updating)). |
| `LOG_BOOK_IMAGE` | `ghcr.io/marthinusbosman/log-book` | Compose: image name (a mirror, or your own build). |
| `COMPOSE_PROFILES` | — | Compose: front end to start with every command (`https`, `tunnel`, `lan`, `lan-http`). |
| `LOG_BOOK_URL` | — | Written by the installer (the URL it printed); not read by the app. |

Caddyfiles: `deploy/Caddyfile.public`, `deploy/Caddyfile.lan`, `deploy/Caddyfile.lan-http`. They
also read `UPSTREAM` (default `app:3000`), `HTTP_PORT`/`HTTPS_PORT` (default 80/443) and, for the
LAN certificate download, `CA_DIR`. Only change those when running Caddy outside compose.

## Backups

Everything lives in the `slot-data` volume: `/data/app.db` (+ `-wal`/`-shm`) and `/data/uploads`.
With `--profile lan`, keep the `caddy-data` volume too (the local certificate authority).

```sh
# 1. Consistent DB snapshot while running (VACUUM INTO + integrity check, keeps the newest 14)
docker compose exec app bun scripts/backup.ts                 # → /data/backups/app-<timestamp>.db
# 2. Copy snapshot + uploads off the box
docker compose cp app:/data/backups ./backups
docker compose cp app:/data/uploads ./backups/uploads          # not needed with STORAGE_DRIVER=db
```

Nightly via host cron, e.g. `0 3 * * * cd ~/log-book && docker compose exec -T app bun scripts/backup.ts && rsync -a …`.
With `sqlite3` on the host, `sqlite3 /path/app.db ".backup backup.db"` is equivalent. Don't copy
`app.db` with `cp` while the app runs (WAL); use one of the above. Keep `SECRETS_KEY` with the
backup. A LAN-only server should still copy backups off the machine (USB disk, NAS, or a cloud
folder whenever the internet is up).

**Restore** (e.g. `backups/app-2026-11-12T03-00-00-000Z.db`, copied off the box as above):

```sh
docker compose stop app
docker compose run --rm --no-deps -v "$PWD/backups:/restore:ro" app \
  sh -c 'rm -f /data/app.db-wal /data/app.db-shm && cp /restore/app-2026-11-12T03-00-00-000Z.db /data/app.db'
docker compose up -d
```

Restore `/data/uploads` the same way (`cp -r /restore/uploads/. /data/uploads/`) unless you use
`STORAGE_DRIVER=db`. The volume itself is called `<folder>_slot-data` (`log-book_slot-data` for
an installer setup; `docker volume ls`).

## Updating

Back up first ([Backups](#backups)): database migrations run automatically when the new version
starts, and there is no automatic way back to an older version once they have run.

```sh
cd log-book
docker compose exec app bun scripts/backup.ts     # snapshot → /data/backups
docker compose pull && docker compose up -d       # new image; migrations apply on start
docker compose logs -f app                        # watch it come up; /api/health shows the version
```

Re-running the installer does the same, and also refreshes `docker-compose.yml` and the Caddyfiles
from the repository.

**Pinning a version.** By default `.env` follows `latest` (the newest stable release). To control
when you upgrade, pin a tag in `.env`:

```sh
LOG_BOOK_VERSION=0.1.0     # exactly this release
LOG_BOOK_VERSION=0.1       # newest 0.1.x patch release
```

Then `docker compose pull && docker compose up -d` only moves within that pin. Tags:
`latest`, `X.Y.Z`, `X.Y`, `X` (from 1.0 on) and `sha-<commit>`. Releases are listed at
https://github.com/MarthinusBosman/log-book/pkgs/container/log-book. **Going back** to an older
version: `docker compose down`, restore the backup taken before the upgrade ([Restore](#backups)), set the old
`LOG_BOOK_VERSION`, `docker compose up -d`. Starting an old version on a database migrated by a
newer one isn't supported.

**Developers** (checkout with `build:` uncommented): `git pull && docker compose up -d --build`.

## Health and housekeeping

* `GET /api/health` → `{"ok":true,"version":"0.0.1+abc1234","db":{"ok":true,…}}` (503 if the DB is
  down); used by the image's `HEALTHCHECK`.
* Hourly in-process job: deletes expired sessions/reset tokens and orphaned DB file chunks, and
  retries the federation outbox.
* Security headers (CSP with per-request nonces, `frame-ancestors 'self'`, Referrer-Policy,
  Permissions-Policy, HSTS on https) are set by the app; no proxy config needed.

## Licence

Log-Book is free software under the [GNU AGPL v3.0 or later](../LICENSE) (`AGPL-3.0-or-later`).
Running it for your dropzone, unmodified, needs nothing from you: the login page and site footer
already link to the source. If you **modify** it and let other people use your modified server,
the AGPL (section 13) requires you to offer them your modified source: publish it and set
`sourceUrl` in `src/lib/brand.ts` to it, so the "Source code" links point there.
