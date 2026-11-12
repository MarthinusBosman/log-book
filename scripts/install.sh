#!/usr/bin/env bash
# Log-Book installer for a self-hosted dropzone server.
#
#   curl -fsSL https://log-book.app/install.sh | bash
#
# Creates ./log-book with docker-compose.yml, the Caddy front-end configs and a .env, asks how
# people will reach the server, generates the secrets and starts it with `docker compose up -d`.
# Safe to run again: it refreshes the compose/Caddy files, keeps the existing .env (and never
# replaces secrets in it), then pulls and restarts.
#
# Non-interactive (no terminal, CI, provisioning): set the answers as environment variables, e.g.
#   curl -fsSL https://log-book.app/install.sh | LOG_BOOK_MODE=lan-http bash
#
#   LOG_BOOK_DIR        install folder                      (default: ./log-book)
#   LOG_BOOK_MODE       public | tunnel | lan | lan-http    (asked if unset)
#   LOG_BOOK_HOST       public hostname (public/tunnel) or LAN name(s), comma separated
#   TUNNEL_TOKEN        Cloudflare Tunnel token (tunnel mode)
#   LOG_BOOK_VERSION    image tag to pin, e.g. 0.1.0        (default: latest)
#   LOG_BOOK_REF        git ref the files are downloaded from (default: main)
#   LOG_BOOK_RECONFIGURE=1  ask the questions again although .env exists
#   LOG_BOOK_NO_START=1     write the files only, don't start anything
#
# Source: scripts/install.sh in the repository below. The hosted site serves this exact file at
# https://log-book.app/install.sh (src/routes/install.sh/+server.ts inlines it at build time).
set -euo pipefail

# ---- where the files come from -----------------------------------------------------------------
REPO="MarthinusBosman/log-book"
REF="${LOG_BOOK_REF:-main}"
RAW="${LOG_BOOK_RAW:-https://raw.githubusercontent.com/${REPO}/${REF}}"
FILES="docker-compose.yml .env.example deploy/Caddyfile.public deploy/Caddyfile.lan deploy/Caddyfile.lan-http"

# ---- helpers -----------------------------------------------------------------------------------
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die() {
	printf '\033[31mError: %s\033[0m\n' "$*" >&2
	exit 1
}

# Questions come from the terminal even when the script itself arrives on stdin (curl | bash).
TTY=""
if [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; then TTY=/dev/tty; fi

# ask VAR "Question" "default"
ask() {
	local __var=$1 __q=$2 __def=${3:-} __ans=""
	if [ -z "$TTY" ]; then
		[ -n "$__def" ] || die "no terminal to ask \"$__q\" — set it via environment variables (see the top of this script)"
		__ans=$__def
	else
		if [ -n "$__def" ]; then printf '%s [%s]: ' "$__q" "$__def" >"$TTY"; else printf '%s: ' "$__q" >"$TTY"; fi
		IFS= read -r __ans <"$TTY" || true
		[ -n "$__ans" ] || __ans=$__def
	fi
	printf -v "$__var" '%s' "$__ans"
}

random_secret() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex 32
	else
		od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
	fi
}

# env_get KEY → value of an uncommented KEY=… line in .env (empty if missing)
env_get() {
	awk -v k="$1" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END { print v }' .env
}

# env_set KEY VALUE → replace `KEY=…` or `# KEY=…` in .env, or append it
env_set() {
	local tmp
	tmp=$(mktemp "${TMPDIR:-/tmp}/log-book-env.XXXXXX")
	awk -v k="$1" -v v="$2" '
		!done && (index($0, k "=") == 1 || $0 ~ "^#[ ]*" k "=") { print k "=" v; done = 1; next }
		{ print }
		END { if (!done) print k "=" v }
	' .env >"$tmp"
	cat "$tmp" >.env
	rm -f "$tmp"
}

# env_secret KEY → generate only if not set yet (never replaces an existing secret)
env_secret() {
	if [ -z "$(env_get "$1")" ]; then
		env_set "$1" "$(random_secret)"
		info "generated $1"
	else
		info "kept existing $1"
	fi
}

lan_ip() {
	local ip=""
	if command -v hostname >/dev/null 2>&1; then ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true; fi
	if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
		ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}') || true
	fi
	printf '%s' "$ip"
}

# ---- steps -------------------------------------------------------------------------------------
check_docker() {
	command -v docker >/dev/null 2>&1 ||
		die "Docker is not installed. Install it first: https://docs.docker.com/engine/install/ (Raspberry Pi / Debian / Ubuntu: curl -fsSL https://get.docker.com | sh)"
	docker compose version >/dev/null 2>&1 ||
		die "the Docker Compose plugin is missing (\`docker compose\`). Install docker-compose-plugin: https://docs.docker.com/compose/install/linux/"
	if [ -z "${LOG_BOOK_NO_START:-}" ] && ! docker info >/dev/null 2>&1; then
		die "can't talk to the Docker daemon. Is it running? If it's a permissions problem, add yourself to the docker group (sudo usermod -aG docker \"\$USER\", then log out and in) or run this installer with sudo."
	fi
}

download() {
	local f
	mkdir -p deploy
	for f in $FILES; do
		curl -fsSL "$RAW/$f" -o "$f.download" || die "download failed: $RAW/$f"
		mv "$f.download" "$f"
	done
	info "downloaded docker-compose.yml, .env.example and deploy/Caddyfile.* from $RAW"
}

choose_mode() {
	MODE=${LOG_BOOK_MODE:-}
	if [ -z "$MODE" ]; then
		bold "How will people reach Log-Book?"
		info "1) public    — your own domain on the internet (ports 80/443 open, Let's Encrypt)"
		info "2) tunnel    — your own domain through Cloudflare Tunnel (no open ports, works behind CGNAT)"
		info "3) lan       — dropzone WiFi only, HTTPS (each staff device installs a certificate once)"
		info "4) lan-http  — dropzone WiFi only, plain HTTP (simplest; use a WiFi with a password)"
		[ -n "$TTY" ] || die "no terminal: set LOG_BOOK_MODE=public|tunnel|lan|lan-http"
		ask MODE "Choose 1-4" "3"
	fi
	case $MODE in
	1 | public | https) MODE=public ;;
	2 | tunnel) MODE=tunnel ;;
	3 | lan) MODE=lan ;;
	4 | lan-http) MODE=lan-http ;;
	*) die "unknown mode \"$MODE\" (public, tunnel, lan or lan-http)" ;;
	esac
}

configure() {
	local host ip token names
	ip=$(lan_ip)
	case $MODE in
	public | tunnel)
		host=${LOG_BOOK_HOST:-}
		[ -n "$host" ] || ask host "Public hostname (e.g. manifest.mydz.co.za)" ""
		[ -n "$host" ] || die "a hostname is needed for $MODE mode"
		host=${host#http://}
		host=${host#https://}
		host=${host%%/*}
		env_set ORIGIN "https://$host"
		env_set APP_BIND 127.0.0.1
		if [ "$MODE" = public ]; then
			env_set COMPOSE_PROFILES https
			env_set DOMAIN "$host"
			env_set PROTOCOL_HEADER x-forwarded-proto
			env_set HOST_HEADER x-forwarded-host
			env_set ADDRESS_HEADER x-forwarded-for
			env_set XFF_DEPTH 1
		else
			env_set COMPOSE_PROFILES tunnel
			env_set ADDRESS_HEADER cf-connecting-ip
			token=${TUNNEL_TOKEN:-$(env_get TUNNEL_TOKEN)}
			if [ -z "$token" ]; then
				info "Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared)."
				info "Public hostname: $host → service HTTP, URL app:3000. Copy the token after --token."
				ask token "Tunnel token (leave empty to add TUNNEL_TOKEN to .env later)" "-"
				[ "$token" = "-" ] && token=""
			fi
			[ -z "$token" ] || env_set TUNNEL_TOKEN "$token"
		fi
		URL="https://$host"
		;;
	lan | lan-http)
		names=${LOG_BOOK_HOST:-}
		if [ -z "$names" ]; then
			if [ -n "$TTY" ]; then
				ask names "LAN name(s) people will type, comma separated" "logbook.internal${ip:+, $ip}"
			else
				names="logbook.internal${ip:+, $ip}"
			fi
		fi
		env_set ORIGIN ""
		env_set PROTOCOL_HEADER x-forwarded-proto
		env_set HOST_HEADER x-forwarded-host
		env_set APP_BIND 127.0.0.1
		if [ "$MODE" = lan ]; then
			env_set COMPOSE_PROFILES lan
			env_set LAN_HOSTS "$names"
			URL="https://${names%%,*}"
		else
			env_set COMPOSE_PROFILES lan-http
			URL="http://${names%%,*}"
		fi
		;;
	esac
	env_set LOG_BOOK_URL "$URL"
}

start() {
	bold "Starting Log-Book (docker compose pull && docker compose up -d)"
	docker compose pull
	docker compose up -d
	local port i
	port=$(env_get PORT)
	port=${port:-3000}
	printf '  waiting for the app'
	for i in $(seq 1 45); do
		if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
			printf ' ok\n'
			return 0
		fi
		printf '.'
		sleep 2
		[ "$i" = 45 ] && printf '\n'
	done
	warn "the app didn't answer on port $port yet; check: cd $DIR && docker compose logs app"
}

summary() {
	local profile ip
	profile=$(env_get COMPOSE_PROFILES)
	ip=$(lan_ip)
	echo
	bold "Log-Book is installed in $DIR"
	info "Open: $URL"
	case $profile in
	https) info "Needs DNS for ${URL#https://} pointing at this server's public IP and ports 80 + 443 forwarded. Caddy gets the certificate on the first visit (docker compose logs caddy)." ;;
	tunnel) [ -n "$(env_get TUNNEL_TOKEN)" ] || warn "TUNNEL_TOKEN is empty: add it to $DIR/.env, then run: docker compose up -d" ;;
	lan) info "Staff devices: install the certificate once from http://${ip:-<server-ip>}/ca.crt (docs: Self-host guide → Dropzone WiFi only)." ;;
	lan-http) info "The name must resolve to this server (router/Pi-hole DNS, or use http://${ip:-<server-ip>})." ;;
	esac
	echo
	bold "First login"
	info "1. Open $URL, press Sign up and create your own account."
	info "2. Create the dropzone from the switcher (New dropzone): whoever creates it is its owner."
	info "3. Add aircraft and the pricelist, then give staff their roles in Settings → Members & roles."
	echo
	bold "Later"
	info "Update:  cd $DIR && docker compose exec app bun scripts/backup.ts && docker compose pull && docker compose up -d"
	info "Backups: docker compose exec app bun scripts/backup.ts   (copy /data/backups off the machine)"
	info "Logs:    docker compose logs -f app"
	info "Keep a copy of $DIR/.env with your backups (SECRETS_KEY decrypts saved payment keys)."
}

main() {
	bold "Log-Book installer"
	check_docker
	DIR=${LOG_BOOK_DIR:-./log-book}
	mkdir -p "$DIR"
	cd "$DIR"
	DIR=$(pwd)
	download

	local fresh=1
	if [ -f .env ]; then
		fresh=0
		info "found existing $DIR/.env: keeping it (secrets are never replaced)"
	else
		cp .env.example .env
		chmod 600 .env
	fi

	URL=$(env_get LOG_BOOK_URL)
	local reconf=${LOG_BOOK_RECONFIGURE:-}
	if [ "$fresh" = 0 ] && [ -z "$reconf" ] && [ -z "${LOG_BOOK_MODE:-}" ]; then
		if [ -n "$TTY" ]; then
			ask reconf "Change how people reach it (domain/tunnel/LAN)? y/n" "n"
			case $reconf in y | Y | yes) ;; *) reconf="" ;; esac
		fi
		[ -n "$URL" ] || reconf=1 # .env without our settings (e.g. hand-made): ask
	fi
	if [ "$fresh" = 1 ] || [ -n "$reconf" ] || [ -n "${LOG_BOOK_MODE:-}" ]; then
		choose_mode
		configure
	fi

	env_secret SECRETS_KEY
	env_secret CRON_SECRET
	[ -z "${LOG_BOOK_VERSION:-}" ] || env_set LOG_BOOK_VERSION "$LOG_BOOK_VERSION"

	if [ -n "${LOG_BOOK_NO_START:-}" ]; then
		info "LOG_BOOK_NO_START set: not starting. Run: cd $DIR && docker compose up -d"
	else
		start
	fi
	summary
}

main "$@"
