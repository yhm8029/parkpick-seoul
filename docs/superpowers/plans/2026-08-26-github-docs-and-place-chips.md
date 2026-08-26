# GitHub Documentation and Place Chip Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every current GitHub-facing guide around the NAVER-first production architecture and remove the five fixed destination chips from the planner.

**Architecture:** Keep `README.md` as the product landing page and move operational detail into focused root/docs guides. The UI change removes only the fixed `.quick-places` block; `PlaceSearch`, NAVER API HUB autocomplete, demo fallback, and internal demo fixtures stay intact.

**Tech Stack:** Markdown, GitHub issue forms/templates, Next.js 16, React 19, Vitest, Testing Library, ESLint, TypeScript

---

## File map

- Modify `components/AppShell.tsx`: stop rendering fixed destination chips.
- Modify `app/styles/planner.css`: remove unused `.quick-places` rules.
- Modify `tests/AppShell.test.tsx`: assert chips are absent and use condition changes instead of chips in request-cancellation tests.
- Rewrite `README.md`: public product landing page and quick start.
- Rewrite `SPEC.md`: current product behavior contract.
- Rewrite `docs/ARCHITECTURE.md`: NAVER-first data flow and secret boundaries.
- Rewrite `DEPLOY.md`: local, NAVER console, Vercel, and smoke-test procedure.
- Rewrite `VALIDATION.md`: automated and live verification checklist.
- Rewrite `ROADMAP.md`: actual completed work and realistic next work.
- Rewrite `docs/REFERENCES.md`: official implementation references only.
- Modify `COMMERCIAL-LICENSE.md`: add concise Korean usage boundary while keeping it an inquiry notice.
- Create `.github/ISSUE_TEMPLATE/bug_report.yml`: structured bug reports.
- Create `.github/ISSUE_TEMPLATE/feature_request.yml`: structured feature requests.
- Create `.github/pull_request_template.md`: contributor verification checklist.

### Task 1: Lock the removal behavior with a focused UI test

**Files:**
- Modify: `tests/AppShell.test.tsx`

- [ ] **Step 1: Add a failing absence assertion**

Add a focused test that renders `AppShell` and checks that the destination quick-place buttons do not exist:

```tsx
it("does not render fixed destination shortcuts", () => {
  render(<AppShell />);
  for (const name of ["코엑스", "강남역", "서울역", "더현대 서울", "국립극장"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/AppShell.test.tsx -t "does not render fixed destination shortcuts"`

Expected: FAIL because the five shortcut buttons still render.

- [ ] **Step 3: Remove test dependence on shortcut buttons**

In the two concurrency tests that click `강남역`, change a recommendation condition instead:

```tsx
await user.selectOptions(screen.getByLabelText("예상 체류 시간"), "120");
```

Update destination assertions to keep `코엑스`, because the test is now proving request invalidation/overlap rather than destination shortcuts.

### Task 2: Remove shortcut markup and dead CSS

**Files:**
- Modify: `components/AppShell.tsx`
- Modify: `app/styles/planner.css`
- Test: `tests/AppShell.test.tsx`

- [ ] **Step 1: Remove the shortcut block**

Keep the destination `PlaceSearch` and delete only:

```tsx
<div className="quick-places">
  {DEMO_PLACES.slice(0, 5).map(place => (
    <button type="button" key={place.id} onClick={() => selectDestination(place)}>
      {place.name}
    </button>
  ))}
</div>
```

Do not remove `DEMO_PLACES`; `cityHall` and `coex` still power the explicit example-fill action.

- [ ] **Step 2: Remove dead CSS selectors**

Delete `.quick-places`, `.quick-places button`, and `.quick-places button:hover` rules from `app/styles/planner.css` without reformatting unrelated minified CSS.

- [ ] **Step 3: Run focused verification**

Run: `npm test -- tests/AppShell.test.tsx`

Expected: all AppShell tests PASS.

- [ ] **Step 4: Commit and push the UI unit**

```bash
git add components/AppShell.tsx app/styles/planner.css tests/AppShell.test.tsx
git commit -m "fix: remove fixed destination shortcuts" \
  -m "Done: remove five hard-coded destination chips while preserving NAVER autocomplete and demo fill." \
  -m "Remaining: refresh GitHub-facing documentation and deploy the UI change."
git push origin main
```

### Task 3: Rewrite the product landing page and behavior contract

**Files:**
- Rewrite: `README.md`
- Rewrite: `SPEC.md`

- [ ] **Step 1: Rewrite README as the GitHub landing page**

Use this exact section order:

```markdown
# ParkPick Seoul
[production badge/link and one-sentence value proposition]
## 바로 사용하기
## 무엇을 제공하나요?
## 데이터와 정확도
## 빠른 로컬 실행
## 환경변수
## 검증과 배포
## 문서
## 라이선스
```

The copy must state that place search uses NAVER API HUB, driving uses NAVER Directions 5 current traffic, walking is a distance-based estimate, and unsupported realtime parking remains “확인 불가”. Link to the production URL and all focused guides.

- [ ] **Step 2: Rewrite SPEC as the current contract**

Use sections for user input, search priority, recommendation data flow, route semantics, parking availability/fees, UI state, navigation, privacy/accessibility, fallbacks, and current exclusions. Remove every statement that calls Kakao a current provider.

- [ ] **Step 3: Check product claims against code**

Run:

```powershell
rg -n "NAVER_DIRECTIONS|거리 기반 추정|realtimeSupported|NAVER_API_HUB" components lib app
```

Expected: implementation evidence exists for each README/SPEC claim.

### Task 4: Rewrite engineering, deployment, validation, and roadmap guides

**Files:**
- Rewrite: `docs/ARCHITECTURE.md`
- Rewrite: `DEPLOY.md`
- Rewrite: `VALIDATION.md`
- Rewrite: `ROADMAP.md`
- Rewrite: `docs/REFERENCES.md`
- Modify: `COMMERCIAL-LICENSE.md`

- [ ] **Step 1: Replace architecture with the active flow**

Document Browser → `/api/places/search` and `/api/recommendations` → API HUB/Seoul/NAVER Directions → normalized response → cards/map. Include `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID` as the only public provider credential and both server-only credential pairs.

- [ ] **Step 2: Replace deployment instructions**

Document Node 22+, `npm ci`, `.env.local`, separate Maps/API HUB applications, enabled services, localhost/production domains, `npx vercel env add`, `npx vercel --prod --yes`, and the two API smoke checks without real keys.

- [ ] **Step 3: Replace validation and roadmap**

Validation must include `npm run verify`, LIVE place search, `NAVER_DIRECTIONS` sources/path points, permission timing, unsupported realtime copy, mobile/PWA checks. Roadmap must mark implemented NAVER/search/routes/PWA/visitor/license work complete and list cache/quota/quality/device checks as next work.

- [ ] **Step 4: Replace references and clarify commercial inquiry**

Keep only official NAVER, Seoul Open Data, Next.js, Vercel, MDN/PWA, BUSL-1.1 and Apache-2.0 references. Add a Korean summary to `COMMERCIAL-LICENSE.md` while preserving the English notice and avoiding a public price quote.

- [ ] **Step 5: Scan for stale public claims**

Run:

```powershell
rg -n "Kakao Maps JavaScript SDK|Kakao route matrix|KakaoNavi|NAVER Directions.*추가|v0\.1" README.md SPEC.md ROADMAP.md DEPLOY.md VALIDATION.md docs/ARCHITECTURE.md docs/REFERENCES.md
```

Expected: no matches.

### Task 5: Add GitHub contribution templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Create bug report form**

Require summary, reproduction, expected/actual behavior, browser/device, deployment target, logs/screenshots, and a checkbox confirming secrets were removed.

- [ ] **Step 2: Create feature request form**

Require the user problem, proposed behavior, alternatives, expected benefit, and scope/data-provider notes.

- [ ] **Step 3: Create PR template**

Include change summary, linked issue, verification commands, UI screenshots when applicable, and checkboxes for security, environment variables, documentation, and provider fallbacks.

### Task 6: Verify, commit, push, deploy, and smoke-test

**Files:**
- Verify all modified Markdown/YAML/TSX/CSS files.

- [ ] **Step 1: Validate links, secrets, and formatting**

Run:

```powershell
npm run check:repo
git diff --check
git status --short
```

Confirm `.env.local` is ignored and no actual credential appears in tracked files.

- [ ] **Step 2: Run application verification**

Run:

```powershell
npx eslint components/AppShell.tsx tests/AppShell.test.tsx
npm run typecheck
npm test
npm run build
```

Expected: changed-file ESLint, typecheck, all Vitest tests, and Next production build PASS.

- [ ] **Step 3: Commit and push the documentation unit**

```bash
git add README.md SPEC.md ROADMAP.md DEPLOY.md VALIDATION.md COMMERCIAL-LICENSE.md docs/ARCHITECTURE.md docs/REFERENCES.md .github
git commit -m "docs: refresh GitHub project guides" \
  -m "Done: align public product, architecture, deployment, validation, roadmap, references, licensing, and contribution docs with the NAVER-first production app." \
  -m "Remaining: deploy and run production smoke checks."
git push origin main
```

- [ ] **Step 4: Deploy and smoke-test**

Run: `npx vercel --prod --yes`

Verify:

```text
https://parkpick-seoul.vercel.app
https://parkpick-seoul.vercel.app/api/places/search?q=홍대입구역
```

Expected: production deployment READY; place API returns `mode: "LIVE"` and actual NAVER results; the planner has no fixed destination chips.
