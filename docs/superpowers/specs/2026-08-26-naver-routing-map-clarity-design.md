# Naver routing, default map, and travel-label clarity design

Date: 2026-08-26

## Goal

Make ParkPick Seoul use NAVER as its only active map and driving-route provider. Show a real NAVER map before a destination is selected, replace misleading distance-based car estimates with NAVER Directions 5 traffic-aware routes for the three recommended parking lots, draw the selected route on the map, make every time and distance label state exactly which leg it describes, and add privacy-friendly `TODAY / 30 DAYS` visitor counts to the footer without a new database.

## Product decisions

- NAVER Web Dynamic Map is the only visible and active map provider.
- Kakao map, navigation, route, and place-search code remains in the repository for a possible future reactivation, but no Kakao tab, CTA, missing-key message, SDK load, API request, or runtime selection is exposed in this release.
- NAVER Directions 5 is the authoritative source for driving time, driving distance, route geometry, and congestion sections.
- Browser geolocation behavior stays opt-in. The page must not trigger a location permission prompt on mount.
- Walking time remains an estimate because NAVER Directions 5 provides car routes only. The UI must say that it is the parking-to-destination leg and that it is approximate.
- Parking lots without Seoul Parking Portal realtime occupancy remain eligible. The UI must explain that the source does not provide realtime vacancy for that lot.

## NAVER credentials and console setup

Keep the existing public Web Dynamic Map identifier in `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID`. Reuse the existing server-only credential names `NAVER_MAP_NCP_KEY_ID` and `NAVER_MAP_NCP_CLIENT_SECRET` for Directions 5 and NAVER geocoding. Never put the secret in a `NEXT_PUBLIC_*` variable, source file, test fixture, log, commit, or client response.

Enable both Web Dynamic Map and Directions 5 for the same NAVER Cloud application. Configure the same server-side secret in local `.env.local` and Vercel Production/Preview/Development environments. The secret is deployment configuration and is not committed.

If the exposed secret is rotated later, only environment configuration changes; no source change is required.

## Default map behavior

`MapPanel` derives its center in this order:

1. selected destination;
2. selected/current origin;
3. Seoul City Hall fallback coordinate.

When an origin exists but no destination exists, load a real NAVER map centered at the origin, place the origin marker, and keep a useful street-level zoom. Do not require `destination` before loading the NAVER SDK. When neither point exists, show the real NAVER map centered on Seoul without markers.

The toolbar copy is contextual: origin-only state asks the user to choose a destination, while the result state names the destination area. Remove the Kakao and preview provider tabs from the rendered UI. Keep the existing preview renderer only as an error fallback when the NAVER SDK cannot load or authenticate. The active provider is always NAVER when the public key exists.

The place-search endpoint also stops calling Kakao. It uses the existing NAVER geocoding adapter first and the curated demo-place fallback second. The Kakao adapter file remains dormant for future use.

## Driving-route data flow

### Candidate strategy

NAVER Directions 5 returns one chosen route per request rather than a route matrix. Calling it for every parking lot would be slow and waste quota. Limit each recommendation search to at most three Directions calls:

- AUTO mode: use the same nearest three destination-area lots that the existing domain selection uses.
- MANUAL mode: make a preliminary estimate-based ranking, select the top three candidates, then fetch NAVER routes for only those candidates.
- Perform the three independent requests concurrently with a bounded timeout.
- Freeze shortlist membership before the NAVER calls, then re-score and order only those three routed candidates. Never re-run final scoring over every lot, because an unrouted lot could re-enter the displayed result.

This gives accurate displayed cards with at most three Directions calls per user search. The NAVER free allowance is currently 60,000 Directions 5 calls per representative account per month, which corresponds to roughly 20,000 three-card searches before paid usage.

### Server adapter

Add a server-only NAVER Directions adapter that calls the current official `https://maps.apigw.ntruss.com/map-direction/v1/driving` endpoint with:

- `start={origin.longitude},{origin.latitude}`
- `goal={parking.longitude},{parking.latitude}`
- `option=trafast`
- `x-ncp-apigw-api-key-id` from `NAVER_MAP_NCP_KEY_ID`
- `x-ncp-apigw-api-key` from `NAVER_MAP_NCP_CLIENT_SECRET`

Require both HTTP success and response `code === 0`. Parse `summary.duration` as milliseconds and round up to whole minutes. Preserve `summary.distance` in meters. Convert every path tuple from `[longitude, latitude]` to the application's `{ longitude, latitude }` coordinate shape. Preserve valid congestion sections with their path index range and congestion code. If time and distance are valid but geometry is missing or has more than 2,500 points, keep the real summary and omit the route line instead of returning malformed or oversized geometry.

Extend `RouteEstimate.source` with `NAVER_DIRECTIONS`. The recommendation returned to the browser may contain route geometry and congestion sections, but never credentials or raw response metadata.

### Failure behavior

A failed, timed-out, malformed, or unconfigured Directions request must not fail the whole parking recommendation request. Use the current distance estimate for that parking lot and set `routeSource` to `ESTIMATE`. Do not invent a road polyline for fallback estimates. The corresponding card must say `거리 기반 추정` and the map must show markers without a route line for that card.

Log only a concise server-side failure category and status. Do not log request headers, secrets, or complete upstream response bodies. Do not automatically retry, because retries would multiply latency and quota usage.

## Route rendering

Draw only the active recommendation's `origin → parking` route on the NAVER map. Use NAVER `Polyline` overlays and include route geometry in initial bounds along with the origin, active parking lot, destination, and recommendation markers.

Render a neutral base route and overlay valid congestion sections using consistent traffic colors:

- code `1` smooth: green;
- code `2` slow: orange;
- code `3` congested: red;
- code `0` or uncovered path portions: neutral blue/gray.

Section index ranges are clamped to the original path and adjacent segments share their boundary point so no visual gap appears. Changing the active card removes the previous polylines and replaces them with that card's route. Provider changes and component unmount also remove overlays. The line is informational; the existing NAVER Map navigation button remains the handoff for full turn-by-turn navigation.

## Clear travel and availability labels

In each `ParkingCard`:

- Driving heading: `주차장까지 자동차`
- Successful NAVER helper: `출발지 → 주차장 · 현재 교통 기준`
- Estimated fallback helper: `출발지 → 주차장 · 거리 기반 추정`
- Walking heading: `목적지까지 도보`
- Walking helper: `주차장 → 목적지 · 약 {distance}m`

The driving value therefore means time from the selected origin/current position to the parking lot. The walking value means estimated time from that parking lot to the selected destination.

For `realtimeSupported === false`, keep `확인 불가` and `데이터 부족`, and add the explicit explanation `서울 주차 포털에서 이 주차장의 실시간 빈자리를 제공하지 않습니다.` Do not imply that refreshing will produce a live value.

## Form copy and layout

- Rename `도착 예정` to `도착 예정시간`.
- Rename `예상 체류` to `예상 체류 시간`.
- Keep the datetime input, `지금` button, and duration select in one row where space allows.
- Give the `지금` button a nonshrinking width and `white-space: nowrap` so the two Korean characters never stack vertically.
- On narrow screens, preserve a readable form without horizontal overflow; the datetime field may shrink before the button.

## GPS boundary

Keep `enableHighAccuracy: true` and the existing user-triggered `getCurrentPosition` flow. Do not add automatic permission prompts or background tracking. The browser-reported accuracy remains visible. Desktop Wi-Fi/IP location can remain hundreds of meters wide because the browser and device control the actual sensor result.

## Visitor statistics

Use Vercel Web Analytics rather than a new database. Add the official `@vercel/analytics` Next.js component so production page views are collected anonymously without cookies. Vercel identifies visitors with a daily-reset hash, so the displayed values are privacy-friendly aggregated visitors rather than stable cross-day identities.

Add a server-only visit-stats adapter and API route that call `https://api.vercel.com/v1/query/web-analytics/visits/aggregate` with a server-side `VERCEL_ANALYTICS_TOKEN`, Vercel's system `VERCEL_PROJECT_ID`, `VERCEL_ANALYTICS_TEAM_ID`, `environment eq 'production'`, and explicit time ranges. Never expose the token to the browser. Use Asia/Seoul boundaries represented as ISO timestamps:

- `TODAY`: query `by=hour` and sum the `visitors` buckets from Seoul midnight through the request time.
- `30 DAYS`: query `by=day` and sum `visitors` buckets from Seoul midnight 29 days ago through the request time.

Because Vercel's anonymous visitor hash resets daily, `30 DAYS` means the sum of daily unique visitors, not a deduplicated 30-day person count. State this in accessible helper text or a tooltip. Do not display a realtime-active-users number.

Cache the public counts for five minutes to avoid turning each page view into repeated Analytics API traffic. If analytics is disabled, credentials are missing, the reporting API fails, or no rows exist yet, return an unavailable state and omit the counter block rather than showing fake zeros or breaking the page. Local development does not emit production analytics and may legitimately hide the counters.

Place a two-cell statistics cluster in the existing dark footer between the ParkPick brand and the disclaimer. Each cell shows its English label (`TODAY`, `30 DAYS`) above the Korean-formatted visitor number and `명`. Desktop keeps the footer content on one line; mobile moves the statistics cluster to its own full-width row. The cluster is informational and must not delay the rest of the page.

## Focused verification

Avoid broad presentation snapshots. Add only tests that protect the changed behavior:

1. NAVER Directions adapter parses duration, distance, path, and congestion and sends the required headers without exposing them in output.
2. Directions failure produces an estimate fallback rather than a failed recommendation, and exactly the frozen three IDs are queried.
3. `MapPanel` loads NAVER with origin only and uses origin-centered single-point zoom; no destination is required.
4. `MapPanel` draws the active NAVER route and traffic segments, and replaces and cleans them up when the active card changes.
5. No Kakao tab, CTA, SDK script, place request, or route request is reachable from the current UI and API composition.
6. `ParkingCard` states both travel legs and the realtime-unsupported explanation.
7. The planner renders the two renamed labels and a horizontal `지금` control.
8. The visit-stats adapter maps the TODAY and 30 DAYS ranges, hides unavailable results, and never serializes `VERCEL_ANALYTICS_TOKEN`; do not duplicate Vercel's own analytics logic in browser tests.

Reuse the existing Vitest, Testing Library, and `tests/MapPanel.naver.test.tsx` NAVER SDK mock patterns. Existing domain, API, navigation, and result-transition tests remain regression coverage. Run focused tests first, then typecheck, the full test suite, and production build.

## Delivery

1. Commit and push this design separately with `Done` and `Remaining` in the commit body.
2. Write and review a focused implementation plan.
3. Implement in small MiniMax M3 tasks with thinking disabled; use GPT-5.6 Codex agents for risk-based review.
4. Commit and push cohesive implementation checkpoints with `Done` and `Remaining` in every commit body.
5. Add the server-only NAVER and Vercel access tokens to local and Vercel environments, enable Directions 5 and Web Analytics in their consoles, deploy production, and verify both local and public behavior.

## Authoritative references

- NAVER Directions 5: https://api.ncloud-docs.com/docs/en/ai-naver-mapsdirections-driving
- NAVER Maps common authentication headers: https://api.ncloud-docs.com/docs/en/application-maps-overview
- NAVER Web Dynamic Map JavaScript API: https://navermaps.github.io/maps.js.ncp/docs/
- NAVER Polyline overlay: https://navermaps.github.io/maps.js.ncp/docs/tutorial-4-Shape.html
- NAVER Maps pricing: https://www.ncloud.com/product/applicationService/maps
- W3C Geolocation API: https://www.w3.org/TR/geolocation/
- Vercel Web Analytics API: https://vercel.com/docs/analytics/web-analytics-api
- Vercel Web Analytics limits and pricing: https://vercel.com/docs/analytics/limits-and-pricing
