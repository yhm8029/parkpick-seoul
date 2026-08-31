# Gyeonggi parking integration design

## Goal

Extend the existing ParkPick Seoul recommendation flow to include Gyeonggi public parking lots without renaming the product yet. Destinations near the Seoul-Gyeonggi boundary must consider candidates from both regions.

## Data sources

- Keep the existing Seoul parking providers unchanged.
- Add the Gyeonggi Traffic Information Center parking-place information API for coordinates, address, capacity, hours, and fees.
- Add the Gyeonggi parking-place availability API for current available spaces and observation time.
- Read the credential only from the server-side `GYEONGGI_GITS_API_KEY` environment variable. Never expose or commit the key.
- The supplied key is pending provider approval, so live validation is deferred. Fixtures model the documented XML contract until approval completes.

## Architecture

Create a Gyeonggi adapter under `lib/api` with separate XML parsing and normalization boundaries. Join basic and availability rows by `pkplcId`, then normalize them to the existing `ParkingLot` domain model with source `GYEONGGI_GITS`.

The recommendation route requests Seoul and Gyeonggi candidates concurrently with `Promise.allSettled`. Successful provider results are merged, deduplicated by source and source ID, distance-filtered against the destination, and passed through the existing ranking and routing pipeline. This deliberately avoids a hard administrative-boundary switch, so a destination near the border can receive the closest parking lot from either side.

One provider failure must not discard results from the other provider. If both providers fail, return the existing service-unavailable response. If a provider succeeds with zero nearby candidates, report an honest empty result rather than demo data.

## Gyeonggi normalization

- Require a non-empty `pkplcId`, name, valid WGS84 latitude/longitude, and positive capacity.
- Treat basic information as sufficient for recommendation eligibility.
- When a matching availability row exists, map `avblPklotCnt` to `availableSpaces`, clamp it to capacity, set `realtimeSupported` to true, and parse `ocrnDt` as the update time.
- When availability is missing or invalid, retain the lot with `realtimeSupported: false`, `availableSpaces: null`, and the existing `UNKNOWN` realtime UI status.
- Convert the documented basic/additional/daily fee fields into the existing `FeeRule`. Missing or invalid amounts remain unknown rather than being treated as free.
- Build a human-readable operating label from weekday, Saturday, and holiday fields when present.

## Caching and failure behavior

- Cache successful Gyeonggi basic information longer than availability because it changes slowly.
- Cache availability briefly and coalesce concurrent requests to avoid duplicate provider calls.
- Apply request timeouts and reject non-zero provider response codes.
- Do not cache errors or partial malformed responses.
- Notices identify which regional providers contributed data and which were temporarily unavailable without exposing credentials or raw upstream responses.

## UI and product scope

- Keep the visible name `ParkPick Seoul` and current repository/package names.
- Reuse existing parking cards, map markers, distance controls, and navigation handoff.
- Gyeonggi lots with no live row display the existing `실시간 미지원` label.
- Do not add a region selector; the destination and distance determine the candidates automatically.

## Verification

- Fixture tests for successful XML parsing, API error codes, malformed coordinates, fee normalization, and missing availability.
- Adapter test proving basic and availability rows join by `pkplcId` and that basic-only lots remain eligible.
- Route test proving Seoul and Gyeonggi providers are called concurrently, cross-border candidates are merged, and one-provider failure still returns the other provider's results.
- Existing recommendation, UI, and navigation tests remain unchanged unless the extended source union requires fixture updates.
- Final verification is limited to focused tests, typecheck, repository check, and production build.

## Deferred work

- Live Gyeonggi API verification after provider approval.
- Product rename from ParkPick Seoul to a wider regional brand.
- Persistent ingestion, historical occupancy, and municipality-specific enrichment.
