# Business Source License Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** License ParkPick Seoul 0.2.0 and later under BUSL-1.1 with noncommercial production permission and a paid commercial-production path.

**Architecture:** Replace current top-level licensing metadata prospectively without rewriting Git history. Use the standard BSL 1.1 text and its parameter block, keep the project copyright notice separate, and make README/package metadata agree on version and license.

**Tech Stack:** Markdown, npm package metadata, Business Source License 1.1, Apache-2.0 change license

---

### Task 1: Apply the standard license and inquiry notice

**Files:**
- Modify: `LICENSE`
- Create: `NOTICE`
- Create: `COMMERCIAL-LICENSE.md`

- [ ] **Step 1: Replace `LICENSE` with the standard BSL 1.1 template**

Use the unmodified standard terms from `https://mariadb.com/bsl11/` with this exact parameter block:

```text
Business Source License 1.1

Parameters

Licensor: HyunM

Licensed Work: ParkPick Seoul 0.2.0 and later versions distributed with this License.

Additional Use Grant: You may make Production Use of the Licensed Work solely for personal, educational, research, evaluation, or other noncommercial purposes, provided that such Production Use is not offered as a paid service and does not generate revenue. Any Production Use not expressly permitted by this Additional Use Grant requires a separate commercial license.

Change Date: 2030-08-26

Change License: Apache License, Version 2.0 (Apache-2.0)

```

Do not add restrictions on copying, modifying, redistribution, or non-production use; the BSL 1.1 standard grant already permits them.

Create `NOTICE` with the separate project copyright notice:

```text
ParkPick Seoul
Copyright (c) 2026 HyunM
```

- [ ] **Step 2: Add the commercial inquiry notice**

Create `COMMERCIAL-LICENSE.md` with this content:

```md
# Commercial licensing

ParkPick Seoul 0.2.0 and later versions distributed with the repository's `LICENSE` are available under Business Source License 1.1.

Development, testing, evaluation, and the noncommercial production uses listed in the Additional Use Grant are permitted without a paid license. A separate commercial license is required before using the software in commercial production, including operating it as a paid service or in a revenue-generating deployment not covered by the Additional Use Grant.

To discuss pricing and terms, open a licensing inquiry at <https://github.com/yhm8029/parkpick-seoul/issues>. Do not include confidential business information in a public issue.

This notice explains how to request commercial terms. It is not itself a commercial license agreement or a public price offer.
```

- [ ] **Step 3: Check the two documents**

Run:

```text
rg -n "Licensor: HyunM|Licensed Work: ParkPick Seoul 0.2.0|Change Date: 2030-08-26|Apache License, Version 2.0" LICENSE
rg -n "ParkPick Seoul|Copyright \(c\) 2026 HyunM" NOTICE
rg -n "commercial production|revenue-generating|github.com/yhm8029/parkpick-seoul/issues" COMMERCIAL-LICENSE.md
```

Expected: every pattern is present and the commands exit 0.

### Task 2: Align package and README metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] **Step 1: Update package metadata**

Set these root fields in `package.json`:

```json
{
  "version": "0.2.0",
  "license": "BUSL-1.1"
}
```

Run `npm install --package-lock-only --ignore-scripts` so the root package entry in `package-lock.json` has the same version and license. Do not rewrite dependency licenses.

- [ ] **Step 2: Replace the README license section**

Replace the current `## 라이선스` section with:

```md
## 라이선스

ParkPick Seoul 0.2.0부터 [Business Source License 1.1](./LICENSE)을 적용합니다.

- 개인·교육·연구·평가·개발·테스트 및 라이선스에 명시된 비상업적 사용: 별도 비용 없이 허용
- 상업용 프로덕션, 유료 서비스 또는 수익형 배포: 별도 유료 라이선스 필요
- 2030-08-26부터: Apache License 2.0으로 전환

상업용 이용은 [Commercial licensing 안내](./COMMERCIAL-LICENSE.md)를 확인해 주세요.
```

Do not add a claim that past Git history was relicensed or removed.

- [ ] **Step 3: Verify metadata consistency**

Run:

```text
node -e "const p=require('./package.json');const l=require('./package-lock.json');if(p.version!=='0.2.0'||p.license!=='BUSL-1.1'||l.version!=='0.2.0'||l.packages[''].version!=='0.2.0'||l.packages[''].license!=='BUSL-1.1')process.exit(1)"
rg -n "Business Source License 1.1|상업용 프로덕션|2030-08-26|COMMERCIAL-LICENSE" README.md
git diff --check
```

Expected: all commands exit 0.

### Task 3: Full verification, delivery, and deployment

**Files:**
- Verify all modified files

- [ ] **Step 1: Run repository verification**

Run:

```text
npm run check:repo
npm run typecheck
npm test
npm run build
```

Expected: repository checks, TypeScript, all Vitest tests, and the Next.js production build pass. Run `npm run lint` separately and report any pre-existing lint debt without hiding failures.

- [ ] **Step 2: Commit and push the license transition**

Stage `LICENSE`, `COMMERCIAL-LICENSE.md`, `README.md`, `package.json`, and `package-lock.json`. Commit with:

```text
chore: adopt business source licensing

Done:
- License ParkPick Seoul 0.2.0 under BUSL-1.1 with an Apache-2.0 change date.
- Document free development/noncommercial use and the paid commercial-production path.
- Align package and README metadata.

Remaining:
- Redeploy Vercel production and verify public behavior.
- Resolve unrelated pre-existing lint debt separately.
```

Push `main` to `origin` after verification passes.

- [ ] **Step 3: Redeploy and verify production**

Run `npx --yes vercel@latest deploy --prod --yes`, confirm the deployment is `Ready`, then verify:

```text
GET https://parkpick-seoul.vercel.app -> 200
GET https://parkpick-seoul.vercel.app/manifest.webmanifest -> 200
POST https://parkpick-seoul.vercel.app/api/recommendations -> 200 with 1-3 recommendations for a valid request
```

Restart the local production server from the new build and confirm `http://127.0.0.1:3000` returns 200.
