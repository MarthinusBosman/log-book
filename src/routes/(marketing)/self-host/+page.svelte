<script lang="ts">
	import { brand } from '#lib/brand.ts';
	import Seo from '#lib/components/marketing/Seo.svelte';

	/** Raw files of the repository for the manual install (GitHub sourceUrl → raw.githubusercontent.com). */
	const rawBase = brand.sourceUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/') + '/main';

	const toc = [
		{ id: 'need', label: 'What you need' },
		{ id: 'install', label: 'Install' },
		{ id: 'reach', label: 'How people reach it' },
		{ id: 'domain', label: 'Custom domain' },
		{ id: 'lan', label: 'Dropzone WiFi only' },
		{ id: 'payments', label: 'Payments' },
		{ id: 'tv', label: 'Hangar TV' },
		{ id: 'config', label: 'Configuration' },
		{ id: 'backups', label: 'Backups' },
		{ id: 'updates', label: 'Updates' },
		{ id: 'link', label: 'Link to jumper logbooks' }
	];

	const modes: { name: string; who: string; need: string; profile: string }[] = [
		{ name: 'Own domain', who: 'Anyone, anywhere', need: 'A domain, a public IP, ports 80 and 443 forwarded', profile: 'https' },
		{ name: 'Cloudflare Tunnel', who: 'Anyone, anywhere', need: 'A domain on Cloudflare. No static IP, works behind CGNAT', profile: 'tunnel' },
		{ name: 'WiFi only, HTTPS', who: 'Devices on your network', need: 'Nothing to buy. Each staff device trusts a certificate once', profile: 'lan' },
		{ name: 'WiFi only, HTTP', who: 'Devices on your network', need: 'Nothing. Use it on a WiFi with a password', profile: 'lan-http' }
	];

	const env: [string, string][] = [
		['ORIGIN', 'The URL people use, e.g. https://manifest.your-dz.co.za. Form posts from any other address are rejected. Leave it empty (ORIGIN=) on a LAN that answers on several names.'],
		['SECRETS_KEY', 'Any long random string. Encrypts the payment-provider keys you save in settings. Set it before you add PayFast and keep a copy with your backups.'],
		['PORT, APP_BIND', 'Host port for the app (3000). Set APP_BIND=127.0.0.1 when a front end is in use.'],
		['DOMAIN', 'Own-domain mode: the name Caddy gets a certificate for.'],
		['TUNNEL_TOKEN', 'Cloudflare Tunnel mode: the token from the Cloudflare dashboard.'],
		['LAN_HOSTS', 'WiFi-only HTTPS mode: every name and IP people may type, comma separated.'],
		['PROTOCOL_HEADER, HOST_HEADER', 'x-forwarded-proto and x-forwarded-host behind any of the front ends.'],
		['FEDERATION_GLOBAL_URL', `Origin of the hosted ${brand.name} instance, for linking jumper accounts.`],
		['FEDERATION_CLIENT_ID, FEDERATION_CLIENT_SECRET', 'Issued when you register your server (see below).']
	];

	const oneLiner = `curl -fsSL ${brand.installUrl} | bash`;

	const manual = `mkdir log-book && cd log-book
RAW=${rawBase}
# 1. download the compose file, settings template and front-end configs
curl -fsSLO $RAW/docker-compose.yml
curl -fsSL $RAW/.env.example -o .env
mkdir -p deploy && for f in Caddyfile.public Caddyfile.lan Caddyfile.lan-http; do
  curl -fsSL $RAW/deploy/$f -o deploy/$f; done
# 2. edit .env: ORIGIN=…, SECRETS_KEY= (openssl rand -hex 32),
#    COMPOSE_PROFILES=https | tunnel | lan | lan-http
nano .env
# 3. start (pulls the image)
docker compose up -d`;

	const ownDomain = `# .env
DOMAIN=manifest.your-dz.co.za
ORIGIN=https://manifest.your-dz.co.za
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host

docker compose --profile https up -d`;

	const tunnel = `# .env
TUNNEL_TOKEN=eyJ…
ORIGIN=https://manifest.your-dz.co.za
ADDRESS_HEADER=cf-connecting-ip

docker compose --profile tunnel up -d`;

	const dns = `# Pi-hole: Local DNS → DNS Records
# AdGuard Home: Filters → DNS rewrites
# OpenWrt / dnsmasq:
address=/logbook.internal/192.168.1.10`;

	const lan = `# .env
LAN_HOSTS=logbook.internal, logbook.local, 192.168.1.10
ORIGIN=
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host

docker compose --profile lan up -d       # HTTPS, local certificate
docker compose --profile lan-http up -d  # or: plain HTTP on port 80`;

	const kiosk = `chromium --kiosk --noerrdialogs \\
  'http://logbook.internal/dz/your-dz/display?token=…'`;

	const backup = `docker compose exec app bun scripts/backup.ts
docker compose cp app:/data/backups ./backups
docker compose cp app:/data/uploads ./backups/uploads`;

	const update = `cd log-book
docker compose exec app bun scripts/backup.ts   # backup first
docker compose pull && docker compose up -d     # migrations run on start

# optional, in .env: stay on a release line
LOG_BOOK_VERSION=0.1`;

</script>

<Seo
	title="Self-host"
	description="Run {brand.name} at your dropzone: one Docker container, one SQLite file. Custom domain or dropzone WiFi only, payments, hangar TV, backups and jumper logbook linking."
/>

{#snippet code(text: string, label: string)}
	<figure class="mt-5 overflow-hidden rounded-xl border border-[#1b2742] bg-[#050a15]">
		<figcaption class="border-b border-white/10 px-4 py-2 font-mono text-[11px] tracking-[0.12em] text-white/50 uppercase">{label}</figcaption>
		<pre class="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-white/85"><code>{text}</code></pre>
	</figure>
{/snippet}

{#snippet c(text: string)}<code class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[14px] break-words text-fg">{text}</code>{/snippet}

{#snippet ol(items: string[])}
	<ol class="mt-5 space-y-4">
		{#each items as step, i (step)}
			<li class="grid grid-cols-[2rem_1fr] gap-2">
				<span class="grid size-6 place-items-center rounded-full border border-border font-mono text-xs text-muted tabular-nums">{i + 1}</span>
				<span class="min-w-0 text-muted">{step}</span>
			</li>
		{/each}
	</ol>
{/snippet}

{#snippet badge(text: string)}<span class="ml-2 inline-block rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 align-middle font-mono text-[11px] tracking-wide text-warning uppercase">{text}</span>{/snippet}

<section class="relative isolate border-b border-border">
	<div class="bg-chart absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true"></div>
	<div class="mx-auto grid max-w-6xl gap-10 px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20 lg:grid-cols-[1fr_24rem] lg:items-end">
		<div>
			<p class="font-mono text-xs font-medium tracking-[0.16em] text-primary uppercase">Self-host guide</p>
			<h1 class="mt-4 max-w-3xl text-4xl font-[580] tracking-[-0.03em] text-balance sm:text-6xl">Run it on your own server.</h1>
			<p class="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
				The self-hosted build is the same app as the hosted one, in one Docker container. Everything it stores lives in
				a SQLite file and an uploads folder on a single volume. Put it on the internet under your own domain, or keep it
				on the dropzone WiFi.
			</p>
		</div>
		<dl class="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border text-sm">
			{#each [['Runtime', 'Bun in Docker'], ['Database', 'SQLite file'], ['Port', '3000'], ['Price', 'Free']] as [k, v] (k)}
				<div class="bg-surface p-4">
					<dt class="text-muted">{k}</dt>
					<dd class="mt-1 font-medium">{v}</dd>
				</div>
			{/each}
		</dl>
	</div>
</section>

<div class="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[13rem_1fr]">
	<nav class="hidden lg:block" aria-label="On this page">
		<ul class="sticky top-24 space-y-1 border-l border-border text-sm">
			{#each toc as t (t.id)}
				<li><a href="#{t.id}" class="-ml-px block border-l border-transparent py-1.5 pl-4 text-muted transition-colors hover:border-fg hover:text-fg">{t.label}</a></li>
			{/each}
		</ul>
	</nav>

	<div class="max-w-3xl min-w-0 space-y-16 text-[16px] leading-relaxed">
		<section id="need" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">What you need</h2>
			<ul class="mt-4 list-disc space-y-2 pl-5 text-muted marker:text-subtle">
				<li>
					Any 64-bit machine with Docker: a mini PC in the manifest office, a NAS, or a Raspberry Pi 4 or 5. Put it and the
					router on a UPS.
				</li>
				<li>A friend who is comfortable with a terminal, the router's admin page and DNS settings, for about an hour.</li>
				<li>
					A domain only if people outside the building need it: online tandem bookings, jumpers at home, and online
					payments once they ship. Manifest, check-in, waivers and the hangar display work on the dropzone WiFi alone, even
					when the internet line is down.
				</li>
			</ul>
		</section>

		<section id="install" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Install</h2>
			<p class="mt-4 text-muted">
				You don’t need the source code: {brand.name} ships as a ready-made Docker image for regular PCs and for ARM
				boards like the Raspberry Pi 4 or 5 (64-bit OS). With Docker installed, run the installer. It asks how people will
				reach the server and its name, creates the secrets, starts everything and prints the address.
			</p>
			{@render code(oneLiner, 'Install')}
			<p class="mt-4 text-muted">
				Run it again any time: it keeps your settings and secrets. Prefer to do it by hand? Three steps: download the
				compose file and settings, edit them, start.
			</p>
			{@render code(manual, 'Manual install')}
			<p class="mt-4 text-muted">
				Whoever creates the dropzone becomes its owner. Add your aircraft and pricelist, then give your staff their roles
				from <span class="font-medium text-fg">Settings → Members &amp; roles</span>.
			</p>
		</section>

		<section id="reach" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">How people reach it</h2>
			<p class="mt-4 text-muted">
				Pick one front end. The installer asks; by hand, set {@render c('COMPOSE_PROFILES=<name>')} in .env or use
				{@render c('docker compose --profile <name> up -d')}.
			</p>
			<div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#each modes as m (m.profile)}
					<div class="min-w-0 rounded-2xl border border-border bg-surface p-4">
						<p class="font-medium">{m.name}</p>
						<p class="mt-1 text-sm text-muted">{m.who}. {m.need}.</p>
						<p class="mt-3 font-mono text-[13px] text-fg">--profile {m.profile}</p>
					</div>
				{/each}
			</div>
		</section>

		<section id="domain" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Custom domain</h2>
			<h3 class="mt-6 font-semibold">Your own domain, e.g. manifest.your-dz.co.za</h3>
			{@render ol([
					'Register a domain (a .co.za costs roughly R50–R150 a year) or add a subdomain to the dropzone website’s domain.',
					'In the DNS settings add an A record (and AAAA for IPv6) for "manifest" pointing at your public IP. Use a CNAME to a dynamic-DNS name if the IP changes.',
					'Give the server a fixed LAN IP (DHCP reservation) and forward ports 80 and 443 on the router to it.',
					'Fill in .env and start the https profile. Caddy gets and renews the Let’s Encrypt certificate on its own.'
				])}
			{@render code(ownDomain, 'Own domain')}

			<h3 class="mt-10 font-semibold">No static IP, or behind CGNAT: Cloudflare Tunnel</h3>
			<p class="mt-3 text-muted">
				Most LTE/5G and many fibre lines have no public IP to forward ports to. A tunnel connects outwards from the server
				instead, so nothing on the router changes.
			</p>
			{@render ol([
					'Add your domain to a free Cloudflare account (you switch its nameservers to Cloudflare).',
					'Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared. Cloudflare asks for a card when you first activate Zero Trust, even on the free plan. Copy the token.',
					'Add a public hostname: manifest.your-dz.co.za, service HTTP, URL app:3000.',
					'Put the token in .env and start the tunnel profile. Cloudflare handles HTTPS.'
				])}
			{@render code(tunnel, 'Cloudflare Tunnel')}

			<h3 class="mt-10 font-semibold">Free names</h3>
			<ul class="mt-3 list-disc space-y-2 pl-5 text-muted marker:text-subtle">
				<li>DuckDNS gives you a free name like mydz.duckdns.org. Use it like your own domain; it needs a public IP, so not behind CGNAT.</li>
				<li>Cloudflare Tunnel is free, but needs a domain you own.</li>
				<li>We don’t offer subdomains on {brand.domain} for self-hosted servers. That may come later; nothing is scheduled.</li>
			</ul>
		</section>

		<section id="lan" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Dropzone WiFi only</h2>
			<p class="mt-4 text-muted">No domain, nothing on the internet. The server sits in the office and only devices on your network can open it.</p>
			{@render ol([
					'Give the server a fixed address with a DHCP reservation on the router, e.g. 192.168.1.10.',
					'Pick a name. Best: a local DNS entry such as logbook.internal on the router, Pi-hole, AdGuard Home or OpenWrt. Or no setup at all: name the server "logbook" and use logbook.local (mDNS; reliable on iPhone, Mac and Windows, patchy on Android before 13 and on TVs). The plain IP always works as a fallback.',
					'Choose HTTPS or plain HTTP. HTTPS uses a certificate Caddy makes itself: each staff device installs it once from http://192.168.1.10/ca.crt. Plain HTTP needs nothing, but traffic isn’t encrypted, so only use it on a WiFi with a password.',
					'Leave ORIGIN empty so the app answers on every name you listed, and start the lan or lan-http profile.'
				])}
			{@render code(dns, 'Local DNS name')}
			{@render code(lan, 'WiFi only')}
			<p class="mt-4 text-muted">
				Logins work over plain HTTP. What browsers block without HTTPS: “Near me” on the Dropzones page, one-tap copy
				buttons and the share sheet. Signatures, waivers, photo uploads and the hangar display all work. Jumpers reach the
				server only while they’re on your WiFi.
			</p>
		</section>

		<section id="payments" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Payments</h2>
			<p class="mt-4 text-muted">
				Your dropzone is the merchant. Payments go to your own PayFast or Stripe account and settle straight into your bank
				account; {brand.name} never holds the money.
			</p>
			<h3 class="mt-6 font-semibold">Works today</h3>
			<ul class="mt-3 list-disc space-y-2 pl-5 text-muted marker:text-subtle">
				<li>Pay at manifest: staff mark slots paid as cash, card machine or EFT from the load.</li>
				<li>Wallet top-ups: the jumper pays at the desk and staff press Add funds on the jumper’s page.</li>
				<li>Jumpers pay their slots from the wallet, and staff pay can go into wallets.</li>
				<li>Tandem bookings without online payment: customers pay at check-in.</li>
			</ul>
			<h3 class="mt-8 font-semibold">Online card payments {@render badge('Coming soon')}</h3>
			<p class="mt-3 text-muted">
				PayFast and Stripe aren’t live yet: you can save your details now, but nothing is charged and customers don’t see
				the option. To be ready, set {@render c('SECRETS_KEY')} first, then:
			</p>
			{@render ol([
					'South Africa: open a PayFast merchant account (payfast.io) in the dropzone’s name. For testing, register a sandbox account at sandbox.payfast.co.za.',
					'Copy the Merchant ID and Merchant Key from the PayFast dashboard (Settings → Developer Settings) and set a Salt Passphrase there.',
					'Paste all three into Settings → Payments → PayFast. Keep Test mode on for sandbox details, off for live ones.',
					'Outside South Africa: Stripe. The settings page stores country, currency and a connected account ID; connecting your Stripe account from the page is planned.'
				])}
			<p class="mt-4 text-muted">When online payments ship, the server will need a public address (own domain or tunnel) so the provider can confirm payments.</p>
		</section>

		<section id="tv" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Hangar TV</h2>
			<p class="mt-4 text-muted">
				Open <span class="font-medium text-fg">Display</span> in the app, or create a
				<span class="font-medium text-fg">Public display link</span> from its menu so the TV doesn’t need a staff login.
				The board refreshes every 10 seconds and keeps going when the internet is down, as long as the TV is on your
				network. On a Raspberry Pi or mini PC behind the TV:
			</p>
			{@render code(kiosk, 'Kiosk browser')}
			<p class="mt-4 text-muted">On a smart TV or streaming stick, use a kiosk browser app with “start on boot”, and the IP or a router DNS name rather than .local.</p>
		</section>

		<section id="config" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Configuration</h2>
			<p class="mt-4 text-muted">Everything goes in {@render c('.env')} next to the compose file.</p>
			<dl class="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border">
				{#each env as [k, v] (k)}
					<div class="grid gap-1 bg-surface p-4 sm:grid-cols-[15rem_1fr] sm:gap-6">
						<dt class="font-mono text-[13px] break-words text-fg">{k}</dt>
						<dd class="text-[15px] text-muted">{v}</dd>
					</div>
				{/each}
			</dl>
		</section>

		<section id="backups" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Backups</h2>
			<p class="mt-4 text-muted">
				Everything is in {@render c('/data')}: the database and uploaded files such as waiver PDFs and signatures. The
				backup script takes a consistent snapshot while the app runs; copy it somewhere off the machine. Keep your
				{@render c('SECRETS_KEY')} with it.
			</p>
			{@render code(backup, 'Nightly backup')}
			<p class="mt-4 text-muted">
				You can also download a full dropzone export as JSON from <span class="font-medium text-fg">Export</span> inside
				the app. It's handy as a second copy, or for moving to the hosted version later.
			</p>
		</section>

		<section id="updates" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Updates</h2>
			<p class="mt-4 text-muted">
				Take a backup, then pull the new image. Database migrations run when it starts, so keep that backup until you’re
				happy with the new version. Downtime is the few seconds the container takes to restart. To upgrade only when you
				choose, pin a version such as {@render c('LOG_BOOK_VERSION=0.1.0')} in .env.
			</p>
			{@render code(update, 'Update')}
		</section>

		<section id="link" class="scroll-mt-24">
			<h2 class="text-2xl font-[580] tracking-[-0.02em]">Link to jumper logbooks</h2>
			<p class="mt-4 text-muted">
				Jumpers keep one logbook on the hosted {brand.name}. To send them the jumps they make at your dropzone:
			</p>
			{@render ol([
					`On the hosted ${brand.name}, open Settings → Federation and register your server under the address people use. You get a client ID and secret.`,
					'Enter them in Settings → Federation on your server (or set FEDERATION_GLOBAL_URL, FEDERATION_CLIENT_ID and FEDERATION_CLIENT_SECRET).',
					'Jumpers open Settings → Linked accounts on your server and link once. This needs internet on both the phone and the server, even for a WiFi-only server.',
					'Every completed load is queued and sent to their logbook, signed. If the internet is down, jumps wait in the queue and go when it’s back (retries back off to at most every 6 hours).'
				])}
		</section>

		<div class="rounded-2xl border border-border bg-surface p-6 sm:p-8">
			<h2 class="text-lg font-semibold tracking-tight">The full guide</h2>
			<p class="mt-2 text-muted">
				Step-by-step details (certificate install per device, router DNS examples, CGNAT checks, every environment
				variable) are in the <a href="{brand.sourceUrl}/blob/main/docs/SELF_HOSTING.md" class="font-medium text-fg underline underline-offset-2">full self-hosting guide</a>.
				Ready-made Caddy configs live in {@render c('deploy/')}.
			</p>
			<p class="mt-3 text-muted">
				{brand.name} is free software under the {brand.license} licence; the
				<a href={brand.sourceUrl} class="font-medium text-fg underline underline-offset-2">source code</a> is public. Changed it
				and running it for others? The licence asks you to share your changes with those users too.
			</p>
		</div>

		<div class="rounded-2xl border border-border bg-surface p-6 sm:p-8">
			<h2 class="text-lg font-semibold tracking-tight">Rather not run a server?</h2>
			<p class="mt-2 text-muted">The hosted version is the same app, and you can move your data across with an export later.</p>
			<div class="mt-5 flex flex-col gap-3 sm:flex-row">
				<a href="/signup" class="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-medium text-white transition-colors hover:bg-brand-600">Start free on hosted</a>
				<a href="mailto:{brand.supportEmail}?subject=Self-hosting" class="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong px-5 font-medium transition-colors hover:bg-surface-2">Ask us about self-hosting</a>
			</div>
		</div>
	</div>
</div>
