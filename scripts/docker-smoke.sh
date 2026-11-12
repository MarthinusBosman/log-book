#!/usr/bin/env bash
# Smoke-test a built Log-Book image: start it on a throwaway volume, wait for the HEALTHCHECK, then
# check health, the landing page, signup + login cookie, the non-root user and the backup script.
#
#   bash scripts/docker-smoke.sh log-book:smoke          # used by .github/workflows/{ci,docker}.yml
#   SMOKE_BASE=http://localhost:3000 bash scripts/docker-smoke.sh   # HTTP checks only, no Docker
set -euo pipefail

IMAGE=${1:-}
PORT=${SMOKE_PORT:-3999}
NAME=log-book-smoke-$$
VOLUME=$NAME-data

fail() {
	echo "FAIL: $*" >&2
	if [ -n "$IMAGE" ]; then docker logs --tail 80 "$NAME" >&2 2>&1 || true; fi
	exit 1
}

cleanup() {
	if [ -n "$IMAGE" ]; then
		docker rm -f "$NAME" >/dev/null 2>&1 || true
		docker volume rm "$VOLUME" >/dev/null 2>&1 || true
	fi
}
trap cleanup EXIT

if [ -n "${SMOKE_BASE:-}" ]; then
	BASE=$SMOKE_BASE
	IMAGE=
elif [ -n "$IMAGE" ]; then
	BASE=http://127.0.0.1:$PORT
	docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" -v "$VOLUME:/data" \
		-e ORIGIN="$BASE" -e SECRETS_KEY=smoke-test-secrets-key-not-for-production "$IMAGE" >/dev/null
	echo "== waiting for HEALTHCHECK ($IMAGE)"
	status=starting
	for _ in $(seq 1 60); do
		status=$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo gone)
		[ "$status" = healthy ] && break
		[ "$status" = gone ] && fail "container exited"
		sleep 2
	done
	[ "$status" = healthy ] || fail "container not healthy after 120s (status: $status)"
	uid=$(docker exec "$NAME" id -u)
	[ "$uid" != 0 ] || fail "container runs as root"
	echo "ok   runs as uid $uid"
else
	echo "usage: $0 IMAGE   (or SMOKE_BASE=http://host:port $0)" >&2
	exit 2
fi

jar=$(mktemp)
trap 'rm -f "$jar"; cleanup' EXIT
expect() { # expect <label> <wanted-code> <curl args…>
	local label=$1 want=$2 got
	shift 2
	got=$(curl -s -o /dev/null -w '%{http_code}' "$@") || true
	[ "$got" = "$want" ] || fail "$label: HTTP $got (wanted $want)"
	echo "ok   $label ($got)"
}

health=$(curl -fsS "$BASE/api/health") || fail "/api/health unreachable"
case $health in *'"ok":true'*) echo "ok   /api/health $health" ;; *) fail "/api/health: $health" ;; esac
expect "landing page" 200 "$BASE/"
expect "/app redirects to login" 303 "$BASE/app"
email="smoke$RANDOM@example.com"
expect "signup" 303 -c "$jar" -b "$jar" -H "Origin: $BASE" -H 'Accept: text/html' \
	-X POST "$BASE/signup" --data-urlencode 'name=Smoke Test' --data-urlencode "email=$email" \
	--data-urlencode 'password=blue-skies-123'
grep -q session "$jar" || fail "no session cookie after signup"
expect "dashboard (signed in)" 200 -b "$jar" "$BASE/app"
expect "CSRF rejects foreign origin" 403 -X POST "$BASE/login" -H 'Origin: https://evil.example' \
	-H 'Content-Type: application/x-www-form-urlencoded' -d 'email=a&password=b'

if [ -n "$IMAGE" ]; then
	docker exec "$NAME" bun scripts/backup.ts >/dev/null || fail "backup script"
	docker exec "$NAME" sh -c 'ls /data/backups/app-*.db' >/dev/null || fail "no backup written"
	echo "ok   backup script"
fi
echo "smoke test passed"
