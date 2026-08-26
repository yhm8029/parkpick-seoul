import { beforeEach, expect, it, vi } from "vitest";
import type { Coordinate, ParkingLot } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  nearby: vi.fn(),
  fallback: vi.fn(),
  naverRoutes: vi.fn(),
  kakaoRoutes: vi.fn(() => { throw new Error("Kakao routes must stay dormant"); }),
}));

vi.mock("@/lib/api/seoul-parking-nearby", () => ({ fetchNearbySeoulParking: mocks.nearby }));
vi.mock("@/lib/api/seoul-parking", () => ({ fetchSeoulParkingLots: mocks.fallback }));
vi.mock("@/lib/api/naver-directions", () => ({ fetchNaverDrivingRoutes: mocks.naverRoutes }));
vi.mock("@/lib/api/kakao-routes", () => ({ fetchDrivingRoutes: mocks.kakaoRoutes }));

import { POST } from "@/app/api/recommendations/route";

const origin: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const destination = {
  id: "dest",
  name: "목적지",
  address: "서울",
  latitude: 37.57,
  longitude: 126.982,
  source: "MANUAL" as const,
};
const lot = (id: string, offset: number, available: number): ParkingLot => ({
  id,
  sourceId: id,
  source: "SEOUL_OPEN_DATA",
  name: id,
  address: "서울",
  latitude: destination.latitude + offset,
  longitude: destination.longitude + offset,
  capacity: 100,
  occupiedSpaces: 100 - available,
  availableSpaces: available,
  realtimeUpdatedAt: "2026-08-26T01:00:00.000Z",
  realtimeSupported: true,
  feeRule: { isFree: false, baseMinutes: 10, baseFee: 500 },
  isOpen: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nearby.mockResolvedValue({
    lots: [lot("a", .0002, 90), lot("b", .0004, 80), lot("c", .0006, 70), lot("d", .0008, 1)],
    notice: "서울 주차 데이터",
  });
  mocks.naverRoutes.mockImplementation(async (routeOrigin: Coordinate, lots: ParkingLot[]) => lots.map((item) => ({
    parkingId: item.id,
    driveMinutes: 7,
    driveDistanceMeters: 2_200,
    source: "NAVER_DIRECTIONS" as const,
    path: [routeOrigin, { latitude: item.latitude, longitude: item.longitude }],
    congestionSections: [{ pointIndex: 0, pointCount: 2, congestion: 1 as const }],
  })));
});

it("freezes three candidates and enriches only them with NAVER routes", async () => {
  const request = new Request("http://localhost/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      destination,
      arrivalAt: "2026-08-26T02:00:00.000Z",
      durationMinutes: 180,
      profile: "BALANCED",
      distanceMode: "MANUAL",
      maxDistanceMeters: 1_000,
    }),
  });

  const response = await POST(request);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(mocks.naverRoutes).toHaveBeenCalledTimes(1);
  expect(mocks.naverRoutes.mock.calls[0][0]).toEqual(origin);
  expect(mocks.naverRoutes.mock.calls[0][1]).toHaveLength(3);
  expect(mocks.kakaoRoutes).not.toHaveBeenCalled();
  expect(body.recommendations).toHaveLength(3);
  expect(body.recommendations.every((item: { routeSource: string }) => item.routeSource === "NAVER_DIRECTIONS")).toBe(true);
  expect(body.recommendations.every((item: { routePath?: unknown[] }) => item.routePath?.length === 2)).toBe(true);
  expect(body.recommendations.every((item: { routeCongestionSections?: unknown[] }) => item.routeCongestionSections?.length === 1)).toBe(true);
});
