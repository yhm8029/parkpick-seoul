# NAVER API HUB Place Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demo-only POI lookup with real NAVER API HUB local search while retaining NCP address and demo fallbacks.

**Architecture:** A focused server adapter normalizes NAVER API HUB responses into the existing `Place` type. The existing orchestrator calls it first, then the current Geocoding adapter, so no client component or response schema changes are needed.

**Tech Stack:** Next.js 16 Route Handler, TypeScript, Vitest, NAVER API HUB local search

---

### Task 1: Normalize NAVER API HUB local results

**Files:**
- Create: `lib/api/naver-local-search.ts`
- Create: `tests/naver-local-search.test.ts`

- [ ] **Step 1: Write the failing adapter tests**

Test that `searchNaverLocalPlaces("홍대입구역", credentials, fetchMock)` requests `/search/v1/local` with `display=5`, `start=1`, `sort=random`, `format=json`, sends both `X-NCP-APIGW-*` headers, and returns stripped titles plus `mapx / 10_000_000`, `mapy / 10_000_000` coordinates. Include one malformed item and assert it is omitted.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/naver-local-search.test.ts`
Expected: FAIL because `@/lib/api/naver-local-search` does not exist.

- [ ] **Step 3: Implement the minimal adapter**

Create `searchNaverLocalPlaces(query, credentials, fetcher = fetch)` with a 5-second abort timeout, `cache: "no-store"`, non-OK rejection, safe JSON shape checking, markup removal, entity decoding, coordinate validation, and `Place[]` output.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/naver-local-search.test.ts`
Expected: PASS.

### Task 2: Insert local search before existing fallbacks

**Files:**
- Modify: `lib/api/naver-place-search.ts`
- Modify: `tests/place-search.test.ts`

- [ ] **Step 1: Write a failing priority test**

Set `NAVER_API_HUB_KEY_ID` and `NAVER_API_HUB_KEY`, return one local-search item, call `searchPlaces`, and assert one API HUB request, `mode: "LIVE"`, `source: "NAVER"`, and a 지역검색 notice.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/place-search.test.ts`
Expected: FAIL because the orchestrator still calls Geocoding first.

- [ ] **Step 3: Implement priority and fallbacks**

Call the API HUB adapter first when both new variables exist. On empty/error continue to the existing NCP Geocoding block, then demo search. Do not expose provider errors.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- tests/naver-local-search.test.ts tests/place-search.test.ts`
Expected: PASS.

### Task 3: Configure, verify, and deploy

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Local-only: `.env.local`
- Vercel-only: Production environment variables

- [ ] **Step 1: Document server-only variables**

Add `NAVER_API_HUB_KEY_ID` and `NAVER_API_HUB_KEY`, and document API HUB 지역검색 as the POI provider.

- [ ] **Step 2: Configure local and Vercel secrets**

Store the supplied pair only in ignored `.env.local` and Vercel Production secrets.

- [ ] **Step 3: Verify**

Run: `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`.
Expected: all commands exit 0.

- [ ] **Step 4: Commit and push**

Commit with `Done:` and `Remaining:` bodies, then push `main`.

- [ ] **Step 5: Deploy and smoke-test**

Run `npx vercel --prod --yes`. Confirm `/api/places/search?q=홍대입구역` returns `mode: LIVE` and five actual places on local and production.
