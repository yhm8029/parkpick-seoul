# 주차 추천 백그라운드 자동 갱신 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추천 결과 화면에서 기존 UI 상태를 보존하며 2분마다 주차 정보를 자동 갱신한다.

**Architecture:** `AppShell`의 추천 요청을 수동·백그라운드 모드가 공유하는 callback으로 만든다. 백그라운드 성공은 결과 데이터와 유효한 선택만 갱신하고, 2분 interval 및 visibility 복귀 검사는 별도 effect가 관리한다.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

---

### Task 1: 2분 백그라운드 갱신

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: 자동 갱신 실패 테스트 작성**

`tests/AppShell.test.tsx`의 `afterEach`에 `vi.useRealTimers()`를 추가하고, 기존 describe에 테스트 하나를 추가한다. 테스트는 가짜 타이머로 2분 전 호출 없음, 2분 시 추가 호출, 선택·펼침 상태 유지를 함께 확인한다.

```tsx
it("refreshes visible results every two minutes without resetting result UI state", async () => {
  vi.useFakeTimers();
  const refreshed = {
    ...tenResponse,
    recommendations: tenResponse.recommendations.map((item) =>
      item.id === "parking-2" ? { ...item, availableSpaces: 31 } : item,
    ),
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => tenResponse })
    .mockResolvedValueOnce({ ok: true, json: async () => refreshed });
  vi.stubGlobal("fetch", fetchMock);

  render(<AppShell />);
  fireEvent.click(screen.getByRole("button", { name: /예시 채우기/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await Promise.resolve();
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "추천 7곳 더 보기" }));
  fireEvent.click(screen.getByRole("button", { name: /2\s*순위/ }));

  act(() => vi.advanceTimersByTime(119_999));
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("map-recommendation-count").textContent).toBe("10");
  expect(screen.getByTestId("map-panel").getAttribute("data-active")).toBe("parking-2");
  expect(screen.getByText("31면")).toBeTruthy();
});
```

- [ ] **Step 2: 테스트가 올바른 이유로 실패하는지 확인**

Run:

```bash
npm test -- tests/AppShell.test.tsx
```

Expected: 120초 경과 뒤에도 fetch 호출이 1회라 FAIL.

- [ ] **Step 3: 요청 함수에 수동·백그라운드 모드 추가**

`components/AppShell.tsx`에 상수와 성공 시각 ref를 추가한다.

```tsx
const AUTO_REFRESH_INTERVAL_MS = 2 * 60_000;
type RecommendationRunMode = "manual" | "background";

const lastSuccessfulRequestAtRef = useRef<number | null>(null);
const shouldFocusResultHeadingRef = useRef(false);
```

기존 비동기 본문을 `runRecommendation`이라는 `useCallback(async (mode: RecommendationRunMode) => ...)`로 바꾼다. `background` 모드에서는 진행 중 요청이 있으면 즉시 반환하고, `cancelInFlight`, `setLoading`, 오류·빈 결과 UI 초기화를 실행하지 않는다.

React 클릭 이벤트가 실행 모드 인자로 전달되지 않도록 버튼용 wrapper를 별도로 둔다.

```tsx
const recommend = useCallback(() => {
  void runRecommendation("manual");
}, [runRecommendation]);
```

수동 성공은 기존 동작을 유지하고 포커스 ref를 설정한다.

```tsx
shouldFocusResultHeadingRef.current = true;
lastSuccessfulRequestAtRef.current = Date.now();
setResult(payload);
collapseResults(payload.recommendations);
setMobileView("list");
setEditing(false);
```

백그라운드 성공은 다음 상태만 갱신한다.

```tsx
lastSuccessfulRequestAtRef.current = Date.now();
setResult(payload);
setActiveId((current) =>
  current && payload.recommendations.some((item) => item.id === current)
    ? current
    : payload.recommendations[0]?.id ?? null,
);
```

백그라운드 실패·비정상 응답은 기존 결과를 유지하고 반환한다. `finally`에서는 수동 모드일 때만 `setLoading(false)`를 실행한다.

기존 포커스 effect는 자동 결과 교체에 반응하지 않도록 다음처럼 제한한다.

```tsx
useEffect(() => {
  if (!result || !shouldFocusResultHeadingRef.current) return;
  shouldFocusResultHeadingRef.current = false;
  resultHeadingRef.current?.focus();
}, [result]);
```

- [ ] **Step 4: interval과 문서 visibility effect 추가**

결과가 있고 편집 중이 아닐 때만 interval을 등록한다.

```tsx
useEffect(() => {
  if (!result || editing) return;
  const refresh = () => {
    if (document.visibilityState === "visible") void runRecommendation("background");
  };
  const interval = window.setInterval(refresh, AUTO_REFRESH_INTERVAL_MS);
  const onVisibilityChange = () => {
    const lastSuccess = lastSuccessfulRequestAtRef.current;
    if (
      document.visibilityState === "visible" &&
      lastSuccess !== null &&
      Date.now() - lastSuccess >= AUTO_REFRESH_INTERVAL_MS
    ) {
      void runRecommendation("background");
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}, [editing, result, runRecommendation]);
```

- [ ] **Step 5: 집중 테스트 통과 확인**

Run:

```bash
npm test -- tests/AppShell.test.tsx
```

Expected: PASS.

- [ ] **Step 6: 전체 검증**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 7: 구현 커밋**

```bash
git add components/AppShell.tsx tests/AppShell.test.tsx
git commit -m "feat: refresh parking recommendations in background" -m "Done: refresh visible results every two minutes without resetting selection or expanded state.\n\nRemaining: merge, push, and verify deployment when requested."
```
