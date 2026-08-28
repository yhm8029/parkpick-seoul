# 예시 채우기 제거 및 일 최대요금 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입력 카드의 예시 채우기를 완전히 제거하고, 유효한 일 최대요금이 있는 주차장 카드에 이를 별도 줄로 표시한다.

**Architecture:** `AppShell`에서는 demo 장소와 handler 및 버튼을 제거한다. 테스트는 `PlaceSearch`를 작은 대역으로 교체해 장소 선택 상태만 전달한다. 요금 표시는 순수 formatter가 유효성 판단을 담당하고 `ParkingCard`가 선택적 두 번째 상세 줄을 렌더링한다.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS

---

### Task 1: 예시 채우기 제거

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: 버튼 비노출 실패 assertion 추가**

기존 `uses explicit arrival and stay labels` 테스트에 다음 assertion을 추가한다.

```tsx
expect(screen.queryByRole("button", { name: "예시 채우기" })).toBeNull();
```

- [ ] **Step 2: 현재 버튼 때문에 실패하는지 확인**

Run:

```bash
npm test -- tests/AppShell.test.tsx
```

Expected: `예시 채우기` 버튼이 존재하므로 FAIL.

- [ ] **Step 3: AppShell 테스트의 장소 선택 대역 추가**

`tests/AppShell.test.tsx`에서 `PlaceSearch`를 mock한다. 실제 input label/value 계약과 `onSelect` 호출만 보존한다.

```tsx
vi.mock("@/components/PlaceSearch", () => ({
  PlaceSearch: ({
    label,
    selected,
    onSelect,
  }: {
    label: string;
    selected: { name: string } | null;
    onSelect: (place: {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      source: "DEMO";
    }) => void;
  }) => {
    const origin = label.startsWith("출발지");
    const place = origin
      ? { id: "city-hall", name: "서울시청", address: "서울 중구", latitude: 37.5665, longitude: 126.978, source: "DEMO" as const }
      : { id: "coex", name: "코엑스", address: "서울 강남구", latitude: 37.5117, longitude: 127.0592, source: "DEMO" as const };
    return <label>{label}<input aria-label={label} value={selected?.name ?? ""} readOnly /><button type="button" onClick={() => onSelect(place)}>{label} 선택</button></label>;
  },
}));
```

공통 helper를 추가하고 기존 `예시 채우기` 클릭 여섯 곳을 이 helper 호출로 교체한다.

```tsx
async function selectReadyPlan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "출발지 직접 검색 선택" }));
  await user.click(screen.getByRole("button", { name: "목적지 검색 선택" }));
}
```

가짜 타이머 테스트에서는 동일한 두 버튼을 `fireEvent.click`으로 선택한다.

- [ ] **Step 4: production 예시 기능 제거**

`components/AppShell.tsx`에서 다음을 제거한다.

- `DEMO_PLACES` import
- `cityHall`, `coex` 상수
- `demo` 함수
- control header의 `예시 채우기` 버튼

control header는 제목 블록만 렌더링한다.

```tsx
<div className="control-head">
  <div><span className="eyebrow">PARKING PLANNER</span><h2>방문 계획 입력</h2></div>
</div>
```

- [ ] **Step 5: AppShell 집중 테스트 확인**

Run:

```bash
npm test -- tests/AppShell.test.tsx
```

Expected: PASS.

- [ ] **Step 6: 첫 구현 커밋**

```bash
git add components/AppShell.tsx tests/AppShell.test.tsx
git commit -m "fix: remove example plan fill from planner" -m "Done: remove the example-fill UI and production handler while preserving test setup through a PlaceSearch test double.\n\nRemaining: add conditional daily maximum fee details."
```

### Task 2: 일 최대요금 상세 표시

**Files:**
- Modify: `lib/utils.ts`
- Modify: `components/ParkingCard.tsx`
- Modify: `app/styles/map-results.css`
- Modify: `tests/ParkingCard.test.tsx`

- [ ] **Step 1: 일 최대요금 실패 assertion 추가**

기존 ParkingCard fixture의 `feeRule`을 다음처럼 바꾸고 렌더 후 assertion을 추가한다.

```tsx
feeRule: { isFree: false, baseMinutes: 5, baseFee: 150, dailyMaximumFee: 20_000 },

expect(screen.getByText("기본 5분 150원")).toBeTruthy();
expect(screen.getByText("1일 최대 20,000원")).toBeTruthy();
```

같은 테스트에서 `rerender`로 `dailyMaximumFee`가 없는 parking을 전달한 뒤 다음을 확인한다.

```tsx
expect(screen.queryByText(/1일 최대/)).toBeNull();
```

- [ ] **Step 2: 표시가 없어 실패하는지 확인**

Run:

```bash
npm test -- tests/ParkingCard.test.tsx
```

Expected: `1일 최대 20,000원`을 찾지 못해 FAIL.

- [ ] **Step 3: 순수 formatter 추가**

`lib/utils.ts`에 다음 함수를 추가한다.

```ts
export function formatDailyMaximumFeeLabel(rule: FeeRule): string | null {
  const value = rule.dailyMaximumFee;
  if (rule.isFree || typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `1일 최대 ${formatCurrency(value)}`;
}
```

- [ ] **Step 4: ParkingCard와 CSS에 선택적 두 번째 줄 추가**

`ParkingCard`에서 formatter 결과를 구하고 예상요금의 `<small>`을 다음 구조로 바꾼다.

```tsx
const dailyMaximumFeeLabel = formatDailyMaximumFeeLabel(parking.feeRule);

<small className="fee-detail">
  <span>{formatFeeRateLabel(parking.feeRule)}</span>
  {dailyMaximumFeeLabel ? <span>{dailyMaximumFeeLabel}</span> : null}
</small>
```

`app/styles/map-results.css`에 다음 규칙을 추가한다.

```css
.metrics .fee-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

- [ ] **Step 5: 집중 테스트 확인**

Run:

```bash
npm test -- tests/ParkingCard.test.tsx tests/AppShell.test.tsx
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

- [ ] **Step 7: 두 번째 구현 커밋**

```bash
git add lib/utils.ts components/ParkingCard.tsx app/styles/map-results.css tests/ParkingCard.test.tsx
git commit -m "feat: show daily maximum parking fees" -m "Done: show the source-provided daily maximum under the rate only when it is a valid positive amount.\n\nRemaining: review and main integration."
```
