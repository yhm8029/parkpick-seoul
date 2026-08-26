import { estimateDriveDistanceMeters, estimateDriveMinutes, estimateWalkDistanceMeters, estimateWalkMinutes, haversineDistanceMeters } from "@/lib/domain/distance";
import { calculateParkingFee } from "@/lib/domain/fees";
import type { AvailabilityRisk, ConfidenceLevel, ParkingLot, ParkingRecommendation, RecommendationRequest, RouteEstimate } from "@/lib/types";
import { clamp } from "@/lib/utils";

type ScoreKey = "availability" | "walk" | "cost" | "drive" | "reliability";

const WEIGHTS: Record<RecommendationRequest["profile"], Record<ScoreKey, number>> = {
  BALANCED: { availability: .35, walk: .25, cost: .20, drive: .15, reliability: .05 },
  CHEAP: { availability: .25, walk: .15, cost: .45, drive: .10, reliability: .05 },
  NEAR: { availability: .25, walk: .45, cost: .05, drive: .20, reliability: .05 },
  CERTAIN: { availability: .55, walk: .15, cost: .05, drive: .10, reliability: .15 }
};

const AUTO_HARD_LIMIT_METERS = 1_000;
const MANUAL_MIN_METERS = 50;
const MANUAL_MAX_METERS = 1_000;
const MANUAL_STEP_METERS = 50;
const ROUND_TO_METERS = 50;
const MAX_RECOMMENDATIONS = 10;

export interface RankedParkingResult {
  recommendations: ParkingRecommendation[];
  effectiveDistanceMeters: number | null;
}

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function selectManualDistance(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return MANUAL_MAX_METERS;
  const clamped = clamp(Math.round(value), MANUAL_MIN_METERS, MANUAL_MAX_METERS);
  return Math.round(clamped / MANUAL_STEP_METERS) * MANUAL_STEP_METERS;
}

function ageMinutes(updatedAt: string | null | undefined, now: Date): number | null {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? null : Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
}

function realtimeStatus(age: number | null, supported: boolean): ParkingRecommendation["realtimeStatus"] {
  if (!supported) return "UNKNOWN";
  if (age === null || age > 30) return "OFFLINE";
  if (age <= 10) return "LIVE";
  if (age <= 20) return "DELAYED";
  return "STALE";
}

function reliability(lot: ParkingLot, age: number | null): number {
  if (!lot.realtimeSupported) return 30;
  if (age === null) return 20;
  if (age <= 10) return 100;
  if (age <= 20) return 70;
  if (age <= 30) return 40;
  return 20;
}

function prediction(lot: ParkingLot, arrivalMinutes: number, age: number | null): ParkingRecommendation["predictedAvailable"] {
  if (lot.availableSpaces === null || lot.availableSpaces === undefined || lot.capacity <= 0) return null;
  const projected = clamp(lot.availableSpaces + (lot.trendPer30Minutes ?? 0) * arrivalMinutes / 30, 0, lot.capacity);
  const uncertainty = Math.min(lot.capacity, Math.max(2, Math.round(lot.capacity * .06)) + Math.round(arrivalMinutes / 30 * Math.max(1, lot.capacity * .015)) + (age === null ? Math.round(lot.capacity * .08) : Math.floor(age / 10)));
  let confidence: ConfidenceLevel = "HIGH";
  if (!lot.realtimeSupported || age === null || age > 20 || arrivalMinutes > 60) confidence = "LOW";
  else if (age > 10 || arrivalMinutes > 30 || lot.source === "DEMO") confidence = "MEDIUM";
  return { min: Math.max(0, Math.round(projected - uncertainty)), max: Math.min(lot.capacity, Math.round(projected + uncertainty)), confidence };
}

function risk(predicted: ParkingRecommendation["predictedAvailable"], lot: ParkingLot): AvailabilityRisk {
  if (!predicted || lot.capacity <= 0) return "UNKNOWN";
  if (predicted.min >= 12 || predicted.min / lot.capacity >= .15) return "LOW";
  if (predicted.max <= 3 || predicted.max / lot.capacity <= .03) return "HIGH";
  return "MEDIUM";
}

export function recommendParking(lots: ParkingLot[], request: RecommendationRequest, routes: RouteEstimate[] = [], now = new Date()): RankedParkingResult {
  const routeMap = new Map(routes.map(route => [route.parkingId, route]));
  const isAuto = request.distanceMode === "AUTO";
  const manualLimit = isAuto ? 0 : selectManualDistance(request.maxDistanceMeters);
  const hardLimitMeters = isAuto ? AUTO_HARD_LIMIT_METERS : manualLimit;

  const measured = lots
    .filter(lot => lot.capacity > 0 && Number.isFinite(lot.latitude) && Number.isFinite(lot.longitude))
    .map(lot => ({ lot, distance: haversineDistanceMeters(lot, request.destination) }))
    .sort((a, b) => a.distance - b.distance)
    .filter(item => item.distance <= hardLimitMeters);

  let rankedCandidates: ParkingRecommendation[];
  let effectiveDistanceMeters: number | null;
  if (isAuto) {
    const nearestCandidates = measured
      .filter(item => item.distance <= AUTO_HARD_LIMIT_METERS)
      .sort((a, b) => a.distance - b.distance || (a.lot.sourceId < b.lot.sourceId ? -1 : a.lot.sourceId > b.lot.sourceId ? 1 : 0))
      .slice(0, MAX_RECOMMENDATIONS);
    if (nearestCandidates.length === 0) {
      return { recommendations: [], effectiveDistanceMeters: null };
    }
    const farthestExact = nearestCandidates[nearestCandidates.length - 1].distance;
    effectiveDistanceMeters = roundUpTo(farthestExact, ROUND_TO_METERS);
    rankedCandidates = scoreAndRank(nearestCandidates, request, routeMap, now);
  } else {
    rankedCandidates = scoreAndRank(measured, request, routeMap, now).slice(0, MAX_RECOMMENDATIONS);
    effectiveDistanceMeters = manualLimit;
  }

  return {
    recommendations: rankedCandidates.map((item, index) => ({ ...item, rank: index + 1 })),
    effectiveDistanceMeters,
  };
}

function scoreAndRank(
  selected: { lot: ParkingLot; distance: number }[],
  request: RecommendationRequest,
  routeMap: Map<string, RouteEstimate>,
  now: Date,
): ParkingRecommendation[] {

  const contexts = selected.map(({ lot }) => {
    const fallbackDistance = estimateDriveDistanceMeters(request.origin, lot);
    const route = routeMap.get(lot.id) ?? { parkingId: lot.id, driveMinutes: estimateDriveMinutes(fallbackDistance), driveDistanceMeters: fallbackDistance, source: "ESTIMATE" as const };
    const walkDistanceMeters = estimateWalkDistanceMeters(lot, request.destination);
    return { lot, route, walkDistanceMeters, walkMinutes: estimateWalkMinutes(walkDistanceMeters), fee: calculateParkingFee(request.durationMinutes, lot.feeRule), age: ageMinutes(lot.realtimeUpdatedAt, now) };
  });

  const fees = contexts.map(c => c.fee).filter((value): value is number => value !== null);
  const maxFee = Math.max(1, ...fees);
  const minDrive = contexts.length ? Math.min(...contexts.map(c => c.route.driveMinutes)) : 0;
  const arrivalMinutes = Math.max(0, Math.round((new Date(request.arrivalAt).getTime() - now.getTime()) / 60_000));
  const weights = WEIGHTS[request.profile];

  return contexts.map(context => {
    const { lot } = context;
    const predicted = prediction(lot, arrivalMinutes, context.age);
    const available = predicted ? predicted.min * .6 + predicted.max * .4 : lot.availableSpaces ?? 0;
    const availabilityScore = 100 * (clamp(available / 20, 0, 1) * .6 + clamp((available / lot.capacity) / .2, 0, 1) * .4);
    const reliabilityScore = reliability(lot, context.age);
    const adjustedAvailability = availabilityScore * (.45 + reliabilityScore / 180);
    const walkScore = clamp(100 - (context.walkMinutes - 3) / 17 * 100, 0, 100);
    const costScore = context.fee === null ? 40 : context.fee === 0 ? 100 : clamp(100 * (1 - context.fee / maxFee), 0, 100);
    const driveScore = clamp(100 - Math.max(0, context.route.driveMinutes - minDrive) / 15 * 100, 0, 100);
    const availabilityRisk = risk(predicted, lot);
    const raw = adjustedAvailability * weights.availability + walkScore * weights.walk + costScore * weights.cost + driveScore * weights.drive + reliabilityScore * weights.reliability;
    const score = Math.round(clamp(raw - (lot.isOpen === false ? 30 : 0), 0, 100));
    const reasons: string[] = [];
    if (availabilityRisk === "LOW") reasons.push("도착 시에도 빈자리가 남을 가능성이 높습니다.");
    if (context.walkMinutes <= 10) reasons.push(`목적지까지 도보 약 ${context.walkMinutes}분입니다.`);
    if (context.fee === 0) reasons.push("예상 체류시간 기준 무료입니다.");
    if (context.route.source === "NAVER_DIRECTIONS") reasons.push("네이버 현재 교통 기준 자동차 경로를 반영했습니다.");
    if (context.route.source === "KAKAO_MOBILITY") reasons.push("실제 자동차 경로시간을 반영했습니다.");
    const warnings: string[] = [];
    if (!lot.realtimeSupported) warnings.push("실시간 잔여면 정보가 없습니다.");
    if (context.age !== null && context.age > 20) warnings.push(`${context.age}분 전 정보라 실제 상황과 차이가 날 수 있습니다.`);
    if (context.fee === null) warnings.push("요금 정보는 현장에서 확인해야 합니다.");
    if (context.route.source === "ESTIMATE") warnings.push("자동차 시간은 거리 기반 추정치입니다.");

    return {
      ...lot,
      rank: 0,
      score,
      driveMinutes: context.route.driveMinutes,
      driveDistanceMeters: context.route.driveDistanceMeters,
      routeSource: context.route.source,
      routePath: context.route.path,
      routeCongestionSections: context.route.congestionSections,
      walkMinutes: context.walkMinutes,
      walkDistanceMeters: context.walkDistanceMeters,
      estimatedFee: context.fee,
      predictedAvailable: predicted,
      availabilityRisk,
      realtimeStatus: realtimeStatus(context.age, lot.realtimeSupported),
      dataAgeMinutes: context.age,
      reasons: reasons.slice(0, 3),
      warnings: warnings.slice(0, 3),
      scoreBreakdown: { availability: Math.round(adjustedAvailability), walk: Math.round(walkScore), cost: Math.round(costScore), drive: Math.round(driveScore), reliability: Math.round(reliabilityScore) }
    } satisfies ParkingRecommendation;
  }).sort((a, b) =>
    b.score - a.score ||
    a.walkMinutes - b.walkMinutes ||
    (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)
  );
}
