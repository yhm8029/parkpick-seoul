import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/components/NavigationButtons", () => ({ NavigationButtons: () => null }));

import { ParkingCard } from "@/components/ParkingCard";
import type { ParkingRecommendation, Place } from "@/lib/types";

afterEach(cleanup);

it("explains both travel legs and unsupported realtime availability", () => {
  const origin: Place = { id: "o", name: "현재 위치", address: "서울", latitude: 37.5, longitude: 127, source: "MANUAL" };
  const parking = {
    id: "p", sourceId: "p", source: "SEOUL_PARKING_PORTAL", name: "주차장", address: "서울",
    publicParkingType: "BP",
    latitude: 37.51, longitude: 127.01, capacity: 10, realtimeSupported: false,
    availableSpaces: null, feeRule: { isFree: false }, rank: 1, score: 50, driveMinutes: 10,
    driveDistanceMeters: 1000, routeSource: "NAVER_DIRECTIONS", walkMinutes: 3,
    walkDistanceMeters: 200, estimatedFee: null, predictedAvailable: null,
    availabilityRisk: "UNKNOWN", realtimeStatus: "UNKNOWN", dataAgeMinutes: null,
    reasons: [], warnings: [], scoreBreakdown: { availability: 0, walk: 0, cost: 0, drive: 0, reliability: 0 },
  } satisfies ParkingRecommendation;
  render(<ParkingCard origin={origin} parking={parking} active onSelect={vi.fn()} />);
  expect(screen.getByText("공공시설 부설")).toBeTruthy();
  expect(screen.getByText("주차장까지 자동차")).toBeTruthy();
  expect(screen.getByText("출발지 → 주차장 · 현재 교통 기준")).toBeTruthy();
  expect(screen.getByText("목적지까지 도보")).toBeTruthy();
  expect(screen.getByText("주차장 → 목적지 · 약 200m")).toBeTruthy();
  expect(screen.getByText("서울 주차 포털에서 이 주차장의 실시간 빈자리를 제공하지 않습니다.")).toBeTruthy();
});
