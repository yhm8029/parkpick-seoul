import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/components/MapPanel", () => ({
  MapPanel: (props: { origin: unknown; destination: unknown; recommendations: unknown[]; activeId: string | null; onSelect?: (id: string) => void }) => (
    <div
      data-testid="map-panel"
      data-origin={props.origin ? "set" : "none"}
      data-destination={props.destination ? "set" : "none"}
      data-active={props.activeId ?? ""}
    >
      <span data-testid="map-recommendation-count">{Array.isArray(props.recommendations) ? props.recommendations.length : 0}</span>
    </div>
  )
}));
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
  distanceMode: "AUTO",
  effectiveDistanceMeters: 450,
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

  it("returns to the populated planner with retained map when conditions are edited", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    const mapNode = await screen.findByTestId("map-panel");
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");

    await user.click(screen.getByRole("button", { name: "조건 변경" }));

    expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
    expect((screen.getByLabelText("목적지 검색") as HTMLInputElement).value).toBe("코엑스");
    expect(screen.queryByRole("heading", { name: "주차장 1" })).toBeNull();
    expect(screen.getByTestId("map-panel")).toBe(mapNode);
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
  });

  it("keeps the planner and clears recommendations on a valid empty success", async () => {
    const empty: RecommendationResponse = { ...response, recommendations: [] };
    const user = await renderReadyApp(empty);

    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    await screen.findByRole("heading", { name: "방문 계획 입력" });
    expect(screen.getByRole("status").textContent).toContain("선택한 거리 안에서 공영주차장을 찾지 못했습니다.");
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("0");
  });

  it("keeps the planner visible for invalid recommendation payloads", async () => {
    const broken = { ...response, recommendations: null } as unknown as RecommendationResponse;
    const user = await renderReadyApp(broken);

    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    await screen.findByRole("heading", { name: "방문 계획 입력" });
    expect(screen.getByRole("alert").textContent).toContain("추천 결과를 불러오지 못했습니다.");
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
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("0");
  });

  it("selects the list view after every successful recommendation", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    const listButton = await screen.findByRole("button", { name: "목록" });
    const mapButton = screen.getByRole("button", { name: "지도" });
    expect(listButton.className).toContain("is-active");
    expect(mapButton.className).not.toContain("is-active");
  });

  it("announces results and moves focus to the result heading", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    await screen.findByRole("heading", { name: "코엑스 주변 추천" });
    expect(screen.getByRole("status").textContent).toBe("코엑스 추천 3개를 불러왔습니다.");
    await vi.waitFor(() => {
      expect(document.activeElement?.id).toBe("recommendation-title");
    });
  });

  it("initializes manual distance from the last response and resubmits a MANUAL body", async () => {
    const user = await renderReadyApp();
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    const mapNode = await screen.findByTestId("map-panel");
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");

    await user.click(screen.getByRole("button", { name: "조건 변경" }));
    await user.click(screen.getByRole("button", { name: "MANUAL" }));
    const slider = screen.getByLabelText("최대 거리") as HTMLInputElement;
    expect(slider.value).toBe("450");
    expect(slider).toHaveProperty("step", "50");
    expect(slider).toHaveProperty("min", "50");
    expect(slider).toHaveProperty("max", "1000");

    fireEvent.change(slider, { target: { value: "500" } });
    expect(slider.value).toBe("500");
    expect(screen.getByTestId("map-panel")).toBe(mapNode);
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");

    const fetchMock = vi.mocked(fetch);
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await screen.findByRole("heading", { name: "코엑스 주변 추천" });

    expect(fetchMock.mock.calls).toHaveLength(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody).toMatchObject({ distanceMode: "MANUAL", maxDistanceMeters: 500 });
    expect(Object.prototype.hasOwnProperty.call(secondBody, "maxWalkMinutes")).toBe(false);
  });

  it("omits maxDistanceMeters on an AUTO submit", async () => {
    const user = await renderReadyApp();
    const fetchMock = vi.mocked(fetch);
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await screen.findByRole("heading", { name: "코엑스 주변 추천" });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstBody.distanceMode).toBe("AUTO");
    expect(Object.prototype.hasOwnProperty.call(firstBody, "maxDistanceMeters")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(firstBody, "maxWalkMinutes")).toBe(false);
  });

  it("keeps prior recommendations and shows the retained notice after a failed submit", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => response
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "down" })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    const mapNode = await screen.findByTestId("map-panel");
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");

    await user.click(screen.getByRole("button", { name: "조건 변경" }));
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));

    await screen.findByRole("heading", { name: "방문 계획 입력" });
    expect(screen.getByRole("status").textContent).toContain("이전 추천 결과를 유지");
    expect(screen.getByTestId("map-panel")).toBe(mapNode);
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
    expect(screen.getByRole("heading", { name: "방문 계획 입력" })).toBeTruthy();
  });

  it("ignores a superseded response resolved after a newer submit", async () => {
    const user = userEvent.setup();
    let resolveSuperseded!: (value: {
      ok: boolean;
      json: () => Promise<RecommendationResponse>;
    }) => void;
    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce((_url: string, _init?: RequestInit) =>
      new Promise<{ ok: boolean; json: () => Promise<RecommendationResponse> }>(resolve => {
        resolveSuperseded = resolve;
      })
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => response
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: /예시 채우기/ }));

    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await user.click(screen.getByRole("button", { name: "강남역" }));
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await screen.findByRole("heading", { name: "코엑스 주변 추천" });
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");

    await act(async () => {
      resolveSuperseded({ ok: true, json: async () => response });
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "코엑스 주변 추천" })).toBeTruthy();
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
  });

  it("does not abort the in-flight request when the maximum-distance slider changes", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    let pendingResolve!: (value: {
      ok: boolean;
      json: () => Promise<RecommendationResponse>;
    }) => void;
    const fetchMock = vi.fn().mockImplementationOnce((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<{
        ok: boolean;
        json: () => Promise<RecommendationResponse>;
      }>(resolve => { pendingResolve = resolve; });
    }).mockImplementation((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return Promise.resolve({ ok: true, json: async () => response });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: /예시 채우기/ }));
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    await act(async () => {
      pendingResolve({ ok: true, json: async () => response });
      await Promise.resolve();
    });
    await screen.findByRole("heading", { name: "코엑스 주변 추천" });

    await user.click(screen.getByRole("button", { name: "조건 변경" }));
    await user.click(screen.getByRole("button", { name: "MANUAL" }));
    const slider = screen.getByLabelText("최대 거리") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "650" } });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    let secondResolve!: (value: {
      ok: boolean;
      json: () => Promise<RecommendationResponse>;
    }) => void;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<{
        ok: boolean;
        json: () => Promise<RecommendationResponse>;
      }>(resolve => { secondResolve = resolve; });
    });
    await user.click(screen.getByRole("button", { name: /추천 주차장 찾기/ }));
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(false);
    fireEvent.change(slider, { target: { value: "750" } });
    expect(signals[1]?.aborted).toBe(false);
    await act(async () => {
      secondResolve({ ok: true, json: async () => response });
      await Promise.resolve();
    });
    expect(screen.getByTestId("map-recommendation-count").textContent).toBe("3");
  });
});
