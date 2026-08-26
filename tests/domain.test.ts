import { describe, expect, it } from "vitest";
import { calculateParkingFee } from "@/lib/domain/fees";
import { recommendParking } from "@/lib/domain/recommend";
import { formatFeeRateLabel } from "@/lib/utils";
import type { ParkingLot, RecommendationRequest } from "@/lib/types";

const now = new Date("2026-08-25T09:00:00Z");
const requestBase = {
  origin: { latitude: 37.5, longitude: 127.02 },
  destination: { id: "d", name: "목적지", address: "서울", latitude: 37.501, longitude: 127.021, source: "MANUAL" as const },
  arrivalAt: "2026-08-25T09:30:00Z",
  durationMinutes: 180,
  profile: "BALANCED" as const,
};
const lot = (id: string, available: number, latitude = 37.501, longitude = 127.021): ParkingLot => ({
  id,
  sourceId: id,
  source: "DEMO",
  name: id,
  address: "서울",
  latitude,
  longitude,
  capacity: 100,
  occupiedSpaces: 100 - available,
  availableSpaces: available,
  realtimeUpdatedAt: "2026-08-25T08:56:00Z",
  realtimeSupported: true,
  feeRule: { isFree: false, baseMinutes: 10, baseFee: 1000, additionalMinutes: 10, additionalFee: 1000 },
  isOpen: true,
});

describe("fee-rate labels", () => {
  it("formats shared, tiered, free, and missing fee rules", () => {
    expect(
      formatFeeRateLabel({ isFree: false, baseMinutes: 10, baseFee: 600, additionalMinutes: 10, additionalFee: 600 }),
    ).toBe("10분당 600원");
    expect(
      formatFeeRateLabel({ isFree: false, baseMinutes: 30, baseFee: 1000, additionalMinutes: 10, additionalFee: 500 }),
    ).toBe("기본 30분 1,000원 · 추가 10분 500원");
    expect(formatFeeRateLabel({ isFree: true })).toBe("무료");
    expect(formatFeeRateLabel({ isFree: false })).toBe("요금 기준 확인 필요");
  });
});

describe("fees", () => {
  it("rounds additional units up", () =>
    expect(calculateParkingFee(31, { isFree: false, baseMinutes: 30, baseFee: 1000, additionalMinutes: 10, additionalFee: 500 })).toBe(1500));
  it("applies daily maximum", () =>
    expect(
      calculateParkingFee(1000, { isFree: false, baseMinutes: 10, baseFee: 1000, additionalMinutes: 10, additionalFee: 1000, dailyMaximumFee: 20000 }),
    ).toBe(20000));
});

describe("recommendations", () => {
  it("returns ranked results with the new envelope for AUTO requests", () => {
    const auto = recommendParking(
      [lot("a", 50), lot("b", 10, 37.503), lot("c", 2, 37.504), lot("d", 80, 37.52)],
      { ...requestBase, distanceMode: "AUTO" },
      [],
      now,
    );
    expect(auto.recommendations).toHaveLength(3);
    expect(auto.recommendations.map(item => item.rank)).toEqual([1, 2, 3]);
    expect(auto.recommendations[0].score).toBeGreaterThanOrEqual(auto.recommendations[1].score);
    expect(auto.effectiveDistanceMeters).not.toBeNull();
    expect(auto.effectiveDistanceMeters! % 50).toBe(0);
    for (const item of auto.recommendations) {
      expect(item.walkDistanceMeters).toBeLessThanOrEqual(1_000);
    }
  });

  it("filters MANUAL candidates at the supplied distance and reports the requested limit", () => {
    const manual = recommendParking(
      [lot("near", 2, 37.5015), lot("far-rich", 90, 37.53)],
      { ...requestBase, distanceMode: "MANUAL", maxDistanceMeters: 300 },
      [],
      now,
    );
    expect(manual.recommendations.map(item => item.id)).toEqual(["near"]);
    expect(manual.effectiveDistanceMeters).toBe(300);
    expect(manual.recommendations[0].walkDistanceMeters).toBeLessThanOrEqual(300);
  });

  it("selects the three nearest AUTO candidates before scoring", () => {
    const automatic = recommendParking(
      [lot("a", 1, 37.5012), lot("b", 1, 37.502), lot("c", 1, 37.503), lot("d", 99, 37.504)],
      { ...requestBase, distanceMode: "AUTO" },
      [],
      now,
    );
    expect(automatic.recommendations.map(item => item.id).sort()).toEqual(["a", "b", "c"]);
    expect(automatic.effectiveDistanceMeters).toBeGreaterThan(0);
    expect(automatic.effectiveDistanceMeters! % 50).toBe(0);
  });

  it("keeps realtime-unsupported lots eligible", () => {
    const unsupported: ParkingLot = {
      ...lot("ns", 5, 37.5011, 127.0215),
      realtimeSupported: false,
      realtimeUpdatedAt: null,
      availableSpaces: null,
      occupiedSpaces: null,
    };
    const result = recommendParking(
      [unsupported, lot("far", 80, 37.502)],
      { ...requestBase, distanceMode: "MANUAL", maxDistanceMeters: 1_000 },
      [],
      now,
    );
    expect(result.recommendations.map(item => item.id)).toContain("ns");
  });

  it("uses source id as the final deterministic tie-break", () => {
    const result = recommendParking(
      [lot("z", 20, 37.5015), lot("a", 20, 37.5015)],
      { ...requestBase, distanceMode: "MANUAL", maxDistanceMeters: 300 },
      [],
      now,
    );
    expect(result.recommendations.map(item => item.sourceId)).toEqual(["a", "z"]);
  });

  it("uses a supplied route", () => {
    const request: RecommendationRequest = { ...requestBase, distanceMode: "MANUAL", maxDistanceMeters: 1_000 };
    const [result] = recommendParking(
      [lot("a", 50)],
      request,
      [{ parkingId: "a", driveMinutes: 7, driveDistanceMeters: 2200, source: "KAKAO_MOBILITY" }],
      now,
    ).recommendations;
    expect(result.driveMinutes).toBe(7);
    expect(result.routeSource).toBe("KAKAO_MOBILITY");
  });
});
