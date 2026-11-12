# Curl e2e for the manifest area against a running server seeded with `bun run db:seed -- --reset`.
# Usage: BASE=http://localhost:4401 DB=data/manifest.db bash scripts/smoke-manifest.sh
set -u
B=${BASE:-http://localhost:4401}
DB=${DB:-data/manifest.db}
J=$(mktemp)
A="-H Origin:$B -H Accept:application/json -H x-sveltekit-action:true"
q() { bun -e "import {Database} from 'bun:sqlite'; const d=new Database('$DB'); const r=d.query(process.argv[1]).get(); console.log(r ? Object.values(r)[0] : '')" "$1"; }
act() { # path action data...
	local p=$1 a=$2; shift 2
	local out; out=$(curl -s -b $J $A -X POST "$B$p?/$a" "$@")
	echo "$a: $(echo "$out" | head -c 260)"
}
DAY=$(date -d "+$((RANDOM % 600 + 30)) day" +%F)  # fresh day per run

echo "== unauth board"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $B/app/manifest
echo "== login manifest@"; curl -s -c $J -b $J -H "Origin: $B" -H 'Accept: text/html' -o /dev/null -w "%{http_code}\n" -X POST $B/login -d "email=manifest@demo.example&password=blue-skies-123"
echo "== board today"; curl -s -b $J -o /dev/null -w "%{http_code}\n" $B/app/manifest
echo "== board bad date"; curl -s -b $J -o /dev/null -w "%{http_code}\n" "$B/app/manifest?day=nope"
AC=$(q "select id from aircraft limit 1")
act /app/manifest createLoad -d "day=$DAY&aircraftId=$AC&pilotWeightKg=85&requirements=Smoke test&time=10:30&count=2"
L1=$(q "select l.id from loads l where day='$DAY' and load_number=1")
L2=$(q "select l.id from loads l where day='$DAY' and load_number=2")
echo "loads: $L1 $L2"
echo "== detail"; curl -s -b $J -o /dev/null -w "%{http_code}\n" $B/app/manifest/$L1
echo "== quote"; curl -s -b $J "$B/app/manifest/quote?jumpType=belly&extras=gear_rental"; echo
act /app/manifest setOpen -d "loadId=$L1&open=1"
act /app/manifest refuel -d "loadId=$L1&refuel=1"
act /app/manifest shutdown -d "loadId=$L1&minutes=15"
act /app/manifest shutdown -d "loadId=$L1&minutes=9999"
act /app/manifest shutdown -d "loadId=$L1"
J1=$(q "select c.user_id from checkins c join users u on u.id=c.user_id where c.checked_out_at is null limit 1 offset 10")
J2=$(q "select c.user_id from checkins c join users u on u.id=c.user_id where c.checked_out_at is null limit 1 offset 11")
act /app/manifest/$L1 addMembers -d "loadId=$L1&userId=$J1&userId=$J2&jumpType=belly&extras=gear_rental&skipWallet=on&asGroup=on&allowExpired=on"
act /app/manifest/$L1 addMembers -d "loadId=$L1&userId=$J1&jumpType=belly&skipWallet=on&allowExpired=on"
act /app/manifest/$L1 addCustom -d "loadId=$L1&displayName=Visiting Vera&weightKg=70&jumpType=freefly"
act /app/manifest/$L1 addCustom -d "loadId=$L1&displayName=Heavy Harry&weightKg=399&jumpType=belly"
act /app/manifest/$L1 updateLoad -d "loadId=$L1&weightLimitKg=200"
act /app/manifest/$L1 addCustom -d "loadId=$L1&displayName=Too Heavy&weightKg=90&jumpType=belly"
act /app/manifest/$L1 updateLoad -d "loadId=$L1&weightLimitKg=1600&capacity=4"
act /app/manifest/$L1 addCustom -d "loadId=$L1&displayName=No Room&weightKg=60&jumpType=belly"
act /app/manifest/$L1 updateLoad -d "loadId=$L1&capacity=16"
S=$(q "select id from slots where load_id='$L1' and display_name='Visiting Vera'")
act /app/manifest/$L1 updateSlot -d "slotId=$S&note=First visit&colour=%23ef4444&jumpType=freefly&extrasSent=1&extras=extra_altitude"
act /app/manifest/$L1 markPaid -d "slotId=$S&provider=cash"
act /app/manifest/$L1 moveSlot -d "slotId=$S&toLoadId=$L2"
act /app/manifest/$L2 removeSlot -d "slotId=$S"
TEAM=$(q "select id from teams limit 1")
act /app/manifest/$L1 addTeam -d "loadId=$L1&teamId=$TEAM&jumpType=belly&skipWallet=on&includeStaff=on&allowExpired=on"
for s in call cancelCall call board depart land complete; do act /app/manifest $s -d "loadId=$L1"; done
act /app/manifest deleteLoad -d "loadId=$L1"
act /app/manifest cancel -d "loadId=$L2"
act /app/manifest deleteLoad -d "loadId=$L2"
echo "== display"; curl -s -b $J -o /dev/null -w "%{http_code}\n" $B/app/display
SLUG=$(q "select slug from dropzones limit 1")
echo "== public display no token"; curl -s -o /dev/null -w "%{http_code}\n" $B/dz/$SLUG/display
echo "== public display bad token"; curl -s -o /dev/null -w "%{http_code}\n" "$B/dz/$SLUG/display?token=nope"
TOK=$(q "select json_extract(settings,'\$.displayToken') from dropzones where slug='$SLUG'")
if [ -n "$TOK" ]; then echo "== public display good token"; curl -s -o /dev/null -w "%{http_code}\n" "$B/dz/$SLUG/display?token=$TOK"; fi
echo "== dashboard"; curl -s -b $J $B/app | grep -o 'data-testid="staff-today"' | head -1

echo "== jumper@ (no manifest cap)"
curl -s -c $J -b $J -H "Origin: $B" -H 'Accept: text/html' -o /dev/null -X POST $B/logout -d ''
curl -s -c $J -b $J -H "Origin: $B" -H 'Accept: text/html' -o /dev/null -X POST $B/login -d "email=jumper@demo.example&password=blue-skies-123"
echo "board: $(curl -s -b $J -o /dev/null -w "%{http_code}" $B/app/manifest)"
L3=$(q "select id from loads where status not in ('completed','cancelled') limit 1")
act /app/manifest call -d "loadId=$L3"
echo "quote: $(curl -s -b $J -o /dev/null -w "%{http_code}" "$B/app/manifest/quote?jumpType=belly")"
rm -f $J
