# Expandable Top Ten Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return up to ten NAVER-enriched parking recommendations while showing three initially and expanding cards and map markers together on demand.

**Architecture:** The pure recommendation domain owns the ten-result cap, the server route freezes and enriches that bounded membership, and `AppShell` owns the collapsed/expanded view so `RecommendationPanel` and `MapPanel` receive the same visible subset. Existing per-route fallback and no-store behavior remain unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, NAVER Directions 5, Vitest, React Testing Library

---

### Task 1: Expand the recommendation domain cap

**Files:**
- Modify: `lib/domain/recommend.ts`
- Modify: `tests/domain.test.ts`

- [ ] **Step 1: Write failing AUTO and MANUAL cap tests**

Create eleven eligible fixture lots and assert both modes return ten items with ranks 1 through 10. Update the existing nearest-candidate test so the eleventh nearest lot is excluded rather than the fourth.

```ts
expect(result.recommendations).toHaveLength(10);
expect(result.recommendations.map(item => item.rank)).toEqual([1,2,3,4,5,6,7,8,9,10]);
expect(result.recommendations.map(item => item.id)).not.toContain("lot-11");
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/domain.test.ts`

Expected: FAIL because AUTO and MANUAL currently cap at three.

- [ ] **Step 3: Implement the ten-result cap**

Add and use one domain constant:

```ts
const MAX_RECOMMENDATIONS = 10;
```

Rename `nearestThree` to `nearestCandidates`, change both `.slice(0, 3)` calls to `.slice(0, MAX_RECOMMENDATIONS)`, and calculate AUTO `effectiveDistanceMeters` from the farthest selected candidate.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/domain.test.ts`

Expected: PASS.

### Task 2: Enrich the frozen ten candidates with NAVER routes

**Files:**
- Modify: `lib/api/naver-directions.ts`
- Modify: `app/api/recommendations/route.ts`
- Modify: `tests/naver-directions.test.ts`
- Modify: `tests/recommendations-route.test.ts`

- [ ] **Step 1: Write failing bounded-enrichment tests**

Add an adapter test passing eleven lots and assert exactly ten fetch calls and ten normalized routes. Add a worst-case geometry fixture with 2,500 path points and more than 256 sections per response; assert ten normalized routes contain at most 25,000 total path points, at most 2,560 total sections, and serialize below 2MiB. Update the route handler test fixture to provide at least eleven nearby lots and assert:

```ts
expect(mocks.naverRoutes.mock.calls[0][1]).toHaveLength(10);
expect(body.recommendations).toHaveLength(10);
expect(new Set(body.recommendations.map(item => item.id))).toEqual(
  new Set(mocks.naverRoutes.mock.calls[0][1].map(item => item.id)),
);
expect(body.recommendations.map(item => item.id)).not.toContain("lot-11");
```

Retain assertions that Kakao remains dormant and all successful candidates carry NAVER route data.

Add one partial-failure route-handler assertion: return NAVER routes for nine of the ten frozen candidates and verify the response still has ten recommendations, nine `NAVER_DIRECTIONS` sources, and one `ESTIMATE` source.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/naver-directions.test.ts tests/recommendations-route.test.ts`

Expected: FAIL because the adapter and frozen membership stop at three.

- [ ] **Step 3: Expand only the bounded adapter call**

In `lib/api/naver-directions.ts`, add:

```ts
const MAX_ROUTE_CANDIDATES = 10;
const MAX_CONGESTION_SECTIONS = 256;
```

Change `lots.slice(0, 3)` to `lots.slice(0, MAX_ROUTE_CANDIDATES)` and cap normalized sections with `.slice(0, MAX_CONGESTION_SECTIONS)`. Preserve `Promise.all`, candidate-level `null` fallback, secret handling, timeout, geometry normalization, and logging.

The route handler continues to call `recommendParking(lots, input)` once, sends only that bounded result to NAVER, and re-ranks only `routeCandidates`; no unbounded lot may re-enter.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/naver-directions.test.ts tests/recommendations-route.test.ts`

Expected: PASS.

### Task 3: Synchronize card and map expansion

**Files:**
- Modify: `components/AppShell.tsx`
- Modify: `components/RecommendationPanel.tsx`
- Modify: `components/MapPanel.tsx`
- Modify: `app/styles/result-panel.css`
- Modify: `tests/AppShell.test.tsx`
- Modify: `tests/MapPanel.naver.test.tsx`

- [ ] **Step 1: Write the failing expansion test**

Build a ten-item `RecommendationResponse`. After submit, assert only ranks 1-3 are rendered and the mocked map count is 3. Expand, select rank 2, collapse, and assert map active remains rank 2. Expand again, select rank 10, collapse, and assert map active becomes rank 1. Expand and select rank 10 once more, then click `조건 변경`; assert the map is collapsed to three and active rank 1. Submit a fresh response containing the same rank-10 id and assert the collapsed result still activates rank 1. Also test a three-item response has no more button.

```tsx
expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
await user.click(screen.getByRole("button", { name: "추천 7곳 더 보기" }));
expect(screen.getByTestId("map-recommendation-count").textContent).toBe("10");
await user.click(screen.getByRole("button", { name: "접기" }));
expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/AppShell.test.tsx -t "expands up to ten recommendations"`

Expected: FAIL because all response cards and markers are rendered and no toggle exists.

- [ ] **Step 3: Implement shared visible-result state**

In `AppShell`, add:

```ts
const INITIAL_VISIBLE_RECOMMENDATIONS = 3;
const [resultsExpanded, setResultsExpanded] = useState(false);
const visibleRecommendations = useMemo(
  () => result
    ? result.recommendations.slice(0, resultsExpanded ? result.recommendations.length : INITIAL_VISIBLE_RECOMMENDATIONS)
    : [],
  [result, resultsExpanded],
);
```

Create one `collapseResults(items)` helper. It sets `resultsExpanded` to `false` and changes `activeId` to rank 1 only when the current id is absent from `items.slice(0, 3)`. Use it for the user `접기` action, `beginEdit`, and successful response application with the new payload items. This keeps cards, map, active route, and mobile bar synchronized at every collapse entry point.

Pass `visibleRecommendations` to `MapPanel`. Pass `expanded`, `visibleRecommendations`, and `onToggleExpanded` to `RecommendationPanel` while retaining the full `result` for total count and notices.

- [ ] **Step 4: Render the toggle and dynamic copy**

In `RecommendationPanel`, map `visibleRecommendations` instead of the complete response, render `TOP ${result.recommendations.length} RECOMMENDATIONS`, and show this button only when total count exceeds three:

```tsx
<Button variant="secondary" size="md" onClick={onToggleExpanded}>
  {expanded ? "접기" : `추천 ${result.recommendations.length - 3}곳 더 보기`}
</Button>
```

Change the disclaimer to `도착 전 다른 순위도 함께 확인하세요.` Add a centered `.results-more` wrapper without changing card layout.

Change the MapPanel footer from the fixed `추천 1~3순위` to `추천 1~${recommendations.length}순위` when recommendations exist, so expansion state is reflected without introducing new props.

Add a focused `MapPanel.naver.test.tsx` assertion rendering ten recommendation fixtures and checking `추천 1~10순위`; retain the existing three-result assertion as `추천 1~3순위`.

Change the AUTO hint from `가까운 공영주차장 3곳 자동 탐색` to `가까운 공영주차장 최대 10곳 자동 탐색`.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: all AppShell tests pass.

### Task 4: Align product documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `VALIDATION.md`
- Modify: `docs/superpowers/specs/2026-08-26-expandable-top-ten-recommendations-design.md`
- Modify: `docs/superpowers/plans/2026-08-26-expandable-top-ten-recommendations.md`

- [ ] **Step 1: Update exact product contracts**

Replace claims of a fixed three-result API with: up to ten candidates are returned, NAVER-enriched in parallel, and the UI initially exposes three with an expandable remainder. Preserve the 1km AUTO and selected MANUAL radius rules. Record the accepted maximum ten Directions calls per recommendation, the 25,000-point/2,560-section response ceiling, and NAVER Cloud quota-alert monitoring.

- [ ] **Step 2: Run full verification**

Run: `npm run verify`

Expected: repository checks, lint, typecheck, all Vitest suites, and Next.js production build exit 0.

- [ ] **Step 3: Commit and push**

```powershell
git add lib/domain/recommend.ts lib/api/naver-directions.ts app/api/recommendations/route.ts components/AppShell.tsx components/RecommendationPanel.tsx components/MapPanel.tsx app/styles/result-panel.css tests/domain.test.ts tests/naver-directions.test.ts tests/recommendations-route.test.ts tests/AppShell.test.tsx tests/MapPanel.naver.test.tsx README.md SPEC.md VALIDATION.md docs/ARCHITECTURE.md docs/superpowers/specs/2026-08-26-expandable-top-ten-recommendations-design.md docs/superpowers/plans/2026-08-26-expandable-top-ten-recommendations.md
git commit -m "feat: expand parking recommendations to ten" -m "Done: return ten NAVER-enriched candidates and synchronize card/map expansion." -m "Remaining: deploy the verified main build to Vercel."
git push origin main
```

- [ ] **Step 4: Deploy and verify production**

Run:

```powershell
npx --yes vercel@latest --prod --yes
npx --yes vercel@latest inspect https://parkpick-seoul.vercel.app
$response = Invoke-WebRequest -UseBasicParsing -Uri 'https://parkpick-seoul.vercel.app' -TimeoutSec 30
if ($response.StatusCode -ne 200) { throw "Production HTTP $($response.StatusCode)" }
```

Expected: production deployment `READY`, alias `https://parkpick-seoul.vercel.app`, and HTTP 200. The automated AppShell test is the acceptance check for 3→10→3 interaction and selection safety; do not claim production interaction was manually verified without browser evidence.

When in-app browser control is available, open the production alias, use `예시 채우기`, submit, verify three cards plus `추천 N곳 더 보기`, expand to the API total, and collapse to three. If browser control is unavailable, report that limitation and rely only on the automated UI contract plus HTTP/API smoke without claiming a production interaction check.
