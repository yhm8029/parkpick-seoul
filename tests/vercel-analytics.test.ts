import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVisitStats } from "@/lib/api/vercel-analytics";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchVisitStats", () => {
  it("queries exact Seoul TODAY and 30 DAYS visitor totals", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "private-token");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
    vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 5, pageviews: 8 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 21, pageviews: 35 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const now = new Date("2026-08-26T01:13:00.000Z");
    const stats = await fetchVisitStats(now);

    expect(stats).toEqual({ today: 5, thirtyDays: 21, asOf: now.toISOString() });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as Array<[URL, RequestInit]>;
    const urls = calls.map(([url]) => url);
    expect(urls.every(url => url.origin + url.pathname === "https://api.vercel.com/v1/query/web-analytics/visits/count")).toBe(true);
    expect(urls.every(url => url.searchParams.get("projectId") === "prj_test")).toBe(true);
    expect(urls.every(url => url.searchParams.get("teamId") === "team_test")).toBe(true);
    expect(urls.every(url => url.searchParams.get("filter") === "environment eq 'production'")).toBe(true);
    expect(urls.every(url => !url.searchParams.has("by"))).toBe(true);
    expect(urls[0].searchParams.get("since")).toBe("2026-08-26T00:00:00+09:00");
    expect(urls[1].searchParams.get("since")).toBe("2026-07-28T00:00:00+09:00");
    expect(new Headers(calls[0][1].headers).get("Authorization")).toBe("Bearer private-token");
    expect(JSON.stringify(stats)).not.toContain("private-token");
  });

  it("hides metrics for missing credentials or malformed totals", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchVisitStats(new Date())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "private-token");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
    vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { visitors: "unknown" } }), { status: 200 }));
    await expect(fetchVisitStats(new Date())).resolves.toBeNull();
  });
});
