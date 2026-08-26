export interface VisitStats {
  today: number;
  thirtyDays: number;
  asOf: string;
}

const ENDPOINT = "https://api.vercel.com/v1/query/web-analytics/visits/count";

function seoulMidnight(now: Date, daysAgo: number): string {
  const seoulWallClock = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  seoulWallClock.setUTCDate(seoulWallClock.getUTCDate() - daysAgo);
  const year = seoulWallClock.getUTCFullYear();
  const month = String(seoulWallClock.getUTCMonth() + 1).padStart(2, "0");
  const day = String(seoulWallClock.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}T00:00:00+09:00`;
}

async function queryVisitors(since: string, until: string): Promise<number | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  if (!token || !projectId || !teamId) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("teamId", teamId);
  url.searchParams.set("since", since);
  url.searchParams.set("until", until);
  url.searchParams.set("filter", "environment eq 'production'");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const body = await response.json() as { data?: { visitors?: unknown } };
  const visitors = body.data?.visitors;
  return typeof visitors === "number" && Number.isFinite(visitors) && visitors >= 0
    ? visitors
    : null;
}

export async function fetchVisitStats(now = new Date()): Promise<VisitStats | null> {
  if (!process.env.VERCEL_ANALYTICS_TOKEN || !process.env.VERCEL_PROJECT_ID ||
    !process.env.VERCEL_ANALYTICS_TEAM_ID) return null;
  try {
    const until = now.toISOString();
    const [today, thirtyDays] = await Promise.all([
      queryVisitors(seoulMidnight(now, 0), until),
      queryVisitors(seoulMidnight(now, 29), until),
    ]);
    if (today === null || thirtyDays === null) return null;
    return { today, thirtyDays, asOf: until };
  } catch {
    return null;
  }
}
