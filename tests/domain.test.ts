import { describe, expect, it } from "vitest";
import { calculateParkingFee } from "@/lib/domain/fees";
import { recommendParking } from "@/lib/domain/recommend";
import type { ParkingLot, RecommendationRequest } from "@/lib/types";

const now = new Date("2026-08-25T09:00:00Z");
const request: RecommendationRequest = { origin: { latitude: 37.5, longitude: 127.02 }, destination: { id: "d", name: "목적지", address: "서울", latitude: 37.501, longitude: 127.021, source: "MANUAL" }, arrivalAt: "2026-08-25T09:30:00Z", durationMinutes: 180, profile: "BALANCED", maxWalkMinutes: 15 };
const lot = (id: string, available: number, latitude = 37.501): ParkingLot => ({ id, sourceId: id, source: "DEMO", name: id, address: "서울", latitude, longitude: 127.021, capacity: 100, occupiedSpaces: 100 - available, availableSpaces: available, realtimeUpdatedAt: "2026-08-25T08:56:00Z", realtimeSupported: true, feeRule: { isFree: false, baseMinutes: 10, baseFee: 1000, additionalMinutes: 10, additionalFee: 1000 }, isOpen: true });

describe("fees", () => {
  it("rounds additional units up", () => expect(calculateParkingFee(31, { isFree: false, baseMinutes: 30, baseFee: 1000, additionalMinutes: 10, additionalFee: 500 })).toBe(1500));
  it("applies daily maximum", () => expect(calculateParkingFee(1000, { isFree: false, baseMinutes: 10, baseFee: 1000, additionalMinutes: 10, additionalFee: 1000, dailyMaximumFee: 20000 })).toBe(20000));
});

describe("recommendations", () => {
  it("returns three ranked results", () => { const result = recommendParking([lot("a", 50), lot("b", 10, 37.503), lot("c", 2, 37.504), lot("d", 80, 37.52)], request, [], now); expect(result).toHaveLength(3); expect(result.map(item => item.rank)).toEqual([1, 2, 3]); expect(result[0].score).toBeGreaterThanOrEqual(result[1].score); });
  it("uses a supplied route", () => { const [result] = recommendParking([lot("a", 50)], request, [{ parkingId: "a", driveMinutes: 7, driveDistanceMeters: 2200, source: "KAKAO_MOBILITY" }], now); expect(result.driveMinutes).toBe(7); expect(result.routeSource).toBe("KAKAO_MOBILITY"); });
});
