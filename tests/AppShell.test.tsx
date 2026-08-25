import { act, cleanup, render, screen } from "@testing-library/react";
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

async function renderReadyApp(payload: RecommendationResponse = response) {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(payload)
  }));
  render(<AppShell />);
  await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
  return user;
}

describe("AppShell recommendation results", () => {
  it("replaces the planner with recommendation cards after success", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    expect(await screen.findByRole("heading", { name: "코엑스 주변 추천" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "방문 계획 입력" })).toBeNull();
    expect(screen.getByRole("heading", { name: "주차장 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "주차장 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "주차장 3" })).toBeTruthy();
  });

  it("returns to the populated planner when conditions are edited", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await screen.findByRole("heading", { name: "코엑스 주변 추천" });

    await user.click(screen.getByRole("button", { name: "조건 변경" }));

    expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
    expect((screen.getByLabelText("목적지 검색") as HTMLInputElement).value).toBe("코엑스");
    expect(screen.queryByRole("heading", { name: "주차장 1" })).toBeNull();
  });

  it.each([
    [{ ...response, recommendations: [] }, "조건에 맞는 추천 주차장을 찾지 못했습니다."],
    [{ ...response, recommendations: null } as unknown as RecommendationResponse, "추천 결과를 불러오지 못했습니다."]
  ])("keeps the planner visible for invalid recommendations", async (payload, message) => {
    const user = await renderReadyApp(payload);

    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
  });

  it("ignores an aborted response and releases loading when an input changes", async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch!: (value: {
      ok: boolean;
      json: () => Promise<RecommendationResponse>;
    }) => void;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<{
        ok: boolean;
        json: () => Promise<RecommendationResponse>;
      }>(resolve => { resolveFetch = resolve; });
    }));
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    await user.click(screen.getByRole("button", { name: "강남역" }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /추천 주차장 찾기/ }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => response });
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "코엑스 주변 추천" })).toBeNull();
    expect((screen.getByLabelText("목적지 검색") as HTMLInputElement).value).toBe("강남역");
  });

  it("selects the list view after every successful recommendation", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    const listButton = await screen.findByRole("button", { name: "목록" });
    const mapButton = screen.getByRole("button", { name: "지도" });
    expect(listButton.className).toContain("is-active");
    expect(mapButton.className).not.toContain("is-active");
  });
});
