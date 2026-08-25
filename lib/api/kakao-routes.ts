import type { Coordinate, ParkingLot, RouteEstimate } from "@/lib/types";

export async function fetchDrivingRoutes(origin: Coordinate, lots: ParkingLot[]): Promise<RouteEstimate[]> {
  const key = process.env.KAKAO_MOBILITY_REST_API_KEY;
  if (!key || lots.length === 0) return [];
  try {
    const response = await fetch("https://apis-navi.kakaomobility.com/v1/destinations/directions", {
      method: "POST",
      headers: { Authorization: `KakaoAK ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { x: origin.longitude, y: origin.latitude }, destinations: lots.slice(0, 30).map(lot => ({ key: lot.id, x: lot.longitude, y: lot.latitude })), radius: 10_000, priority: "TIME" }),
      cache: "no-store",
      signal: AbortSignal.timeout(7_000)
    });
    if (!response.ok) throw new Error(`Kakao route ${response.status}`);
    const body = await response.json() as { routes?: Array<{ key?: string; result_code?: number | string; summary?: { distance?: number; duration?: number } }> };
    return (body.routes ?? []).filter(route => route.key && Number(route.result_code) === 0 && route.summary).map(route => ({ parkingId: route.key as string, driveDistanceMeters: Math.round(route.summary?.distance ?? 0), driveMinutes: Math.max(1, Math.ceil((route.summary?.duration ?? 0) / 60)), source: "KAKAO_MOBILITY" as const }));
  } catch (error) {
    console.error("route fallback", error);
    return [];
  }
}
