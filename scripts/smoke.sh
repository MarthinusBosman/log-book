set -u
B=${BASE:-http://localhost:4317}
J=$(mktemp)
H="-H Origin:$B -H Accept:text/html"
sleep 2
echo "== health"; curl -s $B/api/health; echo
echo "== landing"; curl -s -o /dev/null -w "%{http_code}\n" $B/
echo "== /app unauth"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $B/app
EMAIL="pilot$RANDOM@example.com"
echo "== signup $EMAIL"; curl -s -c $J -b $J $H -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST $B/signup -d "name=Test Pilot&email=$EMAIL&password=blue-skies-123"
grep session $J | awk '{print "cookie:", $6, "httponly?", ($1 ~ /HttpOnly/)}'
echo "== /app authed"; curl -s -b $J $B/app | grep -o 'data-testid="dashboard-heading"[^<]*' | head -1
echo "== logout"; curl -s -c $J -b $J $H -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST $B/logout -d ""
echo "== /app after logout"; curl -s -b $J -o /dev/null -w "%{http_code} %{redirect_url}\n" $B/app
echo "== bad login"; curl -s -c $J -b $J $H -X POST $B/login -d "email=$EMAIL&password=wrong-pass" -o /dev/null -w "%{http_code}\n"
echo "== login"; curl -s -c $J -b $J $H -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST $B/login -d "email=$EMAIL&password=blue-skies-123"
echo "== create dz"; curl -s -c $J -b $J $H -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST $B/app/dropzones/new -d "name=Skydive Test $RANDOM&country=ZA&currency=ZAR&timezone=Africa/Johannesburg"
echo "== dashboard w/ dz"; curl -s -b $J $B/app | grep -o 'Open for jumping\|Loads / Manifest' | sort -u
echo "== staff page"; curl -s -b $J -o /dev/null -w "%{http_code}\n" $B/app/manifest
echo "== csrf (no origin)"; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/login -H "Content-Type: application/x-www-form-urlencoded" -H "Origin: https://evil.example" -d "email=a&password=b"
echo "== forgot"; curl -s $H -o /dev/null -w "%{http_code}\n" -X POST $B/forgot-password -d "email=$EMAIL"
rm -f $J
