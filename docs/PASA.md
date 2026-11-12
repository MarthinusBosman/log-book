# Association membership verification (PASA)

"Verify with PASA" on Profile → Credentials replaces the original app's "Connect to PASA".
Code: `src/lib/server/memberships/` (service, provider interface, PASA client), UI in
`src/lib/components/memberships/`.

## Where the data comes from

PASA's public members directory, <https://www.para.co.za/Members>. That page loads two HTML
fragments with jQuery, and we request exactly those (no login, nothing the page doesn't do):

| Request | Returns | Our use |
| --- | --- | --- |
| `GET /Members/GetMemberViewDetails?PASANo=<n>` | Modal: Name, PASA No., Drop Zone, Licence (e.g. `A8008`), Ratings (label → code, e.g. `Tandem : TM134 SG(E) ST(U) V(E)`). Unknown numbers: a "PASA - Access Denied" page with HTTP 200. | One lookup per member. |
| `GET /Members/MemberListPartialView?ratingUniqueId=0&licenceId=0&dropZoneId=0` | ~190 KB accordion of ~450 members per dropzone (surname, first name, PASA no., highest licence). The page notes "PASA membership expires annually on 31 March". | Numbers only, to tell current from lapsed. |

There's no expiry date, ID number or contact detail in either response. **Expiry is derived**:
on the list → current, expires the coming 31 March; not on the list (but the member page exists)
→ lapsed, expired the last 31 March. Older members who haven't renewed still resolve on the
details endpoint but aren't listed, which is why the list is the "paid-up" signal.

## Respectful use

- Identifying User-Agent: `Log-Book/1.0 (+https://log-book.app; association membership check …)`.
- Member pages cached 24 h (misses 6 h) in `provider_cache`; the members list at most once a day
  (a stale copy up to 7 days is used if PASA is down, retried hourly). Only PASA numbers from the list
  are stored, no names.
- ≥1 s between requests per process, a global budget of 120 live requests/hour, and a 20 s per-user
  cooldown between live lookups.
- Only the member's own number is looked up, when they ask (plus the daily re-check below).
- Failures never block anything: the manual credentials form and staff verification still work.

## Flow

1. Jumper enters their PASA number → preview card (name, number, licence, dropzone, ratings, status).
2. **Confirm & connect**: if the PASA name matches the profile name (surname + first name/initial),
   the profile gets association/number/expiry/licence, `association_verified_at`, and the PASA
   ratings as verified `user_ratings` (body `pasa`). Those fields are read-only while linked.
3. Name mismatch → `needs_review`; staff with check-in or staff rights confirm/decline it on the
   jumper page (not their own). The jumper is notified either way.
4. Re-check (hourly cron, `runScheduled`): links whose expiry is within 14 days/past, or last
   checked >30 days ago (those also refresh the member page). Lapsed → notification
   "PASA membership expired" (once) and the expiry passes, so manifest shows **PASA expired** on
   slots and the jumper sees the "PASA Expired" notice on check-in.

## Caveats

- Scraping a public HTML page: if PASA changes the markup the parser fails closed ("unavailable"),
  never guessing. Tests use synthetic fixtures with the real markup (`pasa/fixtures/`).
- "On the list = paid up" is inferred from the page, not documented by PASA. Around 1 April, if
  PASA leaves last season's members listed for a while, they'd be treated as renewed until removed.
- PASA Temp (3 months) memberships get the 31 March season end too.
- Throttling is per process/isolate; on Cloudflare the DB budget and caches are the real limits.
- USPA: the original used a USPA partner API (needs a partnership). `MembershipProvider` in
  `memberships/types.ts` is the extension point; USPA isn't implemented.
