# Inline Recommendation Result Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visit-planner form with 1–3 recommendation cards after a successful request while keeping the map in place and showing the list first on mobile.

**Architecture:** `AppShell` remains the owner of form, request, result, active-parking, and mobile-view state. A focused `RecommendationPanel` renders the result heading, list/map toggle, cards, and edit action; `result` remains the single source of truth for planner-versus-results mode. An `AbortController` prevents an older request from switching the screen after the user has changed inputs.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2, TypeScript 7, Vitest 4, React Testing Library, jsdom, CSS media queries.

---

## File map

- Create `components/RecommendationPanel.tsx`: render result metadata, mobile toggle, recommendation cards, edit button, status announcement, and disclaimer.
- Modify `components/AppShell.tsx`: own mode through `result`, cancel stale requests, conditionally render planner or result panel, keep one map wrapper, and focus the new result heading.
- Modify `app/styles/planner.css`: add result-mode grid and result-panel layout rules.
- Modify `app/styles/map-results.css`: retain reusable parking-card styles and move result-specific selectors to the inline panel structure.
- Modify `app/styles/responsive.css`: use a 1050px result breakpoint and a list-first mobile toggle that hides the complete map wrapper.
- Modify `vitest.config.ts`: include `.test.tsx` files while leaving existing domain tests in the node environment.
- Create `tests/AppShell.test.tsx`: cover only form-to-result replacement, condition editing, invalid/stale response handling, mobile default state, and one accessibility flow.
- Modify `package.json` and create `package-lock.json`: add the React, DOM, user-event, and jsdom test dependencies with reproducible versions.

## Worker and review protocol

- Give each production or test edit below to MiniMax M3 as a separate, narrowly scoped request.
- Call MiniMax M3 with `thinking: { type: "disabled" }` and only the files required for that step.
- Do not apply an M3 diff until the primary agent checks its paths, scope, and syntax.
- Use GPT-5.6 Sol for state, concurrency, security, and regression review; Terra for UI/CSS review; Luna for lightweight command/output checks.
- After every green task, commit and push `main` as explicitly requested by the user.
- Keep automated UI coverage to the six essential flows in this plan; use browser acceptance instead of duplicating presentation-only assertions.
- Every commit body and every post-push progress update must state `Done` and `Remaining` so GitHub history and the live handoff show completed and pending work.

### Task 1: Add the UI test harness

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install exact test dependencies**

Run:

```powershell
npm install --save-dev @testing-library/react@16.3.2 @testing-library/dom@10.4.1 @testing-library/user-event@14.6.6 jsdom@30.0.1
```

Expected: exit 0; `package.json` lists all four packages in `devDependencies`; `package-lock.json` is created.

- [ ] **Step 2: Include TSX tests without changing the default node environment**

Change `vitest.config.ts` to:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] }
});
```

UI tests will opt into jsdom with a file directive; `tests/domain.test.ts` remains in node.

- [ ] **Step 3: Run the unchanged quality checks**

Run:

```powershell
npm run lint
npm run typecheck
npm test
```

Expected: all three commands exit 0 and existing `tests/domain.test.ts` passes with 0 failures.

- [ ] **Step 4: Commit and push the harness**

```powershell
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add component test harness" -m "Done: Added React Testing Library and jsdom support." -m "Remaining: Result transition, request correctness, responsive UI, accessibility, and browser acceptance."
git push origin main
```

Expected: push succeeds and `git status --short --branch` shows `main...origin/main` with no tracked changes.

### Task 2: Drive the core form-to-results transition with a failing test

**Files:**
- Create: `tests/AppShell.test.tsx`
- Create: `components/RecommendationPanel.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Create the shared UI fixture and transition test**

Create `tests/AppShell.test.tsx` with this initial content:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import type { ParkingRecommendation, RecommendationResponse } from "@/lib/types";

vi.mock("@/hooks/use-geolocation", () => ({
  useGeolocation: () => ({
    value: null,
    status: "idle",
    error: null,
    requestPosition: vi.fn(),
    refreshPosition: vi.fn()
  })
}));

vi.mock("@/components/MapPanel", () => ({
  MapPanel: ({ activeId }: { activeId?: string | null }) => (
    <div data-testid="map-panel" data-active-id={activeId ?? ""}>지도</div>
  )
}));

vi.mock("@/components/NavigationButtons", () => ({
  NavigationButtons: () => <div data-testid="navigation-buttons">길안내</div>
}));

const recommendation = (id: string, name: string, rank: number): ParkingRecommendation => ({
  id,
  sourceId: id,
  source: "DEMO",
  name,
  address: "서울 강남구",
  latitude: 37.5 + rank / 1000,
  longitude: 127.02 + rank / 1000,
  capacity: 100,
  occupiedSpaces: 60,
  availableSpaces: 40,
  realtimeUpdatedAt: new Date().toISOString(),
  realtimeSupported: true,
  trendPer30Minutes: -2,
  feeRule: {
    isFree: false,
    baseMinutes: 10,
    baseFee: 600,
    additionalMinutes: 10,
    additionalFee: 600,
    dailyMaximumFee: 26000
  },
  operatingLabel: "24시간",
  isOpen: true,
  rank,
  score: 80 - rank,
  driveMinutes: 10 + rank,
  driveDistanceMeters: 2000 + rank,
  routeSource: "ESTIMATE",
  walkMinutes: 5 + rank,
  walkDistanceMeters: 400 + rank,
  estimatedFee: 10800,
  predictedAvailable: { min: 25, max: 55, confidence: "MEDIUM" },
  availabilityRisk: "LOW",
  realtimeStatus: "LIVE",
  dataAgeMinutes: 4,
  reasons: ["도착 시에도 빈자리가 남을 가능성이 높습니다."],
  warnings: ["자동차 시간은 거리 기반 추정치입니다."],
  scoreBreakdown: { availability: 30, walk: 20, cost: 15, drive: 10, reliability: 4 }
});

const response: RecommendationResponse = {
  generatedAt: new Date().toISOString(),
  dataMode: "DEMO",
  dataNotice: "API 키가 없어 데모 주차장으로 추천했습니다.",
  destination: {
    id: "coex",
    name: "코엑스",
    address: "서울 강남구 영동대로 513",
    latitude: 37.5117,
    longitude: 127.0592,
    category: "문화·쇼핑",
    source: "DEMO"
  },
  recommendations: [
    recommendation("parking-1", "주차장 1", 1),
    recommendation("parking-2", "주차장 2", 2),
    recommendation("parking-3", "주차장 3", 3)
  ]
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderReadyApp(payload: RecommendationResponse = response) {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(payload)
  }));
  render(<AppShell />);
  await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
  return user;
}

describe("AppShell recommendation results", () => {
  it("replaces the planner with recommendation cards after success", async () => {
    const user = await renderReadyApp();

    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    expect(await screen.findByRole("heading", { name: "코엑스 주변 추천" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "방문 계획 입력" })).toBeNull();
    expect(screen.getByText("주차장 1")).toBeTruthy();
    expect(screen.getByText("주차장 2")).toBeTruthy();
    expect(screen.getByText("주차장 3")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the transition test and confirm the current bug**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: FAIL because the existing `방문 계획 입력` heading remains after results are rendered below it.

- [ ] **Step 3: Create `RecommendationPanel`**

Create `components/RecommendationPanel.tsx` with this public interface:

```tsx
"use client";

import { CircleAlert, List, Map } from "lucide-react";
import { Badge } from "@/components/Badge";
import { ParkingCard } from "@/components/ParkingCard";
import type { RecommendationResponse } from "@/lib/types";

export interface RecommendationPanelProps {
  result: RecommendationResponse;
  activeId: string | null;
  mobileView: "map" | "list";
  onSelect: (id: string) => void;
  onMobileViewChange: (view: "map" | "list") => void;
}

export function RecommendationPanel({
  result,
  activeId,
  mobileView,
  onSelect,
  onMobileViewChange
}: RecommendationPanelProps) {
  return <section className="result-panel" aria-labelledby="recommendation-title">
    <div className="results-head">
      <div>
        <span className="eyebrow">TOP 3 RECOMMENDATIONS</span>
        <h2>{result.destination.name} 주변 추천</h2>
        <p>{result.dataNotice}</p>
      </div>
      <Badge tone={result.dataMode === "LIVE" ? "success" : result.dataMode === "FALLBACK" ? "warning" : "demo"}>
        {result.dataMode === "LIVE" ? "서울시 실데이터" : result.dataMode === "FALLBACK" ? "대체 데이터" : "데모 모드"}
      </Badge>
    </div>
    <div className="view-toggle" aria-label="결과 보기 방식">
      <button className={mobileView === "list" ? "is-active" : ""} onClick={() => onMobileViewChange("list")}><List size={16} /> 목록</button>
      <button className={mobileView === "map" ? "is-active" : ""} onClick={() => onMobileViewChange("map")}><Map size={16} /> 지도</button>
    </div>
    <div className="parking-list">
      {result.recommendations.map(parking => <ParkingCard key={parking.id} parking={parking} active={parking.id === activeId} onSelect={() => onSelect(parking.id)} />)}
    </div>
    <div className="disclaimer"><CircleAlert size={17} /><p><strong>추천은 주차면 예약이 아닙니다.</strong> 도착 전 2·3순위도 함께 확인하세요.</p></div>
  </section>;
}
```

- [ ] **Step 4: Replace the always-visible left planner in `AppShell`**

In `components/AppShell.tsx`:

1. Import `RecommendationPanel`.
2. Remove `resultRef` and the delayed `scrollIntoView` call because the bottom result section is removed.
3. Keep the existing `mobileView` initialization in this task; Task 4 changes the successful-request default under a failing test.
4. Inside `.planner-grid`, render the complete existing `.control-card` only when `result` is null; otherwise render `RecommendationPanel`.
5. Remove the complete separate bottom result block that starts with `{result ? <section className="results"` and ends immediately before `<section className="how">`.
6. Remove the now-unused `List` and `ParkingCard` imports from `AppShell`; `RecommendationPanel` owns them.

At the start of the planner section, replace the static container and immediate control-card opening with:

```tsx
<section className="planner"><div className={`container planner-grid${result ? ` planner-grid--results planner-grid--mobile-${mobileView}` : ""}`}>
  {result ? (
    <RecommendationPanel
      result={result}
      activeId={activeId}
      mobileView={mobileView}
      onSelect={activate}
      onMobileViewChange={setMobileView}
    />
  ) : (
    <div className="control-card">
```

Keep every existing child of `.control-card` unchanged. At the current boundary `</div><div className="preview-column">`, close the conditional before the preview column:

```tsx
</div>
  )}
  <div className="preview-column">
```

Move the existing `.active-route` markup directly below `MapPanel` inside `.preview-column` when `result && active`. Keep the existing origin-to-destination `.route-summary`; render `.principles` only when `!result`.

- [ ] **Step 5: Run the transition test**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: PASS for the form-to-results replacement test.

- [ ] **Step 6: Run all pre-push checks**

Run:

```powershell
npm run lint
npm run typecheck
npm test
```

Expected: all three commands exit 0.

- [ ] **Step 7: Commit and push the core transition**

```powershell
git add components/AppShell.tsx components/RecommendationPanel.tsx tests/AppShell.test.tsx
git commit -m "feat: replace planner with recommendation cards" -m "Done: Replaced the planner slot with recommendation cards after success." -m "Remaining: Request cancellation, invalid-response handling, responsive UI, accessibility, and browser acceptance."
git push origin main
```

Expected: push succeeds.

### Task 3: Preserve inputs and reject stale or empty responses

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `components/RecommendationPanel.tsx`

- [ ] **Step 1: Add failing tests for editing, response validation, and stale-request cancellation**

Add `act` to the Testing Library import, then append these cases inside the existing `describe` block:

```tsx
it("returns to the populated planner when conditions are edited", async () => {
  const user = await renderReadyApp();
  await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
  await screen.findByRole("heading", { name: "코엑스 주변 추천" });

  await user.click(screen.getByRole("button", { name: "조건 변경" }));

  expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
  expect((screen.getByLabelText("목적지 검색") as HTMLInputElement).value).toBe("코엑스");
  expect(screen.queryByText("주차장 1")).toBeNull();
});

it.each([
  [{ ...response, recommendations: [] }, "조건에 맞는 추천 주차장을 찾지 못했습니다."],
  [{ ...response, recommendations: null } as unknown as RecommendationResponse, "추천 결과를 불러오지 못했습니다."]
])("keeps the planner visible for invalid recommendations", async (payload, message) => {
  const user = await renderReadyApp(payload);

  await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
});

it("ignores an aborted response and releases loading when an input changes", async () => {
  const user = userEvent.setup();
  let capturedSignal: AbortSignal | undefined;
  let resolveFetch!: (value: {
    ok: boolean;
    json: () => Promise<RecommendationResponse>;
  }) => void;
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return new Promise<{
      ok: boolean;
      json: () => Promise<RecommendationResponse>;
    }>(resolve => { resolveFetch = resolve; });
  }));
  render(<AppShell />);
  await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
  await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

  await user.click(screen.getByRole("button", { name: "강남역" }));

  expect(capturedSignal?.aborted).toBe(true);
  expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
  expect((screen.getByRole("button", { name: /추천 주차장 찾기/ }) as HTMLButtonElement).disabled).toBe(false);

  await act(async () => {
    resolveFetch({ ok: true, json: async () => response });
    await Promise.resolve();
  });

  expect(screen.queryByRole("heading", { name: "코엑스 주변 추천" })).toBeNull();
  expect((screen.getByLabelText("목적지 검색") as HTMLInputElement).value).toBe("강남역");
});
```

- [ ] **Step 2: Run the new tests and verify the production gaps**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: FAIL because `조건 변경` does not exist in the extracted panel, empty and malformed payloads are not normalized, and the request has no abort signal.

- [ ] **Step 3: Add the edit action to `RecommendationPanel`**

Add `onEdit: () => void` to `RecommendationPanelProps`, import `Button`, and render the badge and edit button together:

```tsx
<div className="result-actions">
  <Badge tone={result.dataMode === "LIVE" ? "success" : result.dataMode === "FALLBACK" ? "warning" : "demo"}>
    {result.dataMode === "LIVE" ? "서울시 실데이터" : result.dataMode === "FALLBACK" ? "대체 데이터" : "데모 모드"}
  </Badge>
  <Button variant="ghost" size="sm" onClick={onEdit}>조건 변경</Button>
</div>
```

- [ ] **Step 4: Add request cancellation and centralized invalidation**

In `components/AppShell.tsx`, add:

```ts
const requestControllerRef = useRef<AbortController | null>(null);

const invalidateResult = useCallback(() => {
  requestControllerRef.current?.abort();
  requestControllerRef.current = null;
  setLoading(false);
  setResult(null);
  setActiveId(null);
  setError(null);
}, []);
```

At the start of `recommend`, abort the previous controller, create a new controller, and pass its signal to `fetch`:

```ts
requestControllerRef.current?.abort();
const controller = new AbortController();
requestControllerRef.current = controller;

const requestBody = {
  origin: { latitude: origin.latitude, longitude: origin.longitude },
  destination,
  arrivalAt: localInputToIso(arrival),
  durationMinutes: duration,
  profile,
  maxWalkMinutes: maxWalk
};

const response = await fetch("/api/recommendations", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(requestBody),
  signal: controller.signal
});
```

Validate and normalize the response before setting state:

```ts
const payload = await response.json().catch(() => null) as (RecommendationResponse & { error?: string }) | null;
if (!response.ok || !payload || !Array.isArray(payload.recommendations)) {
  throw new Error("추천 결과를 불러오지 못했습니다.");
}
if (payload.recommendations.length === 0) {
  throw new Error("조건에 맞는 추천 주차장을 찾지 못했습니다.");
}
if (requestControllerRef.current !== controller || controller.signal.aborted) return;
setResult(payload);
setActiveId(payload.recommendations[0]?.id ?? null);
```

In `catch`, ignore aborted controllers. Preserve only the explicit empty-result message; normalize every other failure to `추천 결과를 불러오지 못했습니다.`. In `finally`, clear loading and the ref only when the controller is still current. Use `invalidateResult` from every origin, destination, arrival, duration, profile, maximum-walk, demo-fill, and `조건 변경` handler before applying the new input value. Pass `onEdit={invalidateResult}` to `RecommendationPanel`.

Add an unmount cleanup:

```ts
useEffect(() => () => requestControllerRef.current?.abort(), []);
```

- [ ] **Step 5: Run all pre-push checks**

Run:

```powershell
npm run lint
npm run typecheck
npm test
```

Expected: all three commands exit 0; all UI and domain tests pass.

- [ ] **Step 6: Commit and push request correctness**

```powershell
git add components/AppShell.tsx components/RecommendationPanel.tsx tests/AppShell.test.tsx
git commit -m "fix: cancel stale parking recommendations" -m "Done: Preserved form inputs and blocked empty, malformed, and stale results." -m "Remaining: Responsive list-first UI, accessibility, and browser acceptance."
git push origin main
```

Expected: push succeeds.

### Task 4: Implement responsive list-first result styling

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `app/styles/planner.css`
- Modify: `app/styles/map-results.css`
- Modify: `app/styles/responsive.css`

- [ ] **Step 1: Add the mobile-default behavior test**

Append:

```tsx
it("selects the list view after every successful recommendation", async () => {
  const user = await renderReadyApp();
  await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

  const listButton = await screen.findByRole("button", { name: "목록" });
  const mapButton = screen.getByRole("button", { name: "지도" });
  expect(listButton.className).toContain("is-active");
  expect(mapButton.className).not.toContain("is-active");
});
```

- [ ] **Step 2: Run the test and verify it fails before the production change**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: FAIL because `recommend` still initializes the result view to `map`.

- [ ] **Step 3: Add result panel and desktop grid styles**

Add focused rules to `app/styles/planner.css` and `app/styles/map-results.css`:

```css
.planner-grid--results{grid-template-columns:minmax(520px,1fr) minmax(420px,1fr)}
.result-panel{min-width:0}
.result-panel .results-head{align-items:flex-start}
.result-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.result-panel .parking-list{display:grid;gap:13px}
.result-panel .view-toggle{display:none}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
```

Remove layout rules that only supported the deleted bottom `.results` container, but keep reusable `.parking-card`, `.results-head`, `.view-toggle`, `.active-route`, and `.disclaimer` styles.

- [ ] **Step 4: Add 1050px and mobile visibility rules**

Add to `app/styles/responsive.css`:

```css
@media(max-width:1050px){
  .planner-grid--results{grid-template-columns:1fr}
  .planner-grid--results .preview-column{position:static}
}

@media(max-width:680px){
  .result-panel .view-toggle{display:grid}
  .planner-grid--results .preview-column{display:none}
  .planner-grid--results.planner-grid--mobile-map .preview-column{display:grid}
  .planner-grid--results.planner-grid--mobile-map .parking-list,
  .planner-grid--results.planner-grid--mobile-map .disclaimer{display:none}
}
```

Ensure the result header and toggle remain visible in both mobile modes. Do not hide the entire `RecommendationPanel` in map mode.

In the success branch of `recommend`, replace `setMobileView("map")` with:

```ts
setMobileView("list");
```

- [ ] **Step 5: Run all pre-push checks**

Run:

```powershell
npm test
npm run lint
npm run typecheck
```

Expected: all three commands exit 0.

- [ ] **Step 6: Commit and push responsive behavior**

```powershell
git add components/AppShell.tsx app/styles/planner.css app/styles/map-results.css app/styles/responsive.css tests/AppShell.test.tsx
git commit -m "feat: show recommendation list first on mobile" -m "Done: Added desktop result sizing and mobile list-first switching." -m "Remaining: Accessibility and browser acceptance."
git push origin main
```

Expected: push succeeds.

### Task 5: Add focused result accessibility coverage

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `components/RecommendationPanel.tsx`

- [ ] **Step 1: Add one result announcement and focus test**

Append:

```tsx
it("announces results and moves focus to the result heading", async () => {
  const user = await renderReadyApp();
  await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

  await screen.findByRole("heading", { name: "코엑스 주변 추천" });
  expect((await screen.findByRole("status")).textContent).toBe("코엑스 추천 3개를 불러왔습니다.");
  await vi.waitFor(() => {
    expect(document.activeElement?.id).toBe("recommendation-title");
  });
});
```

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: FAIL because the accessible result announcement and focus target have not been implemented.

- [ ] **Step 3: Implement the status announcement and focus target**

In `RecommendationPanelProps`, add `headingRef: RefObject<HTMLHeadingElement | null>` and import `RefObject`. Change the heading and add the status node:

```tsx
<h2 id="recommendation-title" ref={headingRef} tabIndex={-1}>{result.destination.name} 주변 추천</h2>
<p className="sr-only" role="status">{result.destination.name} 추천 {result.recommendations.length}개를 불러왔습니다.</p>
```

In `AppShell`, add and pass the ref:

```tsx
const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

useEffect(() => {
  if (result) resultHeadingRef.current?.focus();
}, [result]);

<RecommendationPanel
  result={result}
  activeId={activeId}
  mobileView={mobileView}
  headingRef={resultHeadingRef}
  onSelect={activate}
  onEdit={invalidateResult}
  onMobileViewChange={setMobileView}
/>
```

Run: `npm test -- tests/AppShell.test.tsx`

Expected: all focused tests pass and focus is on `#recommendation-title`.

- [ ] **Step 4: Run all pre-push checks**

Run:

```powershell
npm run lint
npm run typecheck
npm test
```

Expected: all three commands exit 0.

- [ ] **Step 5: Commit and push accessibility coverage**

```powershell
git add components/AppShell.tsx components/RecommendationPanel.tsx tests/AppShell.test.tsx
git commit -m "feat: focus and announce recommendation results" -m "Done: Added result focus management and a concise status announcement." -m "Remaining: Full verification and desktop/mobile browser acceptance."
git push origin main
```

Expected: push succeeds.

### Task 6: Full verification and browser acceptance

**Files:**
- Verify all modified files
- Do not modify `.env.local`

- [ ] **Step 1: Run the repository verification command**

Run: `npm run verify`

Expected sequence with exit 0: repository checks, ESLint, TypeScript, all Vitest tests, and Next.js production build.

- [ ] **Step 2: Start or reuse the local server**

If port 3000 already has the ParkPick Next.js listener, reuse it. Otherwise start a hidden background process and redirect logs outside the repository:

```powershell
$outLog = Join-Path $env:TEMP 'parkpick-seoul-dev.out.log'
$errLog = Join-Path $env:TEMP 'parkpick-seoul-dev.err.log'
Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList @('run','dev','--','--hostname','127.0.0.1','--port','3000') -WorkingDirectory 'C:\Users\user\parkpick-seoul' -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
```

Poll the port and log until Next.js prints `Ready`; then confirm `http://127.0.0.1:3000` returns HTTP 200. Do not use a blocking foreground server command.

- [ ] **Step 3: Verify the desktop flow**

At a viewport wider than 1050px:

1. Use example values or select an origin and destination.
2. Click `추천 주차장 찾기`.
3. Confirm the input form disappears from the left slot.
4. Confirm 1–3 cards appear in that slot and the map remains on the right.
5. Select the second card and confirm the second map marker/route becomes active.
6. Click `조건 변경` and confirm all form values return unchanged.

- [ ] **Step 4: Verify the mobile flow**

At 390px width:

1. Run a recommendation.
2. Confirm `목록` is selected and cards appear before the map.
3. Select `지도` and confirm cards disappear while the full map wrapper and route controls appear.
4. Select `목록` again and confirm cards return.

- [ ] **Step 5: Verify the local Naver client ID without exposing it**

Confirm `.env.local` contains a non-empty `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID`, the Naver provider script loads without a missing-key error, and no Client Secret appears in browser HTML, Git diff, or tracked files. Report only `SET`/`EMPTY`, never the value.

- [ ] **Step 6: Run final Git and HTTP checks**

Run:

```powershell
git diff --check
git status --short --branch
Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 20
```

Expected: no whitespace errors, no unintended tracked changes, branch synchronized after the final push, and HTTP 200.
