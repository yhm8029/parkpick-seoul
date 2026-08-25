# Map, Search, and Parking Eligibility Hardening Design

## Goal

Fix the NAVER map that can remain indefinitely in a loading state, exclude tourist-bus-exclusive parking facilities from passenger-car recommendations, and provide a real address-search path when Kakao place search is unavailable.

## Evidence

- The NAVER Dynamic Map application has `http://127.0.0.1:3000` registered and its auth endpoint currently returns HTTP 200 for that origin.
- `MapPanel` resolves the generic script `load` event before NAVER's asynchronous SDK readiness signal. If `window.naver.maps` is not ready at that instant, the renderer returns without leaving `loading`.
- The same NCP credentials return 401 from Naver Developers Local Search and 403 from NCP Geocoding. They are valid map credentials, but Geocoding is not enabled for the application.
- Seoul live results include passenger-ineligible names such as `관광버스전용`.

## Considered Approaches

1. **Provider-specific readiness and search fallback chain (selected).** Use NAVER's documented callback parameter, explicit auth/network/timeout failures, filter tourist-bus-exclusive names in normalization, and search through Kakao, then NCP Geocoding, then demo data. This fixes the code race and preserves useful fallback behavior.
2. **Poll for global SDK objects.** This is smaller but cannot reliably distinguish authentication failure from delayed readiness and creates arbitrary retry timing.
3. **Switch all maps and search to Kakao.** This simplifies providers but is blocked by the missing Kakao REST and JavaScript keys and discards the configured NAVER map.

## Design

### NAVER map loader

Extract a NAVER-specific loader from `MapPanel`. Before appending the script, register a unique global ready callback and the documented `navermap_authFailure` hook. Add the callback query parameter to the SDK URL. Resolve only when both the callback fires and `window.naver.maps` exists. Reject on script error, authentication failure, missing SDK global, or a bounded timeout. Every rejection moves the UI from `loading` to the existing error message; no path may silently return while still loading.

Kakao behavior remains unchanged.

### Parking eligibility

Normalize the realtime parking name before creating a `ParkingLot`. Reject only names that contain both `관광버스` and `전용` after whitespace removal. This excludes `관광버스전용` and `관광버스 전용` while retaining ordinary mixed-use facilities that merely mention buses. Rejected facilities contribute to the existing rejected-row count.

### Place search

Keep Kakao keyword search as the first live provider when `KAKAO_REST_API_KEY` exists. When it is absent or fails, use server-only `NAVER_MAP_NCP_KEY_ID` and `NAVER_MAP_NCP_CLIENT_SECRET` to call NCP Geocoding. Map valid addresses to the existing `Place` contract and label the result as live address search. If NCP Geocoding is unavailable, fall back to the current demo search with an explicit notice.

The NCP secret must never use a `NEXT_PUBLIC_` name and must never enter browser code. The console must enable Geocoding for this fallback to return live results; the current 403 is handled without breaking demo search.

## Minimal verification

- One focused map-loader test proves that SDK readiness succeeds only via the callback and that a missing global or auth failure ends in `error`, not an endless spinner.
- Extend the existing Seoul normalization test with tourist-bus-exclusive and mixed-use names.
- Add at most one place-search test covering NCP mapping and demo fallback.
- Run the focused tests, then the existing full Vitest suite once. Verify the rendered map manually at `http://127.0.0.1:3000` after rebuilding.

## Deferred

- Naver Developers Local Search integration, which requires a different application credential pair.
- POI-quality search beyond Kakao keyword search or NCP address geocoding.
- Refactoring unrelated existing ESLint findings.
