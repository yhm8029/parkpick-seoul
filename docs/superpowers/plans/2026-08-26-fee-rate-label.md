# Fee-rate Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the recommendation card's generic fee helper with an accurate conditional rate label.

**Architecture:** Add one pure `FeeRule` formatter to `lib/utils.ts`, cover its decision table in the existing domain test file, and render the formatter result in `ParkingCard`. Fee calculation and API payloads remain unchanged.

**Tech Stack:** TypeScript 6, React 19, Vitest, React Testing Library

---

### Task 1: Pure fee-rate formatter

**Files:**
- Modify: `tests/domain.test.ts`
- Modify: `lib/utils.ts`

- [ ] **Step 1: Write the failing formatter test**

Import `formatFeeRateLabel` from `@/lib/utils` and add this focused decision-table test:

```ts
describe("fee-rate labels", () => {
  it("formats shared, tiered, free, and missing fee rules", () => {
    expect(formatFeeRateLabel({
      isFree: false,
      baseMinutes: 10,
      baseFee: 600,
      additionalMinutes: 10,
      additionalFee: 600,
    })).toBe("10분당 600원");
    expect(formatFeeRateLabel({
      isFree: false,
      baseMinutes: 30,
      baseFee: 1_000,
      additionalMinutes: 10,
      additionalFee: 500,
    })).toBe("기본 30분 1,000원 · 추가 10분 500원");
    expect(formatFeeRateLabel({ isFree: true })).toBe("무료");
    expect(formatFeeRateLabel({ isFree: false })).toBe("요금 기준 확인 필요");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/domain.test.ts`

Expected: FAIL because `formatFeeRateLabel` is not exported by `lib/utils.ts`.

- [ ] **Step 3: Implement the minimal formatter**

Add the type import and formatter to `lib/utils.ts`:

```ts
import type { FeeRule } from "@/lib/types";

export function formatFeeRateLabel(rule: FeeRule): string {
  if (rule.isFree) return "무료";

  const baseMinutes = rule.baseMinutes;
  const baseFee = rule.baseFee;
  const additionalMinutes = rule.additionalMinutes;
  const additionalFee = rule.additionalFee;
  const hasBase =
    typeof baseMinutes === "number" && baseMinutes > 0 &&
    typeof baseFee === "number" && baseFee >= 0;
  const hasAdditional =
    typeof additionalMinutes === "number" && additionalMinutes > 0 &&
    typeof additionalFee === "number" && additionalFee >= 0;

  if (hasBase && hasAdditional) {
    if (baseMinutes === additionalMinutes && baseFee === additionalFee) {
      return `${baseMinutes}분당 ${formatCurrency(baseFee)}`;
    }
    return `기본 ${baseMinutes}분 ${formatCurrency(baseFee)} · 추가 ${additionalMinutes}분 ${formatCurrency(additionalFee)}`;
  }
  if (hasBase) return `기본 ${baseMinutes}분 ${formatCurrency(baseFee)}`;
  if (hasAdditional) return `추가 ${additionalMinutes}분 ${formatCurrency(additionalFee)}`;
  return "요금 기준 확인 필요";
}
```

- [ ] **Step 4: Run the formatter test and verify GREEN**

Run: `npm test -- tests/domain.test.ts`

Expected: PASS for the domain test file.

### Task 2: Recommendation-card rendering

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Modify: `components/ParkingCard.tsx`

- [ ] **Step 1: Write the failing card-rendering assertion**

In `replaces the planner with recommendation cards after success`, append:

```ts
expect(screen.getAllByText("10분당 600원")).toHaveLength(3);
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm test -- tests/AppShell.test.tsx -t "replaces the planner"`

Expected: FAIL because the cards still render `할인 전`.

- [ ] **Step 3: Render the formatter output**

Change the utility import in `components/ParkingCard.tsx`:

```ts
import { formatCurrency, formatFeeRateLabel } from "@/lib/utils";
```

Replace the fee metric helper only:

```tsx
<small>{formatFeeRateLabel(parking.feeRule)}</small>
```

- [ ] **Step 4: Run focused and complete tests**

Run:

```text
npm test -- tests/AppShell.test.tsx -t "replaces the planner"
npm test -- tests/domain.test.ts tests/AppShell.test.tsx
```

Expected: both commands PASS.

- [ ] **Step 5: Commit and push the fee-label change**

Stage only `lib/utils.ts`, `tests/domain.test.ts`, `components/ParkingCard.tsx`, and `tests/AppShell.test.tsx`. Commit with:

```text
feat: show parking fee rate labels

Done:
- Add conditional fee-rate formatting for shared, tiered, free, and missing rules.
- Render the rate beneath each estimated fee.

Remaining:
- Apply the approved BUSL-1.1 license transition.
- Run full verification and redeploy production.
```

Push `main` to `origin` after the focused tests pass.
