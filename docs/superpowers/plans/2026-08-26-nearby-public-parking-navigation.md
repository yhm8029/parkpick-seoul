# Nearby Public Parking and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recommend the nearest real Seoul public parking lots within an automatic or explicit distance, preserve the last applied map while editing, and open NAVER directions from the applied origin to the selected lot.

**Architecture:** Add one isolated server-only adapter for the Seoul parking portal and retain the documented Seoul Open API as an error fallback. Make distance eligibility a hard domain boundary before scoring. Keep draft form state separate from applied result state, and centralize NAVER URL construction in a pure tested module.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Vitest, Testing Library, native `fetch`/`URLSearchParams`.

---

## File map

- Create `lib/api/seoul-parking-nearby.ts`: validate, normalize, cache, and fetch destination-proximity parking data.
- Create `tests/fixtures/seoul/search-parking.sample.json`: sanitized portal response covering public/private and live/unsupported rows.
- Create `tests/seoul-parking-nearby.test.ts`: focused adapter contract test.
- Modify `lib/types.ts`: distance request/response contract and proximity source provenance.
- Modify `lib/domain/recommend.ts`: hard distance eligibility and effective automatic radius.
- Modify `tests/domain.test.ts`: regression for no remote fill and automatic radius.
- Modify `app/api/recommendations/route.ts`: proximity-first data selection, fallback, and response metadata.
- Modify `components/AppShell.tsx`: draft/applied state separation and distance controls.
- Modify `components/RecommendationPanel.tsx`: receive the applied origin.
- Modify `components/ParkingCard.tsx`: pass the applied origin to navigation.
- Modify `app/styles/planner.css`: compact AUTO/manual distance controls and retained-result notice.
- Modify `tests/AppShell.test.tsx`: stable editing and 50 m request contract.
- Create `lib/maps/navigation.ts`: pure NAVER mobile/Android/desktop URL builders and EPSG:3857 conversion.
- Modify `components/NavigationButtons.tsx`: use shared builders with explicit applied origin.
- Create `tests/navigation.test.ts`: focused origin/destination URL regression.

### Task 1: Seoul proximity adapter

**Files:**
- Create: `tests/fixtures/seoul/search-parking.sample.json`
- Create: `tests/seoul-parking-nearby.test.ts`
- Create: `lib/api/seoul-parking-nearby.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Add a sanitized fixture and failing adapter test**

The fixture envelope must be `{ "result_state": "0000", "res_value": { "parking_list_count": 7, "parking_list": [...] } }` and contain:

- one `NW` row with `capacity: "115"`, `cur_parking: "28"`, `que_status: "1"`, a current `cur_parking_time`, and valid `position_list[0].lat/lng`;
- one invalid-first duplicate of that `NW` row (same `parking_code` but `capacity: "0"` and distinct name/address) placed BEFORE the valid `NW` row to prove dedup happens after normalization, not before;
- one `NS` row with valid coordinates but `que_status: "0"`;
- one valid-coordinate public boundary row with numeric strings but malformed `que_status: "01"`, which must remain non-realtime;
- one `BS` row, which must be filtered;
- one `NW` tourist-bus-exclusive name, which must be filtered;
- one `NW` row with invalid zero coordinates, which must be filtered.

Write this behavioral test in `tests/seoul-parking-nearby.test.ts`:

```ts
const client = createNearbyParkingClient({
  fetchImpl: vi.fn(async () => Response.json(fixture)) as unknown as typeof fetch,
  now: () => new Date("2026-08-26T07:00:00+09:00").getTime(),
});
const result = await client.fetchNearby({ latitude: 37.4979, longitude: 127.0276 }, 1000);

expect(result.lots.map(lot => lot.sourceId)).toEqual(["B01-NS", "LIVE-NW", "STATIC-NS"]);
expect(result.lots[0]).toMatchObject({
  source: "SEOUL_PARKING_PORTAL",
  occupiedSpaces: 28,
  availableSpaces: 87,
  realtimeSupported: true,
});
expect(result.lots[1]).toMatchObject({
  occupiedSpaces: null,
  availableSpaces: null,
  realtimeUpdatedAt: null,
  realtimeSupported: false,
});
```

Also assert the POST body contains `LAT`, `LON`, `index=1`, `range=1000`, `Type=3`, and `Rule=1`.

- [ ] **Step 2: Run the adapter test and confirm RED**

Run: `npm test -- --run tests/seoul-parking-nearby.test.ts`

Expected: FAIL because `createNearbyParkingClient` and the new source type do not exist.

- [ ] **Step 3: Implement the minimal adapter**

In `lib/types.ts`, extend `ParkingLot["source"]` with `"SEOUL_PARKING_PORTAL"`.

In `lib/api/seoul-parking-nearby.ts`:

```ts
const ENDPOINT = "https://parking.seoul.go.kr/SearchParking.do";
const MAX_RANGE_METERS = 1_000;
const CACHE_TTL_MS = 2 * 60_000;
const LIVE_MAX_AGE_MS = 30 * 60_000;

export interface NearbyParkingClient {
  fetchNearby(destination: Coordinate, rangeMeters: number): Promise<{ lots: ParkingLot[]; notice: string }>;
}

export function createNearbyParkingClient(options: {
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): NearbyParkingClient;

export async function fetchNearbySeoulParking(
  destination: Coordinate,
  rangeMeters: number,
): Promise<{ lots: ParkingLot[]; notice: string }>;
```

Clamp and round `rangeMeters` to an integer from 1 through 1,000. POST `URLSearchParams` with the six fields tested above and an 8-second abort timeout. Require `result_state === "0000"`, an object `res_value`, and an array `parking_list`; otherwise throw.

Normalize only exact `parking_type` values `NS` and `NW`. De-duplicate by `parking_code`; exclude invalid Seoul coordinates, non-positive capacity, and names containing both `관광버스` and `전용`. Treat `cur_parking` as occupied count. Only expose occupancy when `que_status === "1"` and `cur_parking_time` is valid and 0–30 minutes old; otherwise set all occupancy/update fields to `null` and `realtimeSupported` to `false`. Use `new_juso || address`, the existing `parseSeoulDate`, and numeric fee fields.

Cache only fully validated successful values. Use a key containing a schema version, latitude/longitude rounded to four decimal places, and normalized range. Do not cache errors.

- [ ] **Step 4: Run the adapter test and confirm GREEN**

Run: `npm test -- --run tests/seoul-parking-nearby.test.ts`

Expected: PASS with the two public rows and the exact live/unsupported fields above.

- [ ] **Step 5: Commit Task 1**

```powershell
git add lib/types.ts lib/api/seoul-parking-nearby.ts tests/seoul-parking-nearby.test.ts tests/fixtures/seoul/search-parking.sample.json
git commit -m "feat: add nearby Seoul parking adapter"
```

### Task 2: Hard distance recommendation contract and API integration

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/domain/recommend.ts`
- Modify: `tests/domain.test.ts`
- Modify: `app/api/recommendations/route.ts`

- [ ] **Step 1: Write the failing domain regressions**

Replace the old `maxWalkMinutes` request field with the discriminated request contract:

```ts
type DistanceSelection =
  | { distanceMode: "AUTO" }
  | { distanceMode: "MANUAL"; maxDistanceMeters: number };

export type RecommendationRequest = RecommendationRequestBase & DistanceSelection;
```

Add tests that assert:

```ts
const manual = { ...requestBase, distanceMode: "MANUAL" as const, maxDistanceMeters: 300 };
const result = recommendParking(
  [lot("near", 2, 37.5015), lot("far-rich", 90, 37.53)],
  manual,
  [],
  now,
);
expect(result.recommendations.map(item => item.id)).toEqual(["near"]);
expect(result.effectiveDistanceMeters).toBe(300);
```

and:

```ts
const automatic = recommendParking(
  [lot("a", 1, 37.5012), lot("b", 1, 37.502), lot("c", 1, 37.503), lot("d", 99, 37.504)],
  { ...requestBase, distanceMode: "AUTO" },
  [],
  now,
);
expect(automatic.recommendations.map(item => item.id).sort()).toEqual(["a", "b", "c"]);
expect(automatic.effectiveDistanceMeters).toBeGreaterThan(0);
expect(automatic.effectiveDistanceMeters! % 50).toBe(0);
```

- [ ] **Step 2: Run the domain test and confirm RED**

Run: `npm test -- --run tests/domain.test.ts`

Expected: FAIL because the current function returns an array, requires `maxWalkMinutes`, and reintroduces remote candidates.

- [ ] **Step 3: Implement distance selection before scoring**

Add to `RecommendationResponse`:

```ts
distanceMode: "AUTO" | "MANUAL";
effectiveDistanceMeters: number | null;
```

Change `recommendParking()` to return:

```ts
export interface RankedParkingResult {
  recommendations: ParkingRecommendation[];
  effectiveDistanceMeters: number | null;
}
```

Build the valid-distance list once. For `AUTO`, hard-filter at 1,000 m, sort by exact distance then `sourceId`, and take the nearest three before scoring. For `MANUAL`, hard-filter at the clamped `maxDistanceMeters`, score eligible candidates, and take at most three afterward. Delete the branch that falls back to all lots and delete the `maxWalkMinutes` penalty. AUTO's effective distance is the farthest selected exact distance rounded up to 50 m, or `null`; MANUAL's is the selected limit even when zero candidates match.

- [ ] **Step 4: Run the domain test and confirm GREEN**

Run: `npm test -- --run tests/domain.test.ts`

Expected: PASS; no result outside the hard range.

- [ ] **Step 5: Integrate the proximity source in the route**

Parse only these valid forms:

```ts
const distanceMode = value.distanceMode === "MANUAL" ? "MANUAL" : "AUTO";
const distance = Math.round(clamp(Number(value.maxDistanceMeters) || 1_000, 50, 1_000) / 50) * 50;
```

Omit `maxDistanceMeters` for AUTO. Query `fetchNearbySeoulParking(destination, distanceMode === "AUTO" ? 1_000 : distance)`. A valid empty response remains LIVE and is not replaced. On timeout/HTTP/envelope/schema failure, try `fetchSeoulParkingLots()` only when `SEOUL_OPEN_API_KEY` exists; apply the same domain hard filter. If both live sources fail, return a non-200 error with an honest Korean message rather than demo lots. Construct the response from the `RankedParkingResult` and include its effective distance.

Limit Kakao route requests to valid candidates inside the active hard boundary. Do not log response bodies or keys.

- [ ] **Step 6: Run focused contract checks**

Run: `npm test -- --run tests/domain.test.ts tests/seoul-parking-nearby.test.ts; npm run typecheck`

Expected: both files PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit Task 2**

```powershell
git add lib/types.ts lib/domain/recommend.ts tests/domain.test.ts app/api/recommendations/route.ts
git commit -m "fix: enforce nearby parking distance"
```

### Task 3: Stable draft editing and distance UI

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `components/RecommendationPanel.tsx`
- Modify: `components/ParkingCard.tsx`
- Modify: `app/styles/planner.css`

- [ ] **Step 1: Write the failing stable-edit test**

Update the fixture response with `distanceMode: "AUTO"` and `effectiveDistanceMeters: 450`. Make the `MapPanel` mock expose the recommendation count. Add a test that submits once, clicks `조건 변경`, switches to manual, changes the range to 500, and asserts:

```ts
expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
expect(screen.getByLabelText("최대 거리")).toHaveProperty("step", "50");
```

Submit again and inspect the second `fetch` body:

```ts
expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
  distanceMode: "MANUAL",
  maxDistanceMeters: 500,
});
```

The test must also confirm that moving the slider does not abort or remove the retained map result.

- [ ] **Step 2: Run the UI test and confirm RED**

Run: `npm test -- --run tests/AppShell.test.tsx`

Expected: FAIL because the UI still has maximum walk minutes and clears `result` during editing.

- [ ] **Step 3: Implement draft/applied state separation**

Add state with these responsibilities:

```ts
const [distanceMode, setDistanceMode] = useState<"AUTO" | "MANUAL">("AUTO");
const [manualDistance, setManualDistance] = useState(1_000);
const [editing, setEditing] = useState(false);
const [appliedOrigin, setAppliedOrigin] = useState<Place | null>(null);
const [retainedResult, setRetainedResult] = useState(false);
```

Replace `invalidateResult()` with a request-cancel helper that aborts only in-flight work and leaves the last result and active marker intact. Render the control card when `!result || editing`, but keep `result.recommendations` on `MapPanel`. While a result exists, render the map with `appliedOrigin` and `result.destination`, never the draft origin/destination.

On a non-empty successful response, atomically set the result, snapshot the current origin into `appliedOrigin`, leave editing mode, and preserve `activeId` only when it exists in the new list. On a successful empty response, set the empty result, clear `activeId`, snapshot the origin, remain in editing mode, and show `선택한 거리 안에서 공영주차장을 찾지 못했습니다.` On fetch/schema failure, keep the old result, set `retainedResult` when one exists, remain editing, and show that the map is displaying the previous result. Ignore aborted/superseded requests.

Replace the walk slider with AUTO/manual controls. AUTO shows `가까운 공영주차장 3곳 자동 탐색`; manual shows a range input labeled `최대 거리`, `min=50`, `max=1000`, and `step=50`. The first switch from AUTO uses the last response's effective radius when present; otherwise 1,000 m. Later toggles preserve the last manual value. Slider changes only draft state.

Pass `appliedOrigin` through `RecommendationPanel` and `ParkingCard`; leave its final use to Task 4.

- [ ] **Step 4: Run the UI test and confirm GREEN**

Run: `npm test -- --run tests/AppShell.test.tsx`

Expected: PASS with retained map count and a 50 m manual request.

- [ ] **Step 5: Commit Task 3**

```powershell
git add components/AppShell.tsx components/RecommendationPanel.tsx components/ParkingCard.tsx app/styles/planner.css tests/AppShell.test.tsx
git commit -m "fix: keep parking results stable while editing"
```

### Task 4: Explicit NAVER origin-to-parking directions

**Files:**
- Create: `tests/navigation.test.ts`
- Create: `lib/maps/navigation.ts`
- Modify: `components/NavigationButtons.tsx`
- Modify: `components/ParkingCard.tsx`
- Modify: `components/RecommendationPanel.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Write failing URL-builder tests**

Use an origin named `현재 위치` and a parking lot named `역삼1문화센터 공영주차장`. Assert:

```ts
const mobile = buildNaverAppNavigationUrl(origin, parking, "https://parkpick.example");
expect(mobile).toContain("slat=37.4979");
expect(mobile).toContain("slng=127.0276");
expect(mobile).toContain("dlat=37.49534845");
expect(mobile).toContain("dlng=127.03323757");
expect(mobile).toContain("appname=https%3A%2F%2Fparkpick.example");

const desktop = buildNaverWebDirectionsUrl(origin, parking);
expect(desktop).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\//);
expect(desktop).not.toContain("127.0276,37.4979");
expect(desktop.split("/")).toContainEqual(expect.stringContaining(encodeURIComponent("현재 위치")));
expect(desktop.split("/")).toContainEqual(expect.stringContaining(encodeURIComponent(parking.name)));
```

Also assert `buildNaverAndroidIntentUrl()` contains the same query and NAVER package name.

- [ ] **Step 2: Run navigation tests and confirm RED**

Run: `npm test -- --run tests/navigation.test.ts`

Expected: FAIL because the shared builders do not exist.

- [ ] **Step 3: Implement shared URL builders**

Create pure functions in `lib/maps/navigation.ts`:

```ts
export function toWebMercator(point: Coordinate): { x: number; y: number };
export function buildNaverAppNavigationUrl(origin: NamedCoordinate, destination: NamedCoordinate, appName: string): string;
export function buildNaverAndroidIntentUrl(origin: NamedCoordinate, destination: NamedCoordinate, appName: string): string;
export function buildNaverWebDirectionsUrl(origin: NamedCoordinate, destination: NamedCoordinate): string;
```

Clamp latitude to the Web Mercator limit, compute EPSG:3857 `x/y`, and encode each endpoint as `${x},${y},${encodeURIComponent(name)},PLACE_POI`. The desktop path is `/p/directions/{originSegment}/{parkingSegment}/-/car`. Mobile uses explicit `slat`, `slng`, `sname`, `dlat`, `dlng`, `dname`, and mandatory `appname`; Android wraps the same navigation query in the documented NAVER intent package.

- [ ] **Step 4: Wire every navigation control to applied origin**

Change the component contract to:

```ts
export function NavigationButtons({
  origin,
  parking,
  compact = false,
}: {
  origin: Place;
  parking: ParkingRecommendation;
  compact?: boolean;
})
```

Use the Android intent builder, iOS app builder plus the existing App Store fallback, and the desktop builder. Pass the same applied origin to card, active-route, and mobile controls. Keep Kakao behavior scoped to the represented parking lot.

- [ ] **Step 5: Run navigation and UI tests and confirm GREEN**

Run: `npm test -- --run tests/navigation.test.ts tests/AppShell.test.tsx; npm run typecheck`

Expected: both files PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit Task 4**

```powershell
git add lib/maps/navigation.ts components/NavigationButtons.tsx components/ParkingCard.tsx components/RecommendationPanel.tsx components/AppShell.tsx tests/navigation.test.ts
git commit -m "fix: open Naver routes from applied origin"
```

### Task 5: Focused runtime verification

**Files:**
- Modify only files needed for defects discovered by the checks below, always with a failing regression first.

- [ ] **Step 1: Run the focused automated suite**

Run:

```powershell
npm test -- --run tests/seoul-parking-nearby.test.ts tests/domain.test.ts tests/AppShell.test.tsx tests/navigation.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: all focused tests pass, then typecheck/lint/build exit 0. Do not add broader tests unless one of these checks exposes a concrete gap.

- [ ] **Step 2: Verify the Gangnam API response locally**

POST a recommendation for destination `{ latitude: 37.4979, longitude: 127.0276 }` in AUTO mode. Confirm:

- response data is not DEMO;
- one to three recommendations are returned from `SEOUL_PARKING_PORTAL` or the documented fallback;
- every result is at most 1,000 m from the destination;
- realtime-unsupported lots remain eligible and show null occupancy/prediction;
- `effectiveDistanceMeters` is null or a 50 m multiple at least as large as the farthest returned lot.

- [ ] **Step 3: Verify rendered behavior in the local browser**

At `http://127.0.0.1:3000`, search/select Gangnam Station, submit AUTO, and verify real nearby public lots appear. Enter condition editing, drag the manual range in 50 m steps, and confirm the old map does not flash or disappear. Submit the new range and confirm all markers meet it. Click NAVER from a card and the active compact control; confirm the opened URL contains both origin and that exact parking lot and renders a directions page rather than the plain map.

- [ ] **Step 4: Commit any test-led corrections and report evidence**

If verification required changes, commit only those scoped changes with `fix:`. Record exact passing commands, Gangnam lot distances/data mode, and the final NAVER URL shape without exposing secrets.
