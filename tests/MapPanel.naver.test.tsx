import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { MapPanel } from "@/components/MapPanel";
import type { ParkingRecommendation, Place } from "@/lib/types";

type LatLngConstructorCall = { args: unknown[] };
type FitBoundsCall = { args: unknown[] };
type NaverHandle = {
  maps: {
    LatLng: new (...args: unknown[]) => unknown;
    LatLngBounds: new (...args: unknown[]) => { extend: (coordinate: unknown) => void };
    Map: new (...args: unknown[]) => unknown;
    Marker: new (...args: unknown[]) => unknown;
    Polyline: new (...args: unknown[]) => { setMap: (map: unknown) => void };
    Event: { addListener: (...args: unknown[]) => void };
  };
  constructorCalls: {
    LatLng: LatLngConstructorCall[];
    LatLngBounds: LatLngConstructorCall[];
    Map: unknown[][];
    Marker: unknown[][];
    Polyline: unknown[][];
  };
  fitBoundsCalls: FitBoundsCall[];
  setCenterCalls: { args: unknown[] }[];
  setZoomCalls: { args: unknown[] }[];
  polylineSetMapCalls: unknown[];
};

function installNaverHandle(): NaverHandle {
  const handle: NaverHandle = {
    maps: undefined as unknown as NaverHandle["maps"],
    constructorCalls: {
      LatLng: [],
      LatLngBounds: [],
      Map: [],
      Marker: []
      ,Polyline: []
    },
    fitBoundsCalls: [],
    setCenterCalls: [],
    setZoomCalls: []
    ,polylineSetMapCalls: []
  };

  class LatLng {
    readonly args: unknown[];

    constructor(...args: unknown[]) {
      this.args = args;
      handle.constructorCalls.LatLng.push({ args });
    }
  }

  class LatLngBounds {
    constructor(...args: unknown[]) {
      handle.constructorCalls.LatLngBounds.push({ args });
    }
    extend(): void {
      // intentionally a no-op; the test inspects constructor args instead.
    }
  }

  function fitBounds(this: unknown, ...args: unknown[]): void {
    handle.fitBoundsCalls.push({ args });
  }
  function setCenter(this: unknown, ...args: unknown[]): void {
    handle.setCenterCalls.push({ args });
  }
  function setZoom(this: unknown, ...args: unknown[]): void {
    handle.setZoomCalls.push({ args });
  }

  class Map {
    constructor(...args: unknown[]) {
      handle.constructorCalls.Map.push(args);
      const target = { fitBounds, setCenter, setZoom };
      return new Proxy(target, {
        get(t, prop) {
          if (prop in t) {
            return (t as Record<string | symbol, unknown>)[prop];
          }
          return undefined;
        }
      }) as unknown as Record<string, unknown>;
    }
  }

  class Marker {
    constructor(...args: unknown[]) {
      handle.constructorCalls.Marker.push(args);
    }
  }

  class Polyline {
    constructor(...args: unknown[]) {
      handle.constructorCalls.Polyline.push(args);
    }
    setMap(map: unknown): void {
      handle.polylineSetMapCalls.push(map);
    }
  }

  const Event = { addListener: () => undefined };

  handle.maps = { LatLng, LatLngBounds, Map, Marker, Polyline, Event };

  (window as unknown as Record<string, unknown>).naver = { maps: handle.maps };
  return handle;
}

function recommendation(rank: number, latitude: number, longitude: number): ParkingRecommendation {
  return {
    id: `parking-${rank}`,
    sourceId: `source-${rank}`,
    source: "DEMO",
    name: `주차장 ${rank}`,
    address: "서울 강남구",
    latitude,
    longitude,
    capacity: 100,
    occupiedSpaces: 60,
    availableSpaces: 40,
    realtimeUpdatedAt: new Date().toISOString(),
    realtimeSupported: true,
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
    trendPer30Minutes: -2,
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
    reasons: ["예약 시간에 빈 자리가 많을 가능성이 높습니다."],
    warnings: ["자동차 전용 도로를 통해 진입합니다."],
    scoreBreakdown: { availability: 1, walk: 1, cost: 1, drive: 1, reliability: 1 }
  };
}

function buildDestination(): Place {
  return {
    id: "dest-1",
    name: "강남역",
    address: "서울 강남구",
    latitude: 37.4979,
    longitude: 127.0276,
    source: "KAKAO",
    category: "지하철"
  };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("MapPanel NAVER fitBounds regression", () => {
  let originalKakao: string | undefined;
  let originalNaver: string | undefined;

  beforeEach(() => {
    originalKakao = process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
    originalNaver = process.env.NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID;
    delete process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
    process.env.NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID = "test-naver-key";
  });

  afterEach(() => {
    cleanup();
    if (originalKakao === undefined) {
      delete process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
    } else {
      process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY = originalKakao;
    }
    if (originalNaver === undefined) {
      delete process.env.NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID;
    } else {
      process.env.NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID = originalNaver;
    }
    delete (window as unknown as Record<string, unknown>).naver;
    document.head.replaceChildren();
  });

  it("constructs LatLngBounds from real southwest/northeast LatLngs and uses modest fitBounds options", async () => {
    const naverSdkModule = await import("@/lib/maps/naver-sdk");
    vi.spyOn(naverSdkModule, "loadNaverMapSdk").mockResolvedValue(undefined);

    const handle = installNaverHandle();

    const destination = buildDestination();
    const recommendations = [
      recommendation(1, 37.4979, 127.0276),
      recommendation(2, 37.5001, 127.0301),
      recommendation(3, 37.4955, 127.0251)
    ];

    render(
      <MapPanel
        origin={{ latitude: 37.4985, longitude: 127.0283 }}
        destination={destination}
        recommendations={recommendations}
      />
    );

    await waitFor(() => {
      expect(handle.constructorCalls.LatLngBounds.length).toBeGreaterThan(0);
    });
    await flushEffects();

    const boundsCall = handle.constructorCalls.LatLngBounds[0]!;
    // NAVER requires LatLngBounds(sw, ne); current code calls `new LatLngBounds()` with no args.
    expect(boundsCall.args).toHaveLength(2);

    const latLngArgs = handle.constructorCalls.LatLng.filter((call) => Array.isArray(call.args));
    // Every LatLng in the NAVER path must be built from primitive (latitude, longitude) numbers.
    for (const call of latLngArgs) {
      const args = call.args as unknown[];
      expect(args).toHaveLength(2);
      const [latitude, longitude] = args as [number, number];
      expect(typeof latitude).toBe("number");
      expect(typeof longitude).toBe("number");
    }

    const latitudes = latLngArgs.map((call) => (call.args as [number, number])[0]);
    const longitudes = latLngArgs.map((call) => (call.args as [number, number])[1]);
    const expectedSw = {
      latitude: Math.min(...latitudes),
      longitude: Math.min(...longitudes)
    };
    const expectedNe = {
      latitude: Math.max(...latitudes),
      longitude: Math.max(...longitudes)
    };

    const swArgs = (boundsCall.args[0] as unknown as { args: [number, number] }).args;
    const neArgs = (boundsCall.args[1] as unknown as { args: [number, number] }).args;
    expect({ latitude: swArgs[0], longitude: swArgs[1] }).toEqual(expectedSw);
    expect({ latitude: neArgs[0], longitude: neArgs[1] }).toEqual(expectedNe);

    expect(handle.fitBoundsCalls.length).toBeGreaterThan(0);
    const fitCall = handle.fitBoundsCalls[0]!;
    // The production bug is `map.fitBounds(bounds)` with no options object. After the
    // fix, the second argument must be a fitBounds options literal whose `maxZoom`
    // (a known NAVER fitBounds option) caps the auto-zoom so degenerate bounds do
    // not jump to ~21.
    expect(fitCall.args.length).toBeGreaterThanOrEqual(2);
    const options = fitCall.args[1] as { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown; maxZoom?: unknown } | undefined;
    expect(options).toBeDefined();
    expect(typeof options?.maxZoom).toBe("number");
    expect((options!.maxZoom as number)).toBeLessThanOrEqual(16);
    expect((options!.maxZoom as number)).toBeGreaterThan(0);
    expect(options).toMatchObject({ top: 40, right: 40, bottom: 40, left: 40 });
  });

  it("uses setCenter/setZoom (no degenerate fitBounds) when only one point exists", async () => {
    const naverSdkModule = await import("@/lib/maps/naver-sdk");
    vi.spyOn(naverSdkModule, "loadNaverMapSdk").mockResolvedValue(undefined);

    const handle = installNaverHandle();
    const destination = buildDestination();
    const recommendations = [recommendation(1, 37.4979, 127.0276)];

    render(
      <MapPanel
        origin={{ latitude: 37.4979, longitude: 127.0276 }}
        destination={destination}
        recommendations={recommendations}
      />
    );

    await waitFor(() => {
      expect(handle.constructorCalls.LatLngBounds.length).toBeGreaterThan(0);
    });
    await flushEffects();

    const boundsCall = handle.constructorCalls.LatLngBounds[0]!;
    expect(boundsCall.args).toHaveLength(2);
    const swArgs = (boundsCall.args[0] as unknown as { args: [number, number] }).args;
    const neArgs = (boundsCall.args[1] as unknown as { args: [number, number] }).args;
    expect(swArgs[0]).toBeCloseTo(neArgs[0], 6);
    expect(swArgs[1]).toBeCloseTo(neArgs[1], 6);

    // For degenerate bounds the renderer must avoid fitBounds (which would zoom
    // the single point to z=21) and instead call setCenter + setZoom at a useful
    // street level.
    expect(handle.fitBoundsCalls.length).toBe(0);
    expect(handle.setCenterCalls.length).toBeGreaterThan(0);
    expect(handle.setZoomCalls.length).toBeGreaterThan(0);
    const zoom = (handle.setZoomCalls[0]!.args[0] as number);
    expect(zoom).toBeGreaterThan(0);
    expect(zoom).toBeLessThanOrEqual(16);
  });

  it("loads the real NAVER map from origin before a destination is selected", async () => {
    const naverSdkModule = await import("@/lib/maps/naver-sdk");
    vi.spyOn(naverSdkModule, "loadNaverMapSdk").mockResolvedValue(undefined);
    const handle = installNaverHandle();

    render(<MapPanel origin={{ latitude: 37.5665, longitude: 126.978 }} destination={null} recommendations={[]} />);

    await waitFor(() => expect(handle.constructorCalls.Map).toHaveLength(1));
    expect(handle.setCenterCalls.length).toBeGreaterThan(0);
    expect(handle.setZoomCalls[0]?.args[0]).toBe(15);
    expect(screen.queryByText(/카카오/)).toBeNull();
  });

  it("uses the Seoul overview zoom before any point is selected", async () => {
    const naverSdkModule = await import("@/lib/maps/naver-sdk");
    vi.spyOn(naverSdkModule, "loadNaverMapSdk").mockResolvedValue(undefined);
    const handle = installNaverHandle();

    render(<MapPanel origin={null} destination={null} recommendations={[]} />);

    await waitFor(() => expect(handle.constructorCalls.Map).toHaveLength(1));
    expect(handle.setZoomCalls[0]?.args[0]).toBe(13);
  });

  it("draws and cleans up the active NAVER route without rebuilding the map", async () => {
    const naverSdkModule = await import("@/lib/maps/naver-sdk");
    vi.spyOn(naverSdkModule, "loadNaverMapSdk").mockResolvedValue(undefined);
    const handle = installNaverHandle();
    const destination = buildDestination();
    const first = {
      ...recommendation(1, 37.4979, 127.0276),
      routeSource: "NAVER_DIRECTIONS" as const,
      routePath: [
        { latitude: 37.51, longitude: 127.01 },
        { latitude: 37.505, longitude: 127.02 },
        { latitude: 37.4979, longitude: 127.0276 },
      ],
      routeCongestionSections: [{ pointIndex: 0, pointCount: 3, congestion: 3 as const }],
    };

    const view = render(<MapPanel origin={{ latitude: 37.51, longitude: 127.01 }} destination={destination} recommendations={[first]} activeId={first.id} />);
    await waitFor(() => expect(handle.constructorCalls.Polyline.length).toBeGreaterThanOrEqual(2));
    expect(handle.constructorCalls.Map).toHaveLength(1);

    view.rerender(<MapPanel origin={{ latitude: 37.51, longitude: 127.01 }} destination={destination} recommendations={[first]} activeId={null} />);
    await waitFor(() => expect(handle.polylineSetMapCalls).toContain(null));
    expect(handle.constructorCalls.Map).toHaveLength(1);
  });

  it("reflects ten visible recommendations in the footer", () => {
    render(
      <MapPanel
        origin={{ latitude: 37.5665, longitude: 126.978 }}
        destination={buildDestination()}
        recommendations={Array.from({ length: 10 }, (_, index) =>
          recommendation(index + 1, 37.4979 + index * 0.0001, 127.0276),
        )}
      />,
    );

    expect(screen.getByText("출발지 · 목적지 · 추천 1~10순위")).toBeTruthy();
  });
});
