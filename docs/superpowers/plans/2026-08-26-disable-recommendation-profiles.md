# Recommendation Profile Selector Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the recommendation-profile selector while preserving its code and submitting the default `BALANCED` profile.

**Architecture:** A local feature flag in `AppShell` controls only the selector fieldset's rendering. Existing profile state, option definitions, request serialization, and server behavior remain intact so the selector can be restored by changing one flag.

**Tech Stack:** Next.js, React, TypeScript, Vitest, React Testing Library

---

### Task 1: Lock the hidden-selector contract

**Files:**
- Modify: `tests/AppShell.test.tsx`
- Test: `tests/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Add one focused test inside `AppShell recommendation results`:

```tsx
it("hides recommendation profiles and submits the balanced default", async () => {
  const user = await renderReadyApp();
  const fetchMock = vi.mocked(fetch);

  expect(screen.queryByRole("group", { name: "추천 기준" })).toBeNull();
  expect(screen.queryByLabelText("균형")).toBeNull();
  expect(screen.queryByLabelText("저렴")).toBeNull();
  expect(screen.queryByLabelText("가까움")).toBeNull();
  expect(screen.queryByLabelText("주차확실")).toBeNull();

  await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
  await screen.findByRole("heading", { name: "코엑스 주변 추천" });

  const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(requestBody.profile).toBe("BALANCED");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/AppShell.test.tsx -t "hides recommendation profiles"`

Expected: FAIL because the `추천 기준` fieldset and its radio labels are still rendered.

### Task 2: Hide the selector behind a reversible flag

**Files:**
- Modify: `components/AppShell.tsx`
- Test: `tests/AppShell.test.tsx`

- [ ] **Step 1: Add the local feature flag**

Place this next to the existing profile option definitions:

```tsx
const PROFILE_SELECTOR_ENABLED = false;
```

- [ ] **Step 2: Gate only the selector fieldset**

Wrap the existing `추천 기준` fieldset without changing its contents:

```tsx
{PROFILE_SELECTOR_ENABLED ? (
  <fieldset>
    <legend>추천 기준</legend>
    <div className="profiles">
      {profileItems.map(item => (
        <label key={item.value} className={profile === item.value ? "is-selected" : ""}>
          <input
            type="radio"
            name="profile"
            checked={profile === item.value}
            onChange={() => {
              onInputChange();
              setProfile(item.value);
            }}
          />
          <strong>{item.label}</strong>
          <small>{item.sub}</small>
        </label>
      ))}
    </div>
  </fieldset>
) : null}
```

Do not alter `profileItems`, `profile`, `setProfile`, the `requestBody.profile` field, or server profile handling.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `npm test -- tests/AppShell.test.tsx -t "hides recommendation profiles"`

Expected: PASS; no selector controls exist and the request body contains `profile: "BALANCED"`.

- [ ] **Step 4: Run proportional verification**

Run:

```powershell
npm test -- tests/AppShell.test.tsx
npm run typecheck
npm run lint
git diff --check
```

Expected: all commands exit `0` without new warnings.

- [ ] **Step 5: Commit and push**

```powershell
git add components/AppShell.tsx tests/AppShell.test.tsx docs/superpowers/plans/2026-08-26-disable-recommendation-profiles.md
git commit -m "fix: hide recommendation profile controls" -m "Done: hide the selector behind a reversible flag and keep BALANCED requests." -m "Remaining: none."
git push origin main
```
