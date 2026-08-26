import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNaverDrivingRoutes } from "@/lib/api/naver-directions";
import type { ParkingLot } from "@/lib/types";

const lot = (id: string, latitude = 37.5, longitude = 126.93): ParkingLot => ({
  id,
  sourceId: id,
  source: "DEMO",
  name: id,
  address: "서울",
  latitude,
  longitude,
  capacity: 10,
  occupiedSpaces: null,
  availableSpaces: null,
  realtimeUpdatedAt: null,
  realtimeSupported: false,
  feeRule: { isFree: false },
  phone: null,
  operatingLabel: null,
  isOpen: null,
});

const successBody = (duration = 3_180_001, distance = 25_123) => ({
  code: 0,
  route: {
    trafast: [{
      summary: { duration, distance },
      path: [[127.1, 37.5], [127.2, 37.6]],
      section: [{ pointIndex: 0, pointCount: 2, congestion: 2 }],
    }],
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchNaverDrivingRoutes", () => {
  it("normalizes duration, distance, path, and congestion from NAVER", async () => {
    vi.stubEnv("NAVER_MAP_NCP_KEY_ID", "server-id");
    vi.stubEnv("NAVER_MAP_NCP_CLIENT_SECRET", "server-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successBody()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const routes = await fetchNaverDrivingRoutes(
      { latitude: 37.4, longitude: 127 },
      [lot("p1")],
    );

    const [input, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(input.origin + input.pathname).toBe("https://maps.apigw.ntruss.com/map-direction/v1/driving");
    expect(input.searchParams.get("start")).toBe("127,37.4");
    expect(input.searchParams.get("goal")).toBe("126.93,37.5");
    expect(input.searchParams.get("option")).toBe("trafast");
    const headers = new Headers(init.headers);
    expect(headers.get("x-ncp-apigw-api-key-id")).toBe("server-id");
    expect(headers.get("x-ncp-apigw-api-key")).toBe("server-secret");
    expect(routes).toEqual([{
      parkingId: "p1",
      driveMinutes: 54,
      driveDistanceMeters: 25_123,
      source: "NAVER_DIRECTIONS",
      path: [
        { latitude: 37.5, longitude: 127.1 },
        { latitude: 37.6, longitude: 127.2 },
      ],
      congestionSections: [{ pointIndex: 0, pointCount: 2, congestion: 2 }],
    }]);
    expect(JSON.stringify(routes)).not.toContain("server-secret");
  });

  it("isolates a failed candidate from a valid candidate", async () => {
    vi.stubEnv("NAVER_MAP_NCP_KEY_ID", "server-id");
    vi.stubEnv("NAVER_MAP_NCP_CLIENT_SECRET", "server-secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 3, route: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(successBody(600_000, 5_000)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const routes = await fetchNaverDrivingRoutes(
      { latitude: 37.4, longitude: 127 },
      [lot("bad"), lot("good", 37.6, 126.94)],
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      parkingId: "good",
      driveMinutes: 10,
      driveDistanceMeters: 5_000,
      source: "NAVER_DIRECTIONS",
    });
    expect(warn).toHaveBeenCalledWith("NAVER Directions failed", { category: "provider-code", code: 3 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("server-secret");
  });
});
