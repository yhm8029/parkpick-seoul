import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NavigationButtons } from "@/components/NavigationButtons";
import type { ParkingRecommendation, Place } from "@/lib/types";

afterEach(cleanup);

it("renders only NAVER navigation in the active UI", () => {
  const origin: Place = { id: "o", name: "현재 위치", address: "서울", latitude: 37.5, longitude: 127, source: "MANUAL" };
  const parking = {
    id: "p", sourceId: "p", source: "DEMO", name: "주차장", address: "서울",
    latitude: 37.51, longitude: 127.01, capacity: 10, realtimeSupported: false,
    feeRule: { isFree: false }, rank: 1, score: 50, driveMinutes: 10,
    driveDistanceMeters: 1000, routeSource: "ESTIMATE", walkMinutes: 3,
    walkDistanceMeters: 200, estimatedFee: null, predictedAvailable: null,
    availabilityRisk: "UNKNOWN", realtimeStatus: "UNKNOWN", dataAgeMinutes: null,
    reasons: [], warnings: [], scoreBreakdown: { availability: 0, walk: 0, cost: 0, drive: 0, reliability: 0 },
  } satisfies ParkingRecommendation;
  render(<NavigationButtons origin={origin} parking={parking} />);
  expect(screen.getByRole("button", { name: /네이버지도/ })).toBeTruthy();
  expect(screen.queryByText(/카카오/)).toBeNull();
  expect(document.getElementById("kakao-js-sdk")).toBeNull();
});
