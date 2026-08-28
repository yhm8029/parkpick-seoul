# 추천 점수 UI 비노출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 추천 계산과 정렬 데이터는 유지하면서 주차장 카드의 원형 숫자 점수를 사용자 화면에서 제거한다.

**Architecture:** `ParkingRecommendation.score`와 도메인 추천 로직은 변경하지 않는다. 표시 계층인 `ParkingCard`에서 점수 버튼을 제거하고 카드 헤더 CSS를 2열로 정리하며, 실제 렌더 테스트 하나로 비노출 계약을 고정한다.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS

---

### Task 1: 카드 점수 표시 제거

**Files:**
- Modify: `tests/ParkingCard.test.tsx`
- Modify: `components/ParkingCard.tsx`
- Modify: `app/styles/map-results.css`
- Modify: `app/styles/responsive.css`

- [ ] **Step 1: 점수 비노출 실패 테스트 작성**

기존 `ParkingCard` 테스트의 렌더 직후에 다음 검증을 추가한다.

```tsx
expect(screen.queryByRole("button", { name: "50점" })).toBeNull();
expect(screen.getByRole("button", { name: "1순위" })).toBeTruthy();
```

- [ ] **Step 2: 테스트가 올바른 이유로 실패하는지 확인**

Run:

```bash
npm test -- tests/ParkingCard.test.tsx
```

Expected: `50점` 버튼이 현재 DOM에 존재하므로 첫 번째 assertion이 FAIL한다.

- [ ] **Step 3: 점수 버튼 렌더링 제거**

`components/ParkingCard.tsx`의 `.parking-head` 안에서 다음 점수 버튼을 삭제한다.

```tsx
<button type="button" className="score" onClick={onSelect}>
  <strong>{parking.score}</strong>
  <span>점</span>
</button>
```

`parking.score`, `scoreBreakdown`, 추천 산식과 정렬 코드는 수정하지 않는다.

- [ ] **Step 4: 카드 헤더를 2열로 정리**

`app/styles/map-results.css`에서 `.parking-head`를 다음 2열 구조로 바꾸고 `.score` 관련 규칙을 삭제한다.

```css
.parking-head {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}
```

`app/styles/responsive.css`의 680px 규칙도 다음처럼 2열로 바꾸고 `.score` 크기 규칙을 삭제한다.

```css
.parking-head {
  grid-template-columns: 45px minmax(0, 1fr);
  gap: 9px;
}
```

390px 규칙에서는 이미 2열이므로 `.score{display:none}`만 삭제한다.

- [ ] **Step 5: 집중 테스트 통과 확인**

Run:

```bash
npm test -- tests/ParkingCard.test.tsx
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
git add tests/ParkingCard.test.tsx components/ParkingCard.tsx app/styles/map-results.css app/styles/responsive.css
git commit -m "fix: hide recommendation scores from parking cards" -m "Done: remove the visible score control while retaining internal scoring and ranking.\n\nRemaining: deploy after repository verification and push approval."
```
