# Gyeonggi Parking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gyeonggi public parking basics and live availability to the existing ParkPick Seoul recommendation flow while preserving cross-border candidates and isolating provider failures.

**Architecture:** A server-only GITS client fetches the two documented XML resources, parses them through a pure normalizer, joins rows by `pkplcId`, and returns existing `ParkingLot` objects. The recommendation route calls the existing Seoul path and the new Gyeonggi path concurrently with `Promise.allSettled`, merges successful results, applies the current distance/ranking pipeline, and keeps working when one regional provider fails.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript 6, native `fetch`, XML text parsing without new runtime dependencies, Vitest fixtures and mocks.

---

### Task 1: Normalize documented GITS XML into parking lots

**Files:**
- Create: `tests/fixtures/gyeonggi/parking-info.sample.xml`
- Create: `tests/fixtures/gyeonggi/parking-availability.sample.xml`
- Create: `lib/api/gyeonggi-parking-normalize.ts`
- Create: `tests/gyeonggi-parking.test.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Add representative XML fixtures**

The information fixture must contain two valid lots and rows with an invalid coordinate and zero capacity. The availability fixture must contain one matching row, one malformed available count, and one unmatched ID. Use the documented envelope and fields:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ServiceResult>
  <msgHeader><headerCd>0</headerCd><headerMsg>정상적으로 처리되었습니다.</headerMsg><itemCount>4</itemCount></msgHeader>
  <msgBody>
    <body><laeId>31030</laeId><laeNm>수원시</laeNm><pkplcId>GG-1</pkplcId><pkplcNm>경기 공영주차장</pkplcNm><latCrdn>37.3001</latCrdn><lonCrdn>127.0101</lonCrdn><roadNmAddr>경기도 수원시 테스트로 1</roadNmAddr><pklotCnt>100</pklotCnt><parkingBscTime>30</parkingBscTime><parkingBscFare>1000</parkingBscFare><addUnitTime>10</addUnitTime><addUnitFare>500</addUnitFare><ddPktckFare>12000</ddPktckFare><wkdayOprtStartTime>0900</wkdayOprtStartTime><wkdayOprtEndTime>2200</wkdayOprtEndTime></body>
  </msgBody>
</ServiceResult>
```

- [ ] **Step 2: Write failing normalization tests**

Test the exported `parseGyeonggiParkingXml` and `joinGyeonggiParkingRows` functions. Assertions must cover source identity, fee fields, missing availability retention, clamped available spaces, update time, rejected invalid rows, non-zero header rejection, and XML entity decoding.

```ts
const joined = joinGyeonggiParkingRows(infoRows, availabilityRows);
expect(joined.lots.map((lot) => lot.sourceId)).toEqual(["GG-1", "GG-2"]);
expect(joined.lots[0]).toMatchObject({
  source: "GYEONGGI_GITS",
  availableSpaces: 23,
  realtimeSupported: true,
  feeRule: { isFree: false, baseMinutes: 30, baseFee: 1000 },
});
expect(joined.lots[1]).toMatchObject({
  availableSpaces: null,
  realtimeSupported: false,
});
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `npm test -- --run tests/gyeonggi-parking.test.ts`

Expected: FAIL because `gyeonggi-parking-normalize.ts` and `GYEONGGI_GITS` do not exist.

- [ ] **Step 4: Extend the source union and implement the pure normalizer**

Extend `ParkingLot["source"]`:

```ts
source: "SEOUL_OPEN_DATA" | "SEOUL_PARKING_PORTAL" | "GYEONGGI_GITS" | "DEMO";
```

Create focused types and functions:

```ts
export type GyeonggiRow = Record<string, string>;
export type GyeonggiService = "INFO" | "AVAILABILITY";

export function parseGyeonggiParkingXml(xml: string, service: GyeonggiService): GyeonggiRow[];
export function joinGyeonggiParkingRows(
  infoRows: GyeonggiRow[],
  availabilityRows: GyeonggiRow[],
): { lots: ParkingLot[]; stats: { infoRows: number; availabilityRows: number; matchedRows: number; rejectedRows: number } };
```

The parser must validate `headerCd === "0"`, read only `<body>` elements under `<msgBody>`, decode the five XML entities, and reject structurally malformed XML. The join indexes availability by unique `pkplcId`; basic-only lots remain eligible. A lot is valid only with ID, name, positive capacity, latitude from 36 through 39, and longitude from 125 through 129. `isFree` is true only when all present basic/additional fee values are numeric zero; missing fee values remain non-free with nullable details.

- [ ] **Step 5: Run the focused test and commit**

Run: `npm test -- --run tests/gyeonggi-parking.test.ts`

Expected: PASS.

```bash
git add lib/types.ts lib/api/gyeonggi-parking-normalize.ts tests/gyeonggi-parking.test.ts tests/fixtures/gyeonggi
git commit -m "feat: normalize Gyeonggi parking data"
```

### Task 2: Fetch, cache, and join the GITS services

**Files:**
- Create: `lib/api/gyeonggi-parking.ts`
- Modify: `tests/gyeonggi-parking.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing client tests**

Use an injected `fetchImpl` and clock. Verify both endpoints receive `serviceKey` through `URLSearchParams`, requests run concurrently, a successful result is cached, concurrent callers share one in-flight request, response code `7` rejects without caching, and a missing key rejects before network access.

```ts
const client = createGyeonggiParkingClient({ fetchImpl, now: () => now });
const result = await client.fetchParkingLots("server-only-key");
expect(result.lots).toHaveLength(2);
expect(fetchImpl).toHaveBeenCalledTimes(2);
expect(result.notice).toContain("경기도 교통정보센터");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run tests/gyeonggi-parking.test.ts`

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the server-only client**

Create these public interfaces:

```ts
export interface GyeonggiParkingClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface GyeonggiParkingFetchResult {
  lots: ParkingLot[];
  notice: string;
  stats: GyeonggiJoinResult["stats"];
}

export function createGyeonggiParkingClient(options?: GyeonggiParkingClientOptions): {
  fetchParkingLots(key: string): Promise<GyeonggiParkingFetchResult>;
};

export async function fetchGyeonggiParkingLots(): Promise<GyeonggiParkingFetchResult>;
```

Request these exact endpoints with an eight-second timeout:

```ts
const INFO_URL = "https://openapigits.gg.go.kr/api/rest/getParkingPlaceInfoList";
const AVAILABILITY_URL = "https://openapigits.gg.go.kr/api/rest/getParkingPlaceAvailabilityInfoList";
```

Fetch both with `Promise.all`, parse as text, normalize, and join. Cache the combined successful result for one minute and coalesce requests per normalized key. Never include the key in errors, notices, or cache diagnostics. Read the default key from `process.env.GYEONGGI_GITS_API_KEY`.

- [ ] **Step 4: Document the environment variable**

Add a blank example entry without a credential:

```dotenv
GYEONGGI_GITS_API_KEY=
```

- [ ] **Step 5: Run the focused test and commit**

Run: `npm test -- --run tests/gyeonggi-parking.test.ts`

Expected: PASS.

```bash
git add .env.example lib/api/gyeonggi-parking.ts tests/gyeonggi-parking.test.ts
git commit -m "feat: add Gyeonggi parking client"
```

### Task 3: Merge Seoul and Gyeonggi candidates at the route boundary

**Files:**
- Modify: `app/api/recommendations/route.ts`
- Modify: `tests/recommendations-route.test.ts`

- [ ] **Step 1: Add a mocked Gyeonggi provider and failing route tests**

Mock `fetchGyeonggiParkingLots` beside the existing Seoul mocks. Add focused tests that prove both providers are invoked before either deferred promise resolves, candidates from both sources are ranked together, one provider rejection still returns the other's results, both rejections produce HTTP 503, and missing Gyeonggi candidates do not change existing Seoul behavior.

```ts
expect(mocks.nearby).toHaveBeenCalledOnce();
expect(mocks.gyeonggi).toHaveBeenCalledOnce();
expect(response.recommendations.map((lot) => lot.source)).toEqual(
  expect.arrayContaining(["SEOUL_PARKING_PORTAL", "GYEONGGI_GITS"]),
);
```

- [ ] **Step 2: Run the focused route test and confirm failure**

Run: `npm test -- --run tests/recommendations-route.test.ts`

Expected: FAIL because the route does not call the Gyeonggi provider.

- [ ] **Step 3: Refactor the existing Seoul fallback into a local provider function**

Return a consistent provider result without changing its current fallback behavior:

```ts
type ProviderResult = { lots: ParkingLot[]; notice: string; mode: "LIVE" | "FALLBACK" };

async function fetchSeoulCandidates(destination: Coordinate, distanceMeters: number): Promise<ProviderResult>;
```

The function first calls `fetchNearbySeoulParking`; on failure it uses `fetchSeoulParkingLots`, distance-filters the fallback, and returns mode `FALLBACK`.

- [ ] **Step 4: Call regional providers concurrently and merge successful results**

Use `Promise.allSettled`:

```ts
const [seoulResult, gyeonggiResult] = await Promise.allSettled([
  fetchSeoulCandidates(input.destination, distanceMeters),
  fetchGyeonggiParkingLots(),
]);
```

Filter every successful provider result through `filterByDistance`, merge by `${lot.source}:${lot.sourceId}`, and concatenate distinct notices. Set `dataMode` to `LIVE` when any live provider succeeds, otherwise `FALLBACK`. Log only provider names and safe error messages. Return 503 only when both promises reject. Preserve the existing honest zero-result notice and all downstream Naver route/ranking behavior.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- --run tests/gyeonggi-parking.test.ts tests/recommendations-route.test.ts`

Expected: both files PASS.

```bash
git add app/api/recommendations/route.ts tests/recommendations-route.test.ts
git commit -m "feat: merge Seoul and Gyeonggi parking"
```

### Task 4: Documentation, local configuration, and bounded verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Local only: `.env.local`

- [ ] **Step 1: Document the provider behavior**

Document `GYEONGGI_GITS_API_KEY`, the two GITS resources, `pkplcId` join, basic-only eligibility, cross-border concurrent fetching, and one-provider failure isolation. Keep every visible product reference as `ParkPick Seoul`.

- [ ] **Step 2: Configure the corrected key locally without tracking it**

Set `GYEONGGI_GITS_API_KEY` in the worktree `.env.local`. Confirm `git status --short` does not list `.env.local` and `git ls-files .env.local` returns nothing.

- [ ] **Step 3: Run bounded verification**

Run:

```bash
npm test -- --run tests/gyeonggi-parking.test.ts tests/recommendations-route.test.ts
npm run typecheck
npm run check:repo
npm run build
git diff --check HEAD
```

Expected: focused tests pass, TypeScript exits zero, repository checks pass, Next production build succeeds, and whitespace validation is clean. Do not retry the unapproved live GITS key beyond one explicit verification request.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/ARCHITECTURE.md
git commit -m "docs: document Gyeonggi parking coverage"
```

- [ ] **Step 5: Review and push**

Review the full branch diff against the design, confirm no credential appears in tracked files or logs, then push `feat/gyeonggi-parking` and report the live-key approval blocker separately from implementation completeness.
