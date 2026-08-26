import type {
  Coordinate,
  ParkingLot,
  RouteCongestionSection,
  RouteEstimate,
} from "@/lib/types";

const ENDPOINT = "https://maps.apigw.ntruss.com/map-direction/v1/driving";
const MAX_PATH_POINTS = 2_500;
const MAX_ROUTE_CANDIDATES = 10;
const MAX_CONGESTION_SECTIONS = 256;

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizePath(value: unknown): Coordinate[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PATH_POINTS) return undefined;
  const path = value.map((tuple) => {
    if (!Array.isArray(tuple) || tuple.length !== 2) return null;
    const [longitude, latitude] = tuple;
    return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ? { latitude, longitude }
      : null;
  });
  return path.every((point): point is Coordinate => point !== null) ? path : undefined;
}

function normalizeSections(value: unknown): RouteCongestionSection[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sections = value.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const { pointIndex, pointCount, congestion } = section as Record<string, unknown>;
    return Number.isInteger(pointIndex) && typeof pointIndex === "number" && pointIndex >= 0 &&
      Number.isInteger(pointCount) && typeof pointCount === "number" && pointCount > 1 &&
      (congestion === 0 || congestion === 1 || congestion === 2 || congestion === 3)
      ? [{ pointIndex, pointCount, congestion } satisfies RouteCongestionSection]
      : [];
  });
  return sections.length ? sections.slice(0, MAX_CONGESTION_SECTIONS) : undefined;
}

async function fetchOne(origin: Coordinate, lot: ParkingLot): Promise<RouteEstimate | null> {
  const keyId = process.env.NAVER_MAP_NCP_KEY_ID;
  const secret = process.env.NAVER_MAP_NCP_CLIENT_SECRET;
  if (!keyId || !secret) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("start", `${origin.longitude},${origin.latitude}`);
  url.searchParams.set("goal", `${lot.longitude},${lot.latitude}`);
  url.searchParams.set("option", "trafast");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-ncp-apigw-api-key-id": keyId,
        "x-ncp-apigw-api-key": secret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) {
      console.warn("NAVER Directions failed", { category: "http", status: response.status });
      return null;
    }
    const body = await response.json() as {
      code?: unknown;
      route?: { trafast?: Array<{
        summary?: { duration?: unknown; distance?: unknown };
        path?: unknown;
        section?: unknown;
      }> };
    };
    if (body.code !== 0) {
      console.warn("NAVER Directions failed", { category: "provider-code", code: body.code });
      return null;
    }
    const route = body.route?.trafast?.[0];
    const duration = route?.summary?.duration;
    const distance = route?.summary?.distance;
    if (!route || !finitePositive(duration) || !finitePositive(distance)) return null;

    const path = normalizePath(route.path);
    return {
      parkingId: lot.id,
      driveMinutes: Math.max(1, Math.ceil(duration / 60_000)),
      driveDistanceMeters: Math.round(distance),
      source: "NAVER_DIRECTIONS",
      ...(path ? { path, congestionSections: normalizeSections(route.section) } : {}),
    };
  } catch {
    console.warn("NAVER Directions failed", { category: "network" });
    return null;
  }
}

export async function fetchNaverDrivingRoutes(
  origin: Coordinate,
  lots: ParkingLot[],
): Promise<RouteEstimate[]> {
  const routes = await Promise.all(lots.slice(0, MAX_ROUTE_CANDIDATES).map((lot) => fetchOne(origin, lot)));
  return routes.filter((route): route is RouteEstimate => route !== null);
}
