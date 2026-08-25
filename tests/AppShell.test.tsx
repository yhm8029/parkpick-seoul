import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-geolocation", () => ({
  useGeolocation: () => ({
    value: null,
    status: "idle",
    error: null,
    requestPosition: vi.fn(),
    refreshPosition: vi.fn()
  })
}));

vi.mock("@/components/MapPanel", () => ({ MapPanel: () => null }));
vi.mock("@/components/NavigationButtons", () => ({ NavigationButtons: () => null }));

import { AppShell } from "@/components/AppShell";
import type { ParkingRecommendation, RecommendationResponse } from "@/lib/types";

function recommendation(rank: number, name: string): ParkingRecommendation {
  return {
    id: `parking-${rank}`,
    sourceId: `source-${rank}`,
    source: "DEMO",
    name,
    address: "서울 강남구",
    latitude: 37.5 + rank / 1000,
    longitude: 127.02 + rank / 1000,
    capacity: 100,
    occupiedSpaces: 60,
    availableSpaces: 40,
    realtimeUpdatedAt: new Date().toISOString(),
    realtimeSupported: true,
    trendPer30Minutes: -2,
    feeRule: {
      isFree: false,
      baseMinutes: 10,
      baseFee: 600,
      additionalMinutes: 10,
      additionalFee: 600,
      dailyMaximumFee: 26000
    },
    phone: null,
    operatingLabel: "24시간",
    isOpen: true,
    rank,
    score: 80 - rank,
    driveMinutes: 10 + rank,
    driveDistanceMeters: 2000 + rank,
    routeSource: "ESTIMATE",
    walkMinutes: 5 + rank,
    walkDistanceMeters: 400 + rank,
    estimatedFee: 10800,
    predictedAvailable: { min: 25, max: 55, confidence: "MEDIUM" },
    availabilityRisk: "LOW",
    realtimeStatus: "LIVE",
    dataAgeMinutes: 4,
    reasons: ["도착 시에도 빈자리가 남을 가능성이 높습니다."],
    warnings: ["자동차 시간은 거리 기반 추정치입니다."],
    scoreBreakdown: { availability: 30, walk: 20, cost: 15, drive: 10, reliability: 4 }
  };
}

const response: RecommendationResponse = {
  generatedAt: new Date().toISOString(),
  dataMode: "DEMO",
  dataNotice: "API 키가 없어 데모 주차장으로 추천했습니다.",
  destination: {
    id: "coex",
    name: "코엑스",
    address: "서울 강남구 영동대로 513",
    latitude: 37.5117,
    longitude: 127.0592,
    category: "문화·쇼핑",
    source: "DEMO"
  },
  recommendations: [
    recommendation(1, "주차장 1"),
    recommendation(2, "주차장 2"),
    recommendation(3, "주차장 3")
  ]
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AppShell recommendation results", () => {
  it("replaces the planner with recommendation cards after success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(response)
    }));
    render(<AppShell />);

    await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    expect(await screen.findByRole("heading", { name: "코엑스 주변 추천" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "방문 계획 입력" })).toBeNull();
    expect(screen.getByRole("heading", { name: "주차장 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "주차장 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "주차장 3" })).toBeTruthy();
  });
});
