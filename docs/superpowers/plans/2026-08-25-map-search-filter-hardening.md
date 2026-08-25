# Map, Search, and Parking Eligibility Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NAVER map readiness deterministic, remove tourist-bus-exclusive facilities, and add a server-only NAVER address-search fallback.

**Architecture:** Keep the three changes isolated: a browser SDK loader used by `MapPanel`, a name eligibility guard in Seoul normalization, and an NCP Geocoding adapter behind the existing place-search function. Kakao remains first choice; demo data remains the final fail-safe.

**Tech Stack:** Next.js 16, React 19, TypeScript 6.0.3, Vitest 4, Testing Library, NAVER Maps JavaScript API v3, NCP Geocoding.

---

### Task 1: NAVER SDK readiness

**Files:**
- Create: `lib/maps/naver-sdk.ts`
- Create: `tests/naver-map-sdk.test.tsx`
- Modify: `components/MapPanel.tsx`
- Modify: `types/maps.d.ts`

- [ ] **Step 1: Write one failing jsdom test**

The test must call `loadNaverMapSdk("test-key", 100)`, assert the appended script contains both `ncpKeyId` and `callback=__parkpickNaverReady`, set a minimal `window.naver.maps`, invoke the global callback, and observe resolution. In the same test, clean the DOM, invoke a second load, call `window.navermap_authFailure`, and observe rejection instead of a pending promise.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/naver-map-sdk.test.tsx`

Expected: FAIL because `@/lib/maps/naver-sdk` does not exist.

- [ ] **Step 3: Implement the bounded loader**

Create this public contract:

```ts
export const NAVER_READY_CALLBACK = "__parkpickNaverReady";

export function loadNaverMapSdk(key: string, timeoutMs = 8_000): Promise<void>;
```

The function must resolve immediately when `window.naver?.maps` already exists. Otherwise remove a stale `#naver-map-sdk`, register `window.__parkpickNaverReady` and `window.navermap_authFailure`, append the async SDK script with `ncpKeyId` and `callback`, and share one in-flight promise because the script and callbacks are global singletons. When the callback precedes `window.naver.maps`, poll every 10 ms until the global appears or the bounded timeout rejects. Every settle path must clear timeout/poll timers and restore or delete temporary callbacks.

Add `__parkpickNaverReady?: () => void` to `Window` in `types/maps.d.ts`. Replace the NAVER branch's generic `script()` call in `MapPanel` with `await loadNaverMapSdk(key)`. If the loader rejects, the existing outer catch must set `state` to `error`; no `loading` path may return silently because the SDK global is absent.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/naver-map-sdk.test.tsx`

Expected: one test file passes.

### Task 2: Passenger-car parking eligibility

**Files:**
- Modify: `lib/api/seoul-parking-normalize.ts`
- Modify: `tests/seoul-parking.test.ts`

- [ ] **Step 1: Extend the existing join test and verify RED**

Within the existing deterministic join test, call `joinSeoulParkingRows` with two otherwise valid realtime rows named `남산 관광버스전용 주차장` and `일반·관광버스 함께 이용 주차장`, plus matching static coordinates. Assert that only the mixed-use row remains and stats report one matched and one rejected row.

Run: `npx vitest run tests/seoul-parking.test.ts`

Expected: FAIL because both rows are currently included.

- [ ] **Step 2: Add the minimal eligibility guard**

Before incrementing `matchedRows`, derive the authoritative realtime name and normalize whitespace:

```ts
const name = text(row, ["PKLT_NM"]);
const normalizedName = name.replace(/\s/g, "");
if (normalizedName.includes("관광버스") && normalizedName.includes("전용")) continue;
```

Reuse `name` when constructing the lot. Do not reject names that mention tourist buses without also saying they are exclusive.

- [ ] **Step 3: Verify GREEN**

Run: `npx vitest run tests/seoul-parking.test.ts`

Expected: the existing three-test file passes without adding another `it` block.

### Task 3: Server-only NAVER address fallback

**Files:**
- Create: `lib/api/naver-geocode.ts`
- Create: `tests/place-search.test.ts`
- Modify: `lib/api/kakao-places.ts`
- Modify: `lib/types.ts`
- Modify: `app/api/recommendations/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write one failing unit test**

Mock `fetch` with an NCP response containing one address with `x`, `y`, `roadAddress`, and `jibunAddress`. Call the planned `searchNaverAddresses` with injected credentials and assert longitude comes from `x`, latitude from `y`, source is `NAVER`, and the client secret is present only in the request header. In the same test, make the response 403 and assert the adapter rejects so the caller can use demo fallback.

Run: `npx vitest run tests/place-search.test.ts`

Expected: FAIL because `@/lib/api/naver-geocode` does not exist.

- [ ] **Step 2: Implement the NCP adapter**

Create this contract:

```ts
export async function searchNaverAddresses(
  query: string,
  credentials: { keyId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Place[]>;
```

Call `https://maps.apigw.ntruss.com/map-geocode/v2/geocode` with `query`, `count=8`, headers `x-ncp-apigw-api-key-id` and `x-ncp-apigw-api-key`, `cache: "no-store"`, and a five-second timeout. Require HTTP success and response status `OK`; map only finite `x`/`y` coordinates to `Place` objects with source `NAVER`.

- [ ] **Step 3: Wire the fallback chain**

Add `NAVER` to `Place["source"]` and the recommendation Route Handler's allowed sources. In `searchPlaces`, use Kakao first. When Kakao is unconfigured, fails, or returns no places, try NCP Geocoding only when both `NAVER_MAP_NCP_KEY_ID` and `NAVER_MAP_NCP_CLIENT_SECRET` exist. Return a live address-search notice when it succeeds; otherwise return the current demo matches with a notice that live search is unavailable.

Add blank server-only entries to `.env.example`:

```dotenv
NAVER_MAP_NCP_KEY_ID=
NAVER_MAP_NCP_CLIENT_SECRET=
```

Never add the secret to a `NEXT_PUBLIC_` variable.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/place-search.test.ts`

Expected: one test file passes.

### Task 4: Integration and proportional verification

**Files:**
- Modify locally only: `.env.local` (ignored by Git)

- [ ] Add the supplied NCP key ID and secret to the two server-only environment names without removing the existing public map ID.
- [ ] Run `npm run typecheck` once.
- [ ] Run `npm test` once; do not repeat the full suite through `npm run verify`.
- [ ] Rebuild once because the public map key is inlined, restart the local production server, and verify `http://127.0.0.1:3000` returns HTTP 200.
- [ ] Verify one real recommendation request remains `LIVE` and contains no tourist-bus-exclusive name.
- [ ] Verify NAVER map leaves the loading state. If address search still falls back, report the already-observed NCP Geocoding 403 and instruct enabling Geocoding in the NAVER application rather than weakening the fallback.
- [ ] Commit code and tests, push `fix/live-data-hardening`, and update PR #1. Merge the new commit into local `main` only after focused and full tests pass.
