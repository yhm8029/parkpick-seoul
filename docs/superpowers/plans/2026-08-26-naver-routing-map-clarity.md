# NAVER Routing and Map Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NAVER the only active map/navigation/route provider, enrich the displayed three parking recommendations with NAVER Directions 5 traffic routes, show the actual route on the map, and clarify all travel, realtime, and planner labels.

**Architecture:** The recommendation API first freezes the existing estimate-based three-lot shortlist, then calls a new server-only NAVER Directions adapter once per shortlisted lot in parallel and re-scores only that fixed membership. `MapPanel` stays client-side and uses normalized route geometry to draw a neutral base polyline plus congestion overlays. Kakao source files remain available but are removed from current API/UI composition.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, NAVER Directions 5 REST API, NAVER Web Dynamic Map JavaScript API, Vitest, Testing Library.

---

## File structure

- Create `lib/api/naver-directions.ts`: server-only NAVER Directions request, validation, normalization, and three-route concurrency.
- Create `lib/api/naver-place-search.ts`: NAVER geocoding plus demo fallback; no Kakao request.
- Create `components/KakaoNavigationButton.tsx`: preserved dormant Kakao navigation implementation.
- Modify `lib/types.ts`: normalized path and congestion types plus `NAVER_DIRECTIONS` source.
- Modify `app/api/recommendations/route.ts`: freeze three candidates, enrich only them, re-score only them.
- Modify `app/api/places/search/route.ts`: compose NAVER search, not Kakao search.
- Modify `lib/domain/recommend.ts`: NAVER success reason and estimate warning semantics.
- Modify `components/MapPanel.tsx`: NAVER-first/no provider tabs, origin-only real map, active path overlays and cleanup.
- Modify `types/maps.d.ts`: NAVER `Polyline` declaration and removable overlay interface.
- Modify `components/NavigationButtons.tsx`: expose only NAVER navigation.
- Modify `components/ParkingCard.tsx`: explicit travel legs and realtime-source explanation.
- Modify `components/AppShell.tsx`: exact planner labels.
- Modify `app/styles/planner.css`: nonshrinking horizontal `지금` button.
- Modify `app/styles/map-results.css`: NAVER-only toolbar and route/card helper layout.
- Modify `.env.example`: document Directions 5 use of the existing server-only NAVER credentials.
- Modify `README.md`: describe NAVER as the current provider and Kakao as dormant future code.
- Create `tests/naver-directions.test.ts`: adapter request/parse/failure coverage.
- Modify `tests/MapPanel.naver.test.tsx`: origin-only map and active polyline coverage.
- Modify `tests/AppShell.test.tsx`: exact labels, travel semantics, realtime explanation, and no Kakao CTA.
- Modify `tests/place-search.test.ts`: no Kakao fetch in current composition.

### Task 1: Normalize NAVER Directions 5 responses

**Files:**
- Create: `lib/api/naver-directions.ts`
- Modify: `lib/types.ts`
- Create: `tests/naver-directions.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Add fixtures that prove milliseconds and `[longitude, latitude]` are converted correctly, secrets stay only in request headers, and partial upstream failures fall back independently:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNaverDrivingRoutes } from "@/lib/api/naver-directions";
import type { ParkingLot } from "@/lib/types";

const lot = (id: string, latitude: number): ParkingLot => ({
  id, sourceId: id, source: "DEMO", name: id, address: "서울",
  latitude, longitude: 126.93, capacity: 10, occupiedSpaces: null,
  availableSpaces: null, realtimeUpdatedAt: null, realtimeSupported: false,
  feeRule: { isFree: false }, phone: null, operatingLabel: null, isOpen: null
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("normalizes NAVER duration, distance, path and congestion", async () => {
  vi.stubEnv("NAVER_MAP_NCP_KEY_ID", "server-id");
  vi.stubEnv("NAVER_MAP_NCP_CLIENT_SECRET", "server-secret");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    code: 0,
    route: { trafast: [{
      summary: { duration: 3_180_001, distance: 25_123 },
      path: [[127.1, 37.5], [127.2, 37.6]],
      section: [{ pointIndex: 0, pointCount: 2, congestion: 2 }]
    }] }
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const [route] = await fetchNaverDrivingRoutes(
    { latitude: 37.4, longitude: 127.0 },
    [lot("p1", 37.5)]
  );

  expect(route).toMatchObject({
    parkingId: "p1", driveMinutes: 54, driveDistanceMeters: 25_123,
    source: "NAVER_DIRECTIONS",
    path: [{ longitude: 127.1, latitude: 37.5 }, { longitude: 127.2, latitude: 37.6 }],
    congestionSections: [{ pointIndex: 0, pointCount: 2, congestion: 2 }]
  });
  const [, init] = fetchMock.mock.calls[0];
  expect(init.headers).toMatchObject({
    "x-ncp-apigw-api-key-id": "server-id",
    "x-ncp-apigw-api-key": "server-secret"
  });
  expect(JSON.stringify(route)).not.toContain("server-secret");
});

it("returns no route for code errors, malformed data, timeout, or missing credentials", async () => {
  vi.stubEnv("NAVER_MAP_NCP_KEY_ID", "server-id");
  vi.stubEnv("NAVER_MAP_NCP_CLIENT_SECRET", "server-secret");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 3, route: {} }), { status: 200 })
  ));
  await expect(fetchNaverDrivingRoutes(
    { latitude: 37.4, longitude: 127.0 }, [lot("p1", 37.5)]
  )).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run the adapter tests and confirm RED**

Run: `npm test -- tests/naver-directions.test.ts`

Expected: FAIL because `@/lib/api/naver-directions` and NAVER route types do not exist.

- [ ] **Step 3: Add normalized route types**

Extend `lib/types.ts` with these exact public shapes:

```ts
export interface RouteCongestionSection {
  pointIndex: number;
  pointCount: number;
  congestion: 0 | 1 | 2 | 3;
}

export interface RouteEstimate {
  parkingId: string;
  driveMinutes: number;
  driveDistanceMeters: number;
  source: "NAVER_DIRECTIONS" | "KAKAO_MOBILITY" | "ESTIMATE";
  path?: Coordinate[];
  congestionSections?: RouteCongestionSection[];
}
```

`ParkingRecommendation` continues to store the scalar fields and adds optional `routePath?: Coordinate[]` and `routeCongestionSections?: RouteCongestionSection[]` so the browser never receives a raw provider payload.

- [ ] **Step 4: Implement the server-only adapter**

Create `lib/api/naver-directions.ts` with:

```ts
import type { Coordinate, ParkingLot, RouteCongestionSection, RouteEstimate } from "@/lib/types";

const ENDPOINT = "https://maps.apigw.ntruss.com/map-direction/v1/driving";
const MAX_PATH_POINTS = 2_500;

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function fetchOne(origin: Coordinate, lot: ParkingLot): Promise<RouteEstimate | null> {
  const keyId = process.env.NAVER_MAP_NCP_KEY_ID;
  const secret = process.env.NAVER_MAP_NCP_CLIENT_SECRET;
  if (!keyId || !secret) return null;
  const url = new URL(ENDPOINT);
  url.searchParams.set("start", `${origin.longitude},${origin.latitude}`);
  url.searchParams.set("goal", `${lot.longitude},${lot.latitude}`);
  url.searchParams.set("option", "trafast");
  try {
    const response = await fetch(url, {
      headers: { "x-ncp-apigw-api-key-id": keyId, "x-ncp-apigw-api-key": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(7_000)
    });
    if (!response.ok) throw new Error(`http-${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    const raw = body.code === 0
      ? (body.route as { trafast?: unknown[] } | undefined)?.trafast?.[0] as {
          summary?: { duration?: unknown; distance?: unknown };
          path?: unknown[];
          section?: unknown[];
        } | undefined
      : undefined;
    const duration = raw?.summary?.duration;
    const distance = raw?.summary?.distance;
    if (!raw || !finitePositive(duration) || !finitePositive(distance)) return null;
    const result: RouteEstimate = {
      parkingId: lot.id,
      driveMinutes: Math.max(1, Math.ceil(duration / 60_000)),
      driveDistanceMeters: Math.round(distance),
      source: "NAVER_DIRECTIONS"
    };
    const tuples = Array.isArray(raw.path) ? raw.path : [];
    const path = tuples.map(tuple => {
      if (!Array.isArray(tuple) || tuple.length !== 2) return null;
      const [longitude, latitude] = tuple;
      return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
        typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
        ? { latitude, longitude }
        : null;
    });
    if (path.length > 1 && path.length <= MAX_PATH_POINTS && path.every((point): point is Coordinate => point !== null)) {
      result.path = path;
      const sections = (Array.isArray(raw.section) ? raw.section : []).flatMap(section => {
        if (!section || typeof section !== "object") return [];
        const value = section as Record<string, unknown>;
        const { pointIndex, pointCount, congestion } = value;
        return Number.isInteger(pointIndex) && Number.isInteger(pointCount) &&
          typeof pointIndex === "number" && pointIndex >= 0 &&
          typeof pointCount === "number" && pointCount > 1 &&
          (congestion === 0 || congestion === 1 || congestion === 2 || congestion === 3)
          ? [{ pointIndex, pointCount, congestion } satisfies RouteCongestionSection]
          : [];
      });
      if (sections.length) result.congestionSections = sections;
    }
    return result;
  } catch (error) {
    console.error("NAVER directions unavailable", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function fetchNaverDrivingRoutes(origin: Coordinate, lots: ParkingLot[]): Promise<RouteEstimate[]> {
  const settled = await Promise.all(lots.slice(0, 3).map(lot => fetchOne(origin, lot)));
  return settled.filter((route): route is RouteEstimate => route !== null);
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/naver-directions.test.ts && npm run typecheck`

Expected: adapter tests PASS; typecheck PASS.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add lib/types.ts lib/api/naver-directions.ts tests/naver-directions.test.ts
git commit -m "feat: add Naver Directions adapter" `
  -m "Done: Normalize traffic-aware NAVER route time, distance, path, and congestion with per-candidate failure isolation." `
  -m "Remaining: Integrate the fixed three-lot shortlist, render routes, clarify UI labels, configure credentials, and deploy."
git push origin main
```

### Task 2: Freeze and enrich exactly three recommendations

**Files:**
- Modify: `app/api/recommendations/route.ts`
- Modify: `lib/domain/recommend.ts`
- Modify: `tests/naver-directions.test.ts`
- Modify: `tests/domain.test.ts`

- [ ] **Step 1: Add a failing API-composition test**

Mock parking ingestion and `fetchNaverDrivingRoutes`, call the recommendation route with more than three lots, and assert the adapter receives exactly the three IDs produced by the estimate-only preliminary `recommendParking(lots, input, [])`. Add a mixed result case where one NAVER route is missing and the response still contains three cards with `NAVER_DIRECTIONS` and `ESTIMATE` sources.

```ts
expect(fetchNaverDrivingRoutesMock).toHaveBeenCalledTimes(1);
expect(fetchNaverDrivingRoutesMock.mock.calls[0]?.[1].map(lot => lot.id)).toEqual(preliminaryIds);
expect(json.recommendations).toHaveLength(3);
expect(json.recommendations.map(item => item.routeSource)).toContain("ESTIMATE");
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/naver-directions.test.ts tests/domain.test.ts`

Expected: FAIL because the route still composes the Kakao matrix adapter and does not freeze membership.

- [ ] **Step 3: Replace current route composition**

In `app/api/recommendations/route.ts`, replace the Kakao import and 30-candidate call with:

```ts
const preliminary = recommendParking(lots, input, []);
const lotById = new Map(lots.map(lot => [lot.id, lot]));
const shortlist = preliminary.recommendations
  .map(item => lotById.get(item.id))
  .filter((lot): lot is ParkingLot => Boolean(lot));
const routes = await fetchNaverDrivingRoutes(input.origin, shortlist);
const ranked = recommendParking(shortlist, input, routes);
```

Delete `ROUTE_CANDIDATE_LIMIT` and remove the `fetchDrivingRoutes` import. Keep `lib/api/kakao-routes.ts` untouched and dormant.

- [ ] **Step 4: Carry normalized geometry into recommendations**

In `lib/domain/recommend.ts`, map optional route fields:

```ts
routePath: context.route.path,
routeCongestionSections: context.route.congestionSections,
```

Use `NAVER_DIRECTIONS` for the success reason `현재 교통을 반영한 실제 자동차 경로입니다.` Keep `ESTIMATE` warning `자동차 시간은 거리 기반 추정치입니다.` Do not mention Kakao in user-facing recommendation copy.

- [ ] **Step 5: Verify the fixed shortlist**

Run: `npm test -- tests/naver-directions.test.ts tests/domain.test.ts && npm run typecheck`

Expected: all focused tests PASS and typecheck PASS.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add app/api/recommendations/route.ts lib/domain/recommend.ts tests/naver-directions.test.ts tests/domain.test.ts
git commit -m "feat: enrich final recommendations with Naver traffic" `
  -m "Done: Freeze the three displayed candidates, fetch only their NAVER routes, and preserve per-card estimate fallback." `
  -m "Remaining: Render NAVER paths, remove Kakao runtime UI, clarify card/form labels, configure credentials, and deploy."
git push origin main
```

### Task 3: Render a real origin-first NAVER map and active route

**Files:**
- Modify: `components/MapPanel.tsx`
- Modify: `types/maps.d.ts`
- Modify: `tests/MapPanel.naver.test.tsx`

- [ ] **Step 1: Extend the NAVER test handle and write RED tests**

Add `Polyline` constructor capture and `setMap` cleanup capture to the current test handle. Add two focused cases after extending `NaverHandle` with `constructorCalls.Polyline: unknown[][]` and `polylineSetMapCalls: unknown[]`:

```tsx
it("loads a real NAVER map centered on origin without a destination", async () => {
  render(<MapPanel origin={{ latitude: 37.55, longitude: 126.98 }} destination={null} recommendations={[]} />);
  await waitFor(() => expect(handle.constructorCalls.Map).toHaveLength(1));
  expect(handle.setCenterCalls.at(-1)?.args[0]).toMatchObject({ args: [37.55, 126.98] });
  expect(handle.fitBoundsCalls).toHaveLength(0);
});

it("draws and replaces only the active NAVER route", async () => {
  const { rerender, unmount } = render(<MapPanel {...props} activeId="parking-1" />);
  await waitFor(() => expect(handle.constructorCalls.Polyline.length).toBeGreaterThan(0));
  rerender(<MapPanel {...props} activeId="parking-2" />);
  expect(handle.polylineSetMapCalls).toContain(null);
  unmount();
  expect(handle.polylineSetMapCalls.at(-1)).toBeNull();
});
```

- [ ] **Step 2: Run the map tests and confirm RED**

Run: `npm test -- tests/MapPanel.naver.test.tsx`

Expected: origin-only map test fails because the effect exits on `!destination`; polyline test fails because `Polyline` is not used.

- [ ] **Step 3: Add NAVER Polyline types**

In `types/maps.d.ts`, add:

```ts
Polyline: new (options: Record<string, unknown>) => { setMap: (map: unknown | null) => void };
```

Keep the existing Map/Marker/Event definitions intact.

- [ ] **Step 4: Refactor MapPanel without deleting Kakao support code**

Derive:

```ts
const fallbackCenter = { latitude: 37.5665, longitude: 126.9780 };
const centerPoint = destination ?? origin ?? fallbackCenter;
const initial: MapProvider = naverKey ? "NAVER" : "PREVIEW";
const [provider] = useState<MapProvider>(initial);
const active = recommendations.find(item => item.id === activeId) ?? null;
```

Remove the `!destination` effect guard and center both provider render branches on `centerPoint`. Render the NAVER SDK even with no points. For no points, create the map at Seoul center with zoom 13; for one point, use setCenter plus zoom 15; otherwise preserve bounded fit behavior.

After creating the NAVER map, extend the viewport coordinates with `active.routePath`, draw a neutral base `Polyline` for that path, and then slice congestion sections from the original path with clamped `[pointIndex, pointIndex + pointCount]` bounds. Overlay green `#16a36a`, orange `#f59e0b`, or red `#dc4c3f` polylines. Include a shared boundary point. Keep overlay instances in a local list and call `setMap(null)` from the effect cleanup before active-ID rerender or unmount.

Remove the provider tab group from JSX. Show one static `NAVER 지도` label when configured. Keep preview rendering for SDK errors and missing public key. Keep the Kakao loader/render branch in the source but unreachable because current composition never changes provider.

- [ ] **Step 5: Verify map behavior**

Run: `npm test -- tests/MapPanel.naver.test.tsx tests/naver-map-sdk.test.tsx && npm run typecheck`

Expected: all NAVER map/SDK tests PASS and typecheck PASS.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add components/MapPanel.tsx types/maps.d.ts tests/MapPanel.naver.test.tsx
git commit -m "feat: draw active Naver traffic routes" `
  -m "Done: Load NAVER before destination selection, center on origin, draw active route traffic segments, and clean overlays." `
  -m "Remaining: Remove Kakao runtime composition, clarify UI labels, configure credentials, run full verification, and deploy."
git push origin main
```

### Task 4: Remove Kakao from current runtime composition

**Files:**
- Create: `components/KakaoNavigationButton.tsx`
- Create: `lib/api/naver-place-search.ts`
- Modify: `components/NavigationButtons.tsx`
- Modify: `app/api/places/search/route.ts`
- Modify: `tests/navigation.test.ts`
- Modify: `tests/place-search.test.ts`

- [ ] **Step 1: Add RED assertions for NAVER-only runtime**

Add tests that render `NavigationButtons` and assert `네이버지도` exists while `카카오내비` does not. In place-search tests, set a Kakao key, mock fetch, and assert the only live upstream hostname is `maps.apigw.ntruss.com`; when NAVER returns no address, assert curated demo results and a NAVER/demo notice rather than a Kakao request.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/navigation.test.ts tests/place-search.test.ts`

Expected: navigation test finds Kakao CTA and place search calls Kakao when its key exists.

- [ ] **Step 3: Preserve dormant Kakao navigation code**

Move the existing Kakao SDK loader, fallback, and button handler unchanged into an exported `KakaoNavigationButton` component in `components/KakaoNavigationButton.tsx`. Do not import that component from current production composition.

Reduce `components/NavigationButtons.tsx` to the current NAVER URL-scheme/web handoff and one button:

```tsx
return (
  <div className={cnNavigation(compact)}>
    <Button size={compact ? "sm" : "md"} onClick={() => openNaverNavigation(origin, parking)}>
      <Map size={17} /> 네이버지도
    </Button>
  </div>
);
```

- [ ] **Step 4: Compose NAVER geocoding plus demos**

Create `lib/api/naver-place-search.ts` by reusing `DEMO_PLACES` and `searchNaverAddresses`. Its public `searchPlaces(query)` tries the existing server-side NAVER geocoding adapter, returns `네이버 주소검색 결과입니다.` when nonempty, and otherwise returns filtered curated demos with `네이버 주소검색 결과가 없어 예시 장소를 표시합니다.` It never reads `KAKAO_REST_API_KEY`.

Change `app/api/places/search/route.ts` to import `searchPlaces` from the new NAVER file. Leave `lib/api/kakao-places.ts` untouched and dormant.

- [ ] **Step 5: Verify no Kakao runtime request or CTA**

Run: `npm test -- tests/navigation.test.ts tests/place-search.test.ts && npm run typecheck`

Expected: focused tests PASS; grep-based source preservation is not used as a behavioral substitute.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add components/KakaoNavigationButton.tsx components/NavigationButtons.tsx lib/api/naver-place-search.ts app/api/places/search/route.ts tests/navigation.test.ts tests/place-search.test.ts
git commit -m "feat: make current map flows Naver-only" `
  -m "Done: Remove Kakao CTAs and requests from current composition while preserving dormant Kakao source for future use." `
  -m "Remaining: Clarify card/form labels, configure credentials, run full verification, and deploy."
git push origin main
```

### Task 5: Clarify travel legs, realtime source, and planner controls

**Files:**
- Modify: `components/ParkingCard.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `app/styles/planner.css`
- Modify: `app/styles/map-results.css`
- Modify: `app/styles/responsive.css`
- Modify: `tests/AppShell.test.tsx`

- [ ] **Step 1: Write one focused RED UI test**

Extend the existing real recommendation-card integration test in two phases: assert planner labels before clicking submit, then assert card labels after results replace the planner:

```ts
render(<AppShell />);
expect(screen.getByText("도착 예정시간")).toBeTruthy();
expect(screen.getByText("예상 체류 시간")).toBeTruthy();
expect(screen.getByRole("button", { name: "지금" })).toBeTruthy();
await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
expect(screen.getAllByText("주차장까지 자동차")).toHaveLength(3);
expect(screen.getAllByText("목적지까지 도보")).toHaveLength(3);
expect(screen.getAllByText(/출발지 → 주차장/)).toHaveLength(3);
expect(screen.getAllByText(/주차장 → 목적지 · 약/)).toHaveLength(3);
```

Render one fixture with `realtimeSupported: false` and assert `서울 주차 포털에서 이 주차장의 실시간 빈자리를 제공하지 않습니다.`

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: fails on the old abbreviated labels and missing source explanation.

- [ ] **Step 3: Implement exact copy**

In `ParkingCard` use:

```tsx
<dt><CarFront size={16} /> 주차장까지 자동차</dt>
<small>{parking.routeSource === "NAVER_DIRECTIONS"
  ? "출발지 → 주차장 · 현재 교통 기준"
  : "출발지 → 주차장 · 거리 기반 추정"}</small>

<dt><Footprints size={16} /> 목적지까지 도보</dt>
<small>주차장 → 목적지 · 약 {parking.walkDistanceMeters}m</small>
```

Conditionally add the Seoul Portal explanation below availability when `!parking.realtimeSupported`. Rename AppShell labels exactly to `도착 예정시간` and `예상 체류 시간`.

- [ ] **Step 4: Keep the now button horizontal**

Give the AppShell button a class `now-button`. Add:

```css
.inline > input { min-width: 0; flex: 1; }
.now-button { flex: 0 0 auto; min-width: 48px; white-space: nowrap; }
.metrics dt { min-height: 2.4em; line-height: 1.2; }
```

At the 680px breakpoint keep `.option-grid` one column; do not stack the datetime input and button.

- [ ] **Step 5: Verify UI behavior**

Run: `npm test -- tests/AppShell.test.tsx && npm run typecheck`

Expected: UI suite PASS and typecheck PASS.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add components/ParkingCard.tsx components/AppShell.tsx app/styles/planner.css app/styles/map-results.css app/styles/responsive.css tests/AppShell.test.tsx
git commit -m "feat: clarify parking travel and realtime labels" `
  -m "Done: State both travel legs, current-traffic versus estimate status, realtime-source limits, and full planner labels." `
  -m "Remaining: Configure NAVER credentials and console, run full verification, deploy, and verify production."
git push origin main
```

### Task 6: Configure and verify NAVER production behavior

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Local only: `.env.local` (never commit)
- Vercel environment only: `NAVER_MAP_NCP_KEY_ID`, `NAVER_MAP_NCP_CLIENT_SECRET`

- [ ] **Step 1: Document environment purpose**

Update `.env.example` comments so the existing server credentials explicitly cover `Geocoding + Directions 5`; add empty `VERCEL_ANALYTICS_TOKEN` and `VERCEL_ANALYTICS_TEAM_ID` entries from the visitor-metrics plan in this same integration-owned edit. Update README to call NAVER the active map, route, search, and navigation provider and describe Kakao files as dormant future integration code. Do not add a real value.

- [ ] **Step 2: Store the supplied secret safely**

Update `.env.local` without printing the value. Set the public Web Dynamic Map ID, server-only ID, and server-only secret. Confirm `.env.local` is ignored with `git check-ignore -v .env.local` and confirm `git diff` contains no credential.

- [ ] **Step 3: Configure NAVER and Vercel**

In NAVER Cloud Application, enable Web Dynamic Map, Geocoding, and Directions 5. Ensure Web Dynamic Map URLs include localhost, `127.0.0.1`, and the production Vercel domain. Add server-only ID/secret to Vercel Production, Preview, and Development environments without `NEXT_PUBLIC_` on the secret.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm run check:repo
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: repository checks, typecheck, all tests, and production build PASS. Run `npm run lint` separately and report only pre-existing lint debt if it remains; do not hide new lint failures.

- [ ] **Step 5: Commit and push configuration documentation**

```powershell
git add .env.example README.md
git commit -m "docs: document Naver route credentials" `
  -m "Done: Document the server-only NAVER credential contract and verify the complete Naver-only implementation." `
  -m "Remaining: Deploy Vercel production and verify public map, route time, route line, labels, and fallbacks."
git push origin main
```

- [ ] **Step 6: Deploy and smoke-test**

Use the linked Vercel project and a production deployment. Verify production `/`, `/api/places/search`, and `/api/recommendations`; confirm a recommendation card reports `NAVER_DIRECTIONS`, car time is close to NAVER Map for the same request moment, the active route line changes with the selected card, and no Kakao SDK/API request is present.
