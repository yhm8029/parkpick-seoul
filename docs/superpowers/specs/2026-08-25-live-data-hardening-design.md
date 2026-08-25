# ParkPick Seoul Live Data Hardening Design

## Goal

Restore a deterministic local verification pipeline and make the configured Seoul Open Data path return genuinely location-aware live parking recommendations instead of silently falling back to demo data.

## Scope

This slice contains two sequential changes:

1. Stabilize the local Node/TypeScript test toolchain.
2. Join Seoul's static parking catalog with its realtime parking feed by exact parking code.

It does not add a database, prediction history, address geocoding, fuzzy matching, holiday calendars, new map providers, or UI redesign.

## Considered approaches

### A. Runtime exact-code join (selected)

Fetch `GetParkInfo` for coordinates and `GetParkingInfo` for realtime occupancy, then join normalized rows by exact `PKLT_CD`.

- Advantages: uses the provider's stable identifier, preserves realtime values, avoids a new datastore, and fails closed when data cannot be trusted.
- Costs: two upstream datasets and separate cache policies are required.

### B. Repository snapshot of static coordinates

Commit a generated coordinate catalog and join only the realtime feed at runtime.

- Advantages: faster runtime and one fewer upstream dependency.
- Costs: requires a refresh pipeline and creates an immediately stale operational asset.

### C. Kakao address geocoding

Geocode each realtime row's address when coordinates are absent.

- Advantages: simple conceptual flow.
- Costs: quota, latency, ambiguous addresses, and a new Kakao dependency on the core Seoul-data path.

Approach A is selected because it is the smallest trustworthy production path and matches the repository rule that provider responses are normalized inside `lib/api`.

## Toolchain design

- Pin TypeScript to `6.0.3`. It retains the Compiler API used by `check-repo.mjs` and is inside `typescript-eslint@8.68.0`'s supported range (`>=4.8.4 <6.1.0`).
- Pin jsdom to `26.1.0` so the current Node `24.13.1` environment meets its engine requirement.
- Make `check:repo` use the locally locked TypeScript package. Remove the unreliable global `npm.cmd root -g` fallback and emit a direct setup error when dependencies are missing.
- Update validation documentation so `npm ci` is the required first step. Do not claim a dependency-free TypeScript/TSX check.
- Configure Turbopack's root to the repository so an unrelated parent lockfile does not affect root detection.

## Seoul data flow

```text
GetParkInfo pages
  -> validate PKLT_CD and Seoul WGS84 coordinates
  -> deterministic coordinate index keyed by PKLT_CD

GetParkingInfo pages
  -> normalize realtime occupancy, capacity, fees, timestamps, and operating labels
  -> exact PKLT_CD join with coordinate index
  -> ParkingLot[]
  -> existing recommendParking()
```

The static catalog supplies coordinates only when a realtime value exists for the same field. Realtime capacity, occupancy, timestamp, fee, and operating metadata remain authoritative. Invalid `0,0` coordinates, missing codes, unmatched codes, and non-finite values are rejected.

If a parking code has multiple valid static coordinates, sort the normalized coordinate candidates numerically and choose one deterministically. Name/address fuzzy matching and automatic geocoding are prohibited in this slice.

## Paging, caching, and failure behavior

- Fetch each service in pages of at most 1,000 rows and validate its service-specific response root and `RESULT.CODE`.
- Cache only a successful joined result for four minutes.
- Deduplicate concurrent cold or expired-cache requests with one in-flight promise.
- Do not cache failures, partial page sets, or an empty/undersized join.
- Require at least three joined parking lots. Below that threshold, throw and let the existing route return the demo `FALLBACK` response.
- Never mix demo rows with Seoul rows in one recommendation result.
- Keep `DEMO` for missing-key operation, `LIVE` for a complete successful join, and `FALLBACK` for a configured live path that failed. `dataNotice` must state that realtime occupancy was joined with static coordinates and include joined/rejected counts.

## Schema rules

- Realtime support uses `PRK_STTS_YN` together with the presence of `NOW_PRK_VHCL_CNT`; numeric zero is a valid value, not a missing value.
- Available spaces are `max(0, TPKCT - NOW_PRK_VHCL_CNT)`.
- Realtime fee fields include `BSC_PRK_CRG`, `BSC_PRK_HR`, `ADD_PRK_CRG`, `ADD_PRK_HR`, and `DAY_MAX_CRG`.
- Static coordinate fields are `LAT` and `LOT` from `GetParkInfo`.
- `isOpen` must not be hard-coded to `true`. Until arrival-time operating-hours logic is implemented, use `null` and preserve a human-readable operating label so the ranking does not assert a false open state.

## Tests

Store small sanitized fixtures representing both official schemas. Tests must cover:

- realtime rows without coordinates;
- static `0,0`, missing, and invalid coordinates;
- exact code joins and unmatched codes;
- deterministic duplicate-coordinate handling independent of row order;
- occupied count `0`;
- `DAY_MAX_CRG` mapping;
- abnormal result codes and page failures;
- cache hit, expiry, and concurrent request deduplication;
- `LIVE`, `DEMO`, and `FALLBACK` response contracts;
- no demo identifiers in a successful live result.

All production behavior changes follow red-green-refactor: a focused test must fail for the expected reason before implementation is written.

## Acceptance criteria

- `npm ci` produces no TypeScript peer-conflict or jsdom engine warning.
- `npm run check:repo` passes all checks.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- `npm run verify` passes from a clean dependency install.
- A configured live-key run produces at least three joined Seoul rows or transparently returns `FALLBACK`; it never labels demo rows as `LIVE`.
- A no-key run retains the complete demo flow.
- No raw GPS coordinate persistence, recommendation-weight change, map-provider coupling, or secret file is introduced.

## Deferred work

- Holiday-aware and midnight-crossing operating-hours evaluation.
- Static catalog persistence and stale-while-revalidate behavior.
- Address correction, fuzzy matching, or Kakao geocoding.
- Five-minute snapshots, trend calculation, prediction, and backtesting.
- Naver Directions and UI redesign.

