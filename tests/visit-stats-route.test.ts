import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/visit-stats/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("exposes only cached public visitor totals", async () => {
  vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "private-token");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
  vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 5 } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 21 } }), { status: 200 })));

  const response = await GET();
  const body = await response.json();

  expect(body).toMatchObject({ available: true, today: 5, thirtyDays: 21 });
  expect(JSON.stringify(body)).not.toContain("private-token");
  expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
});
