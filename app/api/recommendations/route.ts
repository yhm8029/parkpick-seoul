import { NextResponse } from "next/server";
import { fetchDrivingRoutes } from "@/lib/api/kakao-routes";
import { fetchSeoulParkingLots } from "@/lib/api/seoul-parking";
import { fetchNearbySeoulParking } from "@/lib/api/seoul-parking-nearby";
import { haversineDistanceMeters } from "@/lib/domain/distance";
import { recommendParking } from "@/lib/domain/recommend";
import type {
  Coordinate,
  DataMode,
  DistanceSelection,
  ParkingLot,
  Place,
  RecommendationProfile,
  RecommendationRequest,
  RecommendationResponse,
} from "@/lib/types";
import { clamp } from "@/lib/utils";

export const dynamic = "force-dynamic";

const profiles = new Set<RecommendationProfile>(["BALANCED", "CHEAP", "NEAR", "CERTAIN"]);
const MANUAL_MIN_METERS = 50;
const MANUAL_MAX_METERS = 1_000;
const MANUAL_STEP_METERS = 50;
const AUTO_HARD_LIMIT_METERS = 1_000;
const ROUTE_CANDIDATE_LIMIT = 30;

function coordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Coordinate>;
  return (
    typeof item.latitude === "number" &&
    Number.isFinite(item.latitude) &&
    item.latitude >= -90 &&
    item.latitude <= 90 &&
    typeof item.longitude === "number" &&
    Number.isFinite(item.longitude) &&
    item.longitude >= -180 &&
    item.longitude <= 180
  );
}

type ValidatedDistanceSelection = DistanceSelection;

function validateDistanceSelection(value: Record<string, unknown>): ValidatedDistanceSelection | null {
  const mode = value.distanceMode;
  const hasMax = Object.prototype.hasOwnProperty.call(value, "maxDistanceMeters");
  if (mode === "AUTO") {
    if (hasMax) return null;
    return { distanceMode: "AUTO" };
  }
  if (mode === "MANUAL") {
    if (!hasMax) return null;
    const distance = value.maxDistanceMeters;
    if (typeof distance !== "number" || !Number.isFinite(distance)) return null;
    if (!Number.isInteger(distance)) return null;
    if (distance < MANUAL_MIN_METERS || distance > MANUAL_MAX_METERS) return null;
    if (distance % MANUAL_STEP_METERS !== 0) return null;
    return { distanceMode: "MANUAL", maxDistanceMeters: distance };
  }
  return null;
}

function parse(body: unknown): RecommendationRequest | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (!coordinate(value.origin) || !coordinate(value.destination)) return null;
  const raw = value.destination as Partial<Place>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  const allowed = new Set<Place["source"]>(["KAKAO", "NAVER", "DEMO", "GPS", "MANUAL"]);
  const destination: Place = {
    id: raw.id.slice(0, 160),
    name: raw.name.slice(0, 160),
    address: typeof raw.address === "string" ? raw.address.slice(0, 240) : "주소 정보 없음",
    latitude: raw.latitude as number,
    longitude: raw.longitude as number,
    category: typeof raw.category === "string" ? raw.category.slice(0, 80) : undefined,
    source: allowed.has(raw.source as Place["source"]) ? (raw.source as Place["source"]) : "MANUAL",
  };
  const distanceSelection = validateDistanceSelection(value);
  if (!distanceSelection) return null;
  const profile = profiles.has(value.profile as RecommendationProfile)
    ? (value.profile as RecommendationProfile)
    : "BALANCED";
  const base = {
    origin: value.origin as Coordinate,
    destination,
    arrivalAt:
      typeof value.arrivalAt === "string" && !Number.isNaN(new Date(value.arrivalAt).getTime())
        ? value.arrivalAt
        : new Date().toISOString(),
    durationMinutes: clamp(Number(value.durationMinutes) || 180, 30, 1_440),
    profile,
  };
  if (distanceSelection.distanceMode === "MANUAL") {
    return {
      ...base,
      distanceMode: "MANUAL",
      maxDistanceMeters: distanceSelection.maxDistanceMeters,
    };
  }
  return { ...base, distanceMode: "AUTO" };
}

function metersForSelection(selection: ValidatedDistanceSelection): number {
  return selection.distanceMode === "AUTO"
    ? AUTO_HARD_LIMIT_METERS
    : selection.maxDistanceMeters;
}

function filterByDistance(
  lots: ParkingLot[],
  destination: Coordinate,
  meters: number,
): ParkingLot[] {
  return lots
    .filter((lot) => lot.capacity > 0 && Number.isFinite(lot.latitude) && Number.isFinite(lot.longitude))
    .map((lot) => ({ lot, distance: haversineDistanceMeters(lot, destination) }))
    .filter((entry) => entry.distance <= meters)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        (a.lot.sourceId < b.lot.sourceId ? -1 : a.lot.sourceId > b.lot.sourceId ? 1 : 0),
    )
    .map((entry) => entry.lot);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const input = parse(body);
  if (!input) {
    return NextResponse.json(
      { error: "출발지와 목적지 좌표, 그리고 거리 설정을 확인해 주세요." },
      { status: 400 },
    );
  }

  const distanceSelection: ValidatedDistanceSelection =
    input.distanceMode === "MANUAL"
      ? { distanceMode: "MANUAL", maxDistanceMeters: input.maxDistanceMeters }
      : { distanceMode: "AUTO" };
  const distanceMeters = metersForSelection(distanceSelection);

  let lots: ParkingLot[] = [];
  let dataMode: DataMode;
  let dataNotice: string;

  try {
    const proximity = await fetchNearbySeoulParking(input.destination, distanceMeters);
    lots = proximity.lots;
    dataMode = "LIVE";
    dataNotice = proximity.notice;
  } catch (error) {
    console.error("Seoul nearby fallback", error);
    if (!process.env.SEOUL_OPEN_API_KEY) {
      return NextResponse.json(
        { error: "서울 주차 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    try {
      const fallback = await fetchSeoulParkingLots();
      const filtered = filterByDistance(fallback.lots, input.destination, distanceMeters);
      lots = filtered;
      dataMode = "FALLBACK";
      dataNotice = "근접 주차장 서비스 연결 실패로 서울시 공공데이터 대체 소스를 사용했습니다.";
    } catch (fallbackError) {
      console.error("Seoul open API fallback", fallbackError);
      return NextResponse.json(
        { error: "서울 주차 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
  }

  const routeCandidates = filterByDistance(lots, input.destination, distanceMeters).slice(
    0,
    ROUTE_CANDIDATE_LIMIT,
  );
  const routes = await fetchDrivingRoutes(input.origin, routeCandidates);
  const ranked = recommendParking(lots, input, routes);
  if (ranked.recommendations.length === 0) {
    dataNotice = dataMode === "FALLBACK"
      ? "서울시 공공데이터 대체 소스에서도 선택한 거리 안의 공영주차장을 찾지 못했습니다."
      : "선택한 거리 안에서 공영주차장을 찾지 못했습니다.";
  }
  const response: RecommendationResponse = {
    generatedAt: new Date().toISOString(),
    dataMode,
    dataNotice,
    destination: input.destination,
    distanceMode: input.distanceMode,
    effectiveDistanceMeters: ranked.effectiveDistanceMeters,
    recommendations: ranked.recommendations,
  };
  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
