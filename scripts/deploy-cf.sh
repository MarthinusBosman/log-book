#!/usr/bin/env bash
# Deploy the hosted instance to Cloudflare Workers + D1 (config: wrangler.jsonc).
#
#   bash scripts/deploy-cf.sh            # DRY RUN: build, show pending migrations, `wrangler deploy --dry-run`
#   bash scripts/deploy-cf.sh --yes      # real deploy: apply D1 migrations (--remote) + wrangler deploy
#
# Options:
#   --yes            actually change remote resources (otherwise nothing remote is modified)
#   --skip-build     reuse the existing .svelte-kit/cloudflare output
#   --skip-migrate   don't touch D1 (code-only deploy)
#
# Prereqs: `bunx wrangler login` (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID), the D1 database
# from wrangler.jsonc, and secrets set once with `bunx wrangler secret put SECRETS_KEY` (docs/DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."

YES=0; BUILD=1; MIGRATE=1
for arg in "$@"; do
	case "$arg" in
		--yes|-y) YES=1 ;;
		--skip-build) BUILD=0 ;;
		--skip-migrate) MIGRATE=0 ;;
		-h|--help) sed -n '2,15p' "$0"; exit 0 ;;
		*) echo "unknown option: $arg" >&2; exit 2 ;;
	esac
done

export CI=true # non-interactive wrangler
WRANGLER=(bunx wrangler)
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

if [[ $YES -eq 0 ]]; then
	echo "DRY RUN — nothing remote will be changed. Re-run with --yes to deploy."
fi

if [[ $YES -eq 1 ]]; then
	step "wrangler auth"
	if ! "${WRANGLER[@]}" whoami 2>&1 | tee /dev/stderr | grep -qiE "associated with|logged in|account id"; then
		echo "Not logged in: run 'bunx wrangler login' or set CLOUDFLARE_API_TOKEN." >&2
		exit 1
	fi
fi

if [[ $BUILD -eq 1 ]]; then
	step "checks + build (DEPLOY_TARGET=cloudflare)"
	bun run check
	bun run build:cf
fi
[[ -f .svelte-kit/cloudflare/_worker.js ]] || { echo "no Cloudflare build found" >&2; exit 1; }

if [[ $MIGRATE -eq 1 ]]; then
	if [[ $YES -eq 1 ]]; then
		step "D1 migrations (remote)"
		"${WRANGLER[@]}" d1 migrations apply DB --remote
	else
		step "D1 migrations (skipped in dry run)"
		echo "would run: wrangler d1 migrations apply DB --remote   (unapplied files from drizzle/ only):"
		ls -1 drizzle/*.sql | sed 's/^/  /'
		echo "check what is pending with: bunx wrangler d1 migrations list DB --remote"
	fi
fi

if [[ $YES -eq 1 ]]; then
	step "wrangler deploy"
	"${WRANGLER[@]}" deploy
	step "done"
	echo "Check: curl -s https://<worker>.<subdomain>.workers.dev/api/health"
else
	step "wrangler deploy --dry-run (bundle check only)"
	"${WRANGLER[@]}" deploy --dry-run --outdir .wrangler/dry-run
	echo
	echo "Dry run OK. To deploy for real: bash scripts/deploy-cf.sh --yes"
fi
