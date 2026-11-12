# PASA fixture responses

Synthetic responses with the same markup as PASA's public members directory
(https://www.para.co.za/Members), captured November 2026. **All names, numbers, licences and
dropzones are made up**; no real member data is stored here.

- `member-details.html`: `GET /Members/GetMemberViewDetails?PASANo=9001` (member with ratings)
- `member-details-no-ratings.html`: same endpoint, member without ratings (and an HTML entity in the name)
- `access-denied.html`: same endpoint for an unknown number (PASA answers HTTP 200 with this page)
- `member-list.html`: `GET /Members/MemberListPartialView?ratingUniqueId=0&licenceId=0&dropZoneId=0`
  (61 synthetic rows in two dropzone panels; 9001 is listed = current, 9002 is not = lapsed)
