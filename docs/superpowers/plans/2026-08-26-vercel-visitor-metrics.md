# Vercel Visitor Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful `TODAY / 30 DAYS` anonymous visitor counts to the footer using Vercel Web Analytics, with no realtime-presence counter and no new database.

**Architecture:** The official client package records production page views. A server-only adapter calls Vercel's Web Analytics aggregate endpoint for Seoul-local today and rolling 30-day ranges, sums daily-reset anonymous visitor buckets, and exposes only public counts through a five-minute cached API route. A small client component loads the counts after the page and hides itself when unavailable.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@vercel/analytics` 2.0.1, Vercel Web Analytics REST API, Vitest, Testing Library.

---

## File structure

- Modify `package.json` and `package-lock.json`: exact `@vercel/analytics` dependency.
- Modify `app/layout.tsx`: official analytics collector.
- Create `lib/api/vercel-analytics.ts`: server-only range construction, authenticated aggregate calls, validation, and summation.
- Create `app/api/visit-stats/route.ts`: five-minute cached public unavailable-or-count response.
- Create `components/VisitStats.tsx`: nonblocking footer metrics UI.
- Modify `app/page.tsx`: compose visitor metrics in the existing footer.
- Modify `app/styles/responsive.css`: desktop and mobile footer counter layout.
- Integrate `.env.example` once, after routing and analytics code land, so parallel workers never edit the same configuration file.
- Create `tests/vercel-analytics.test.ts`: range, query, sum, secret, and unavailable tests.
- Create `tests/VisitStats.test.tsx`: one available and one unavailable rendering case.

### Task 1: Collect page views with the official Vercel package

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Install the exact dependency**

Run: `npm install --save-exact @vercel/analytics@2.0.1`

Expected: manifest and lockfile add only the official analytics package and its required lock entries.

- [ ] **Step 2: Add the collector to the root layout**

Import and render the official Next.js component after page content:

```tsx
import { Analytics } from "@vercel/analytics/next";

<body id="top">
  <PwaRegister />
  {children}
  <Analytics />
</body>
```

Do not force production mode locally. Automatic environment detection must prevent local development from polluting production counts.

- [ ] **Step 3: Verify dependency and type integration**

Run: `npm run typecheck && npm test -- tests/toolchain.test.ts`

Expected: typecheck and toolchain tests PASS.

- [ ] **Step 4: Commit and push checkpoint**

```powershell
git add package.json package-lock.json app/layout.tsx
git commit -m "feat: enable Vercel web analytics" `
  -m "Done: Add the official anonymous page-view collector with automatic environment detection." `
  -m "Remaining: Query TODAY and 30 DAYS counts, render the footer metrics, configure access, and deploy."
git push origin main
```

### Task 2: Query Seoul-local TODAY and 30 DAYS visitors server-side

**Files:**
- Create: `lib/api/vercel-analytics.ts`
- Create: `app/api/visit-stats/route.ts`
- Create: `tests/vercel-analytics.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Use a fixed instant and mock two aggregate responses. Assert exact query granularity, production filter, Seoul offsets, sum behavior, no token serialization, and unavailable behavior:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVisitStats } from "@/lib/api/vercel-analytics";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("sums Seoul TODAY hours and rolling 30 DAYS daily visitors", async () => {
  vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "private-token");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
  vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
      { timestamp: "2026-08-25T15:00:00.000Z", visitors: 2 },
      { timestamp: "2026-08-25T16:00:00.000Z", visitors: 3 }
    ] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
      { timestamp: "2026-07-27T15:00:00.000Z", visitors: 10 },
      { timestamp: "2026-07-28T15:00:00.000Z", visitors: 11 }
    ] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const stats = await fetchVisitStats(new Date("2026-08-26T01:13:00.000Z"));

  expect(stats).toEqual({ today: 5, thirtyDays: 21, asOf: "2026-08-26T01:13:00.000Z" });
  const urls = fetchMock.mock.calls.map(call => new URL(String(call[0])));
  expect(urls[0].searchParams.getAll("by")).toContain("hour");
  expect(urls[1].searchParams.getAll("by")).toContain("day");
  expect(urls[0].searchParams.get("filter")).toBe("environment eq 'production'");
  expect(urls[0].searchParams.get("since")).toContain("+09:00");
  expect(JSON.stringify(stats)).not.toContain("private-token");
});

it("returns null for missing credentials, non-ok responses, or malformed rows", async () => {
  await expect(fetchVisitStats(new Date())).resolves.toBeNull();
});
```

Normalize only the official `data` response envelope shown above.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/vercel-analytics.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the server-only adapter**

Create `lib/api/vercel-analytics.ts`:

```ts
export interface VisitStats {
  today: number;
  thirtyDays: number;
  asOf: string;
}

const ENDPOINT = "https://api.vercel.com/v1/query/web-analytics/visits/aggregate";

function seoulMidnight(now: Date, daysAgo: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(now.getTime() - daysAgo * 86_400_000));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T00:00:00+09:00`;
}

async function query(by: "hour" | "day", since: string, until: string): Promise<number | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  if (!token || !projectId || !teamId) return null;
  const url = new URL(ENDPOINT);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("teamId", teamId);
  url.searchParams.append("by", by);
  url.searchParams.set("since", since);
  url.searchParams.set("until", until);
  url.searchParams.set("limit", by === "hour" ? "24" : "31");
  url.searchParams.set("filter", "environment eq 'production'");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) return null;
  const body = await response.json() as { data?: Array<{ visitors?: unknown }> };
  if (!Array.isArray(body.data)) return null;
  return body.data.reduce((sum, row) =>
    typeof row.visitors === "number" && Number.isFinite(row.visitors) && row.visitors >= 0
      ? sum + row.visitors
      : sum, 0);
}

export async function fetchVisitStats(now = new Date()): Promise<VisitStats | null> {
  try {
    const until = now.toISOString();
    const [today, thirtyDays] = await Promise.all([
      query("hour", seoulMidnight(now, 0), until),
      query("day", seoulMidnight(now, 29), until)
    ]);
    if (today === null || thirtyDays === null) return null;
    return { today, thirtyDays, asOf: until };
  } catch {
    return null;
  }
}
```

Confirm the official response property by one authenticated development call before finalizing the parser. Never log the authorization header or body containing account metadata.

- [ ] **Step 4: Add the cached public API route**

Create `app/api/visit-stats/route.ts`:

```ts
import { NextResponse } from "next/server";
import { fetchVisitStats } from "@/lib/api/vercel-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await fetchVisitStats();
  return NextResponse.json(
    stats ? { available: true, ...stats } : { available: false },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
```

- [ ] **Step 5: Verify server behavior**

Run: `npm test -- tests/vercel-analytics.test.ts && npm run typecheck`

Expected: adapter tests and typecheck PASS; token is absent from serialized results.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add lib/api/vercel-analytics.ts app/api/visit-stats/route.ts tests/vercel-analytics.test.ts
git commit -m "feat: expose cached Vercel visitor metrics" `
  -m "Done: Query Seoul-local TODAY and 30 DAYS anonymous visitors server-side with five-minute caching and safe unavailable fallback." `
  -m "Remaining: Render footer metrics, configure Web Analytics access, run full verification, and deploy."
git push origin main
```

### Task 3: Render nonblocking footer metrics

**Files:**
- Create: `components/VisitStats.tsx`
- Modify: `app/page.tsx`
- Modify: `app/styles/responsive.css`
- Create: `tests/VisitStats.test.tsx`

- [ ] **Step 1: Write focused RED component tests**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VisitStats } from "@/components/VisitStats";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders TODAY and 30 DAYS after a successful response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ available: true, today: 7, thirtyDays: 123, asOf: new Date().toISOString() })
  }));
  render(<VisitStats />);
  expect(await screen.findByText("TODAY")).toBeTruthy();
  expect(screen.getByText("7명")).toBeTruthy();
  expect(screen.getByText("30 DAYS")).toBeTruthy();
  expect(screen.getByText("123명")).toBeTruthy();
});

it("renders nothing when visitor metrics are unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: false }) }));
  const { container } = render(<VisitStats />);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(container.textContent).toBe("");
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/VisitStats.test.tsx`

Expected: FAIL because `VisitStats` does not exist.

- [ ] **Step 3: Implement the nonblocking component**

Create a client component that starts with `null`, fetches `/api/visit-stats` after mount with an `AbortController`, validates nonnegative finite counts, and renders nothing on abort/error/unavailable. Render:

```tsx
<aside className="visit-stats" aria-label="방문자 통계">
  <div><span>TODAY</span><strong>{today.toLocaleString("ko-KR")}명</strong></div>
  <div><span>30 DAYS</span><strong>{thirtyDays.toLocaleString("ko-KR")}명</strong></div>
  <p className="sr-only">30 DAYS는 날짜별 익명 방문자 수를 합산한 값입니다.</p>
</aside>
```

- [ ] **Step 4: Compose and style the footer**

In `app/page.tsx`, insert `<VisitStats />` between brand and disclaimer. Update footer CSS:

```css
footer .container{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px}
.visit-stats{justify-self:center;display:grid;grid-template-columns:repeat(2,minmax(82px,1fr));gap:1px;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden}
.visit-stats>div{display:flex;flex-direction:column;gap:3px;padding:8px 14px;background:rgba(255,255,255,.04);text-align:center}
.visit-stats span{font-size:.53rem;letter-spacing:.13em;color:#89b6a8}
.visit-stats strong{font-size:.76rem;color:#fff}
```

At 680px, set the footer grid to one column and `.visit-stats{justify-self:start}` so the metric cluster occupies its own row without overflow.

- [ ] **Step 5: Verify footer behavior**

Run: `npm test -- tests/VisitStats.test.tsx && npm run typecheck`

Expected: component tests and typecheck PASS.

- [ ] **Step 6: Commit and push checkpoint**

```powershell
git add components/VisitStats.tsx app/page.tsx app/styles/responsive.css tests/VisitStats.test.tsx
git commit -m "feat: show today and 30-day visitors" `
  -m "Done: Add nonblocking footer visitor counts with a truthful daily-unique explanation and unavailable-state hiding." `
  -m "Remaining: Configure Web Analytics access, run full verification, deploy, and confirm production counts."
git push origin main
```

### Task 4: Configure, verify, and deploy visitor metrics

**Files:**
- Integration-owned: `.env.example`
- Vercel environment only: `VERCEL_ANALYTICS_TOKEN`, `VERCEL_ANALYTICS_TEAM_ID`

- [ ] **Step 1: Hand the server-only analytics variables to the final integration checkpoint**

At the final integration checkpoint, add empty `.env.example` entries for `VERCEL_ANALYTICS_TOKEN` and `VERCEL_ANALYTICS_TEAM_ID` together with the NAVER environment documentation. `VERCEL_PROJECT_ID` is a Vercel system variable and does not receive a committed value.

- [ ] **Step 2: Enable Web Analytics and create access**

Enable Web Analytics for the linked `parkpick-seoul` project. Create a Vercel access token scoped to the owning team when the account UI permits it. Add `VERCEL_ANALYTICS_TOKEN` and `VERCEL_ANALYTICS_TEAM_ID` to Production, Preview, and Development. Never prefix either with `NEXT_PUBLIC_`.

- [ ] **Step 3: Verify the real response contract safely**

Call the public app's `/api/visit-stats` after deployment. It must return either `{ available: true, today, thirtyDays, asOf }` or `{ available: false }`; it must never return the token, team ID, project ID, upstream URL, or authorization errors.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm run check:repo
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all commands PASS. Run `npm run lint` separately and distinguish existing lint debt from any new issue.

- [ ] **Step 5: Commit and push integrated environment documentation**

```powershell
git add .env.example
git commit -m "docs: document Vercel analytics access" `
  -m "Done: Document server-only visitor-metrics access and verify analytics collection and display behavior." `
  -m "Remaining: Deploy production and confirm TODAY and 30 DAYS populate after Vercel processes page-view data."
git push origin main
```

- [ ] **Step 6: Deploy and smoke-test**

Deploy the linked project to production. Confirm the analytics script request appears only on the Vercel deployment, `/api/visit-stats` is cached, the page remains usable when the API is blocked, and the footer shows no realtime-user claim. Initial counters may remain hidden until Vercel has processed the first production analytics events.
