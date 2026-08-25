# Live Data Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local verification deterministic on the current Windows/Node environment and produce trustworthy Seoul live parking recommendations by joining realtime rows with static coordinates.

**Architecture:** First align the locked TypeScript/jsdom toolchain and remove the unreliable global TypeScript fallback. Then isolate Seoul schema normalization in pure functions, use a testable client to page and join `GetParkInfo` with `GetParkingInfo`, and preserve the route's fail-closed demo behavior.

**Tech Stack:** Next.js 16, TypeScript 6, Vitest 4, Node 24, Seoul Open Data JSON APIs.

---

## File structure

- Modify `package.json` and `package-lock.json`: compatible exact development dependency versions.
- Modify `scripts/check-repo.mjs`: deterministic local TypeScript loading and clear setup error.
- Modify `next.config.ts`: explicit Turbopack repository root.
- Create `tests/toolchain.test.ts`: functional verification of the repository checker and locked dependency contracts.
- Create `lib/api/seoul-parking-normalize.ts`: pure schema-specific normalization and exact-code joining.
- Modify `lib/api/seoul-parking.ts`: paged upstream client, cache, in-flight deduplication, and joined result.
- Create `tests/fixtures/seoul/get-park-info.sample.json`: sanitized static-schema rows.
- Create `tests/fixtures/seoul/get-parking-info.sample.json`: sanitized realtime-schema rows.
- Create `tests/seoul-parking.test.ts`: fixture, join, pagination, cache, and failure tests.
- Modify `README.md`, `VALIDATION.md`, and `ROADMAP.md`: truthful setup, source-join behavior, and completed work.

### Task 1: Stabilize the locked verification toolchain

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/check-repo.mjs`
- Modify: `next.config.ts`
- Create: `tests/toolchain.test.ts`

- [ ] **Step 1: Write the failing functional test**

Create `tests/toolchain.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("locked verification toolchain", () => {
  it("uses a TypeScript Compiler API supported by the repository checker", () => {
    const ts = require("typescript") as typeof import("typescript");
    expect(ts.version).toBe("6.0.3");
    expect(ts.ScriptTarget.ES2022).toBeTypeOf("number");
    expect(ts.ModuleKind.ES2022).toBeTypeOf("number");
    expect(ts.ModuleResolutionKind.Bundler).toBeTypeOf("number");
  });

  it("runs the repository checker successfully", () => {
    const output = execFileSync(process.execPath, ["scripts/check-repo.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(output).toContain("Repository check passed: 9/9 checks.");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- tests/toolchain.test.ts
```

Expected: failure because the installed compiler is `7.0.2` and/or `check-repo.mjs` cannot access `ScriptTarget.ES2022`.

- [ ] **Step 3: Pin compatible dependencies**

Run:

```powershell
npm install --save-dev --save-exact typescript@6.0.3 jsdom@26.1.0
```

Confirm `package.json` contains exact versions without `^` or `~`.

- [ ] **Step 4: Remove the global TypeScript fallback**

Replace `loadTypeScript()` in `scripts/check-repo.mjs` with:

```js
function loadTypeScript() {
  try {
    const ts = require("typescript");
    assert.ok(ts.ScriptTarget?.ES2022 !== undefined, "locked TypeScript Compiler API is unavailable");
    return ts;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`TypeScript is unavailable or incompatible. Run npm ci first. ${detail}`);
  }
}
```

Delete the `npm.cmd`/`npm root -g` lookup. Keep `execFileSync` because later Git checks still use it.

- [ ] **Step 5: Pin Turbopack to this repository**

Add to `nextConfig` in `next.config.ts`:

```ts
turbopack: {
  root: process.cwd(),
},
```

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm test -- tests/toolchain.test.ts
npm run check:repo
npm run lint
npm run typecheck
```

Expected: all commands exit 0; `check:repo` reports 9/9.

- [ ] **Step 7: Commit the toolchain slice**

```powershell
git add package.json package-lock.json scripts/check-repo.mjs next.config.ts tests/toolchain.test.ts
git commit -m "fix: stabilize local verification toolchain"
```

### Task 2: Normalize and join the two Seoul schemas

**Files:**
- Create: `lib/api/seoul-parking-normalize.ts`
- Create: `tests/fixtures/seoul/get-park-info.sample.json`
- Create: `tests/fixtures/seoul/get-parking-info.sample.json`
- Create: `tests/seoul-parking.test.ts`

- [ ] **Step 1: Add sanitized schema fixtures**

Create static rows containing at least three matching codes, one `0,0` row, one unmatched row, and a duplicated valid code. Create realtime rows containing matching codes, a zero occupied count, an unmatched code, `DAY_MAX_CRG`, and `PRK_STTS_YN`. Preserve official field names and replace names/addresses with neutral test values.

Fixture wrapper shapes:

```json
{"GetParkInfo":{"list_total_count":6,"RESULT":{"CODE":"INFO-000","MESSAGE":"정상 처리되었습니다"},"row":[]}}
```

```json
{"GetParkingInfo":{"list_total_count":5,"RESULT":{"CODE":"INFO-000","MESSAGE":"정상 처리되었습니다"},"row":[]}}
```

- [ ] **Step 2: Write failing pure join tests**

In `tests/seoul-parking.test.ts`, define the desired public contract:

```ts
import staticFixture from "./fixtures/seoul/get-park-info.sample.json";
import realtimeFixture from "./fixtures/seoul/get-parking-info.sample.json";
import { joinSeoulParkingRows } from "@/lib/api/seoul-parking-normalize";

it("joins realtime occupancy to valid static coordinates by exact parking code", () => {
  const result = joinSeoulParkingRows(
    realtimeFixture.GetParkingInfo.row,
    staticFixture.GetParkInfo.row,
  );
  expect(result.lots).toHaveLength(3);
  expect(result.stats).toEqual({ liveRows: 5, matchedRows: 3, rejectedRows: 2 });
  expect(result.lots.every(lot => lot.source === "SEOUL_OPEN_DATA")).toBe(true);
});

it("keeps an occupied count of zero and maps the realtime daily maximum", () => {
  const result = joinSeoulParkingRows(
    realtimeFixture.GetParkingInfo.row,
    staticFixture.GetParkInfo.row,
  );
  const emptyLot = result.lots.find(lot => lot.sourceId === "LIVE-ZERO");
  expect(emptyLot?.occupiedSpaces).toBe(0);
  expect(emptyLot?.availableSpaces).toBe(emptyLot?.capacity);
  expect(emptyLot?.feeRule.dailyMaximumFee).toBe(24000);
});

it("chooses one deterministic coordinate for duplicate static codes", () => {
  const rows = [...staticFixture.GetParkInfo.row].reverse();
  const forward = joinSeoulParkingRows(realtimeFixture.GetParkingInfo.row, staticFixture.GetParkInfo.row);
  const reversed = joinSeoulParkingRows(realtimeFixture.GetParkingInfo.row, rows);
  expect(reversed.lots.map(lot => [lot.sourceId, lot.latitude, lot.longitude]))
    .toEqual(forward.lots.map(lot => [lot.sourceId, lot.latitude, lot.longitude]));
});
```

- [ ] **Step 3: Run the focused test and verify RED**

```powershell
npm test -- tests/seoul-parking.test.ts
```

Expected: failure because `seoul-parking-normalize.ts` and `joinSeoulParkingRows` do not exist.

- [ ] **Step 4: Implement pure normalization**

Create `lib/api/seoul-parking-normalize.ts` with:

```ts
import type { Coordinate, ParkingLot } from "@/lib/types";
import { numberFrom, parseSeoulDate } from "@/lib/utils";

export type SeoulRow = Record<string, unknown>;

export interface SeoulJoinResult {
  lots: ParkingLot[];
  stats: { liveRows: number; matchedRows: number; rejectedRows: number };
}

export function joinSeoulParkingRows(realtimeRows: SeoulRow[], staticRows: SeoulRow[]): SeoulJoinResult {
  // Build a PKLT_CD -> Coordinate index from finite Seoul-range LAT/LOT values.
  // Sort candidates by latitude then longitude before selecting one.
  // Map only realtime rows with a non-empty exact PKLT_CD and indexed coordinate.
  // Realtime values remain authoritative. Set isOpen to null.
  // Return deterministic lots sorted by sourceId and exact counts.
  throw new Error("implement from the fixture contract");
}
```

Implement the body minimally to satisfy the tests. Use `DAY_MAX_CRG` for realtime daily maximum and never treat numeric zero as missing.

- [ ] **Step 5: Verify GREEN and edge cases**

```powershell
npm test -- tests/seoul-parking.test.ts
npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 6: Commit the schema slice**

```powershell
git add lib/api/seoul-parking-normalize.ts tests/fixtures/seoul tests/seoul-parking.test.ts
git commit -m "test: cover Seoul parking response contracts"
```

### Task 3: Add paged fetching, cache, and concurrent-request deduplication

**Files:**
- Modify: `lib/api/seoul-parking.ts`
- Modify: `tests/seoul-parking.test.ts`

- [ ] **Step 1: Write failing client tests**

Extend `tests/seoul-parking.test.ts` around an injectable factory:

```ts
import { createSeoulParkingClient } from "@/lib/api/seoul-parking";

it("fetches both services, joins them, and caches only the successful result", async () => {
  let now = 1_000;
  const fetchMock = vi.fn(async (input: string | URL) => makePagedResponse(String(input)));
  const client = createSeoulParkingClient({ fetchImpl: fetchMock as typeof fetch, now: () => now });
  const first = await client.fetchParkingLots("test-key");
  const second = await client.fetchParkingLots("test-key");
  expect(first.lots).toHaveLength(3);
  expect(second).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  now += 4 * 60_000 + 1;
  await client.fetchParkingLots("test-key");
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("deduplicates concurrent cold requests", async () => {
  const fetchMock = vi.fn(async (input: string | URL) => makePagedResponse(String(input)));
  const client = createSeoulParkingClient({ fetchImpl: fetchMock as typeof fetch, now: () => 1_000 });
  await Promise.all([
    client.fetchParkingLots("test-key"),
    client.fetchParkingLots("test-key"),
    client.fetchParkingLots("test-key"),
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(["GetParkInfo", "GetParkingInfo"])("rejects a partial or failed %s response", async service => {
  const fetchMock = vi.fn(async (input: string | URL) => makeFailedResponse(String(input), service));
  const client = createSeoulParkingClient({ fetchImpl: fetchMock as typeof fetch, now: () => 1_000 });
  await expect(client.fetchParkingLots("test-key")).rejects.toThrow();
});
```

The `makePagedResponse` helper must return real `Response` objects using the fixture wrappers and assert requested service names. Add a pagination case with `list_total_count > 1000` and verify the second page indexes.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/seoul-parking.test.ts
```

Expected: failure because `createSeoulParkingClient` does not exist.

- [ ] **Step 3: Implement the client**

Refactor `lib/api/seoul-parking.ts` to expose:

```ts
export interface SeoulParkingClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createSeoulParkingClient(options: SeoulParkingClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cache: { until: number; value: Awaited<ReturnType<typeof load>> } | null = null;
  let inFlight: Promise<Awaited<ReturnType<typeof load>>> | null = null;

  async function load(key: string) {
    // Fetch complete GetParkInfo and GetParkingInfo page sets.
    // Validate each service root and result code, then exact-join the rows.
    // Require at least three joined lots and create a transparent notice.
  }

  return {
    async fetchParkingLots(key: string) {
      if (cache && cache.until > now()) return cache.value;
      if (inFlight) return inFlight;
      inFlight = load(key).then(value => {
        cache = { until: now() + 4 * 60_000, value };
        return value;
      }).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
```

Keep the existing public `fetchSeoulParkingLots()` wrapper. It reads `SEOUL_OPEN_API_KEY`, rejects a missing key, and calls the default client. Encode the key in the existing provider URL and retain the eight-second timeout.

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/seoul-parking.test.ts
npm run check:repo
npm run lint
npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 5: Commit the client slice**

```powershell
git add lib/api/seoul-parking.ts tests/seoul-parking.test.ts
git commit -m "fix: join Seoul live parking with static coordinates"
```

### Task 4: Update contracts and run complete verification

**Files:**
- Modify: `README.md`
- Modify: `VALIDATION.md`
- Modify: `ROADMAP.md`
- Test: all tests and production build

- [ ] **Step 1: Update documentation**

Document these exact facts:

- `npm ci` precedes every validation command.
- `GetParkingInfo` supplies realtime occupancy and `GetParkInfo` supplies coordinates, joined by exact `PKLT_CD`.
- Invalid/unmatched coordinates cause rows to be rejected; fewer than three trusted rows fail closed to demo `FALLBACK`.
- The fixture regression roadmap item is complete.
- Operating-hours/holiday logic and historical prediction remain deferred.

- [ ] **Step 2: Reinstall from the lockfile**

```powershell
npm ci
npm ls typescript typescript-eslint jsdom
```

Expected: TypeScript `6.0.3`, jsdom `26.1.0`, and no invalid peer dependency or unsupported-engine error.

- [ ] **Step 3: Run the complete local gate**

```powershell
npm run verify
git diff --check
git status --short
```

Expected: `check:repo` 9/9, ESLint pass, typecheck pass, all Vitest files pass, production build pass, and no whitespace errors.

- [ ] **Step 4: Run the live-key probe when a local key is available**

Start the app with `SEOUL_OPEN_API_KEY` supplied only through the process environment or an ignored `.env.local`. POST a valid Seoul recommendation request to `/api/recommendations` and assert:

```ts
expect(response.dataMode).toBe("LIVE");
expect(response.recommendations.length).toBeGreaterThanOrEqual(1);
expect(response.recommendations.every(item => item.source === "SEOUL_OPEN_DATA")).toBe(true);
expect(response.recommendations.some(item => item.id.startsWith("DEMO-"))).toBe(false);
```

If the real catalog joins fewer than three rows, record the exact joined/rejected counts and do not weaken the fixture-tested fail-closed threshold.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md VALIDATION.md ROADMAP.md
git commit -m "docs: document joined Seoul live data validation"
```

