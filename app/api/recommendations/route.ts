import { NextResponse } from "next/server";
import { fetchDrivingRoutes } from "@/lib/api/kakao-routes";
import { fetchSeoulParkingLots } from "@/lib/api/seoul-parking";
import { haversineDistanceMeters } from "@/lib/domain/distance";
import { recommendParking } from "@/lib/domain/recommend";
import { getDemoParkingLots } from "@/lib/mock";
import type { Coordinate, DataMode, Place, RecommendationProfile, RecommendationRequest, RecommendationResponse } from "@/lib/types";
import { clamp } from "@/lib/utils";

export const dynamic = "force-dynamic";
const profiles = new Set<RecommendationProfile>(["BALANCED", "CHEAP", "NEAR", "CERTAIN"]);

function coordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Coordinate>;
  return typeof item.latitude === "number" && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90 && typeof item.longitude === "number" && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180;
}

function parse(body: unknown): RecommendationRequest | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Partial<RecommendationRequest>;
  if (!coordinate(value.origin) || !coordinate(value.destination) || !value.destination.id || !value.destination.name) return null;
  const raw = value.destination as Partial<Place>;
  const allowed = new Set<Place["source"]>(["KAKAO", "NAVER", "DEMO", "GPS", "MANUAL"]);
  const destination: Place = {
    id: String(raw.id).slice(0, 160), name: String(raw.name).slice(0, 160), address: typeof raw.address === "string" ? raw.address.slice(0, 240) : "주소 정보 없음", latitude: raw.latitude as number, longitude: raw.longitude as number, category: typeof raw.category === "string" ? raw.category.slice(0, 80) : undefined, source: allowed.has(raw.source as Place["source"]) ? raw.source as Place["source"] : "MANUAL"
  };
  return {
    origin: value.origin,
    destination,
    arrivalAt: typeof value.arrivalAt === "string" && !Number.isNaN(new Date(value.arrivalAt).getTime()) ? value.arrivalAt : new Date().toISOString(),
    durationMinutes: clamp(Number(value.durationMinutes) || 180, 30, 1_440),
    maxWalkMinutes: clamp(Number(value.maxWalkMinutes) || 15, 3, 30),
    profile: profiles.has(value.profile as RecommendationProfile) ? value.profile as RecommendationProfile : "BALANCED"
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
  const input = parse(body);
  if (!input) return NextResponse.json({ error: "출발지와 목적지 좌표를 확인해 주세요." }, { status: 400 });

  let lots = getDemoParkingLots();
  let dataMode: DataMode = "DEMO";
  let dataNotice = "API 키가 없어 데모 주차장으로 전체 추천 흐름을 실행했습니다. 실제 주차정보가 아닙니다.";
  if (process.env.SEOUL_OPEN_API_KEY) {
    try {
      const live = await fetchSeoulParkingLots(); lots = live.lots; dataMode = "LIVE"; dataNotice = live.notice;
    } catch (error) {
      console.error("Seoul fallback", error); dataMode = "FALLBACK"; dataNotice = "서울시 데이터 연결 실패로 데모 주차장으로 대체했습니다.";
    }
  }

  const routeCandidates = [...lots].sort((a, b) => haversineDistanceMeters(a, input.destination) - haversineDistanceMeters(b, input.destination)).slice(0, 30);
  const routes = await fetchDrivingRoutes(input.origin, routeCandidates);
  const response: RecommendationResponse = { generatedAt: new Date().toISOString(), dataMode, dataNotice, destination: input.destination, recommendations: recommendParking(lots, input, routes) };
  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
