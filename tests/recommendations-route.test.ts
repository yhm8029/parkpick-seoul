import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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

const rankedLots = Array.from({ length: 10 }, (_, index) =>
  lot(`lot-${index + 1}`, (index + 1) * 0.0001, 90 - index),
);
const nearbyLots = [lot("lot-11", 0.006, 0), ...rankedLots];
const routePath: Coordinate[] = Array.from({ length: 2_500 }, (_, index) => ({
  latitude: 37.5665 + index * 0.0001,
  longitude: 126.978 + index * 0.0001,
}));
const routeSections = Array.from({ length: 256 }, (_, index) => ({
  pointIndex: index,
  pointCount: 2,
  congestion: 1 as const,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nearby.mockResolvedValue({
    lots: nearbyLots,
    notice: "서울 주차 데이터",
  });
  mocks.naverRoutes.mockImplementation(async (_routeOrigin: Coordinate, lots: ParkingLot[]) => lots.map((item) => ({
    parkingId: item.id,
    driveMinutes: 7,
    driveDistanceMeters: 2_200,
    source: "NAVER_DIRECTIONS" as const,
    path: routePath,
    congestionSections: routeSections,
  })));
});

it("runs recommendation provider calls in Vercel's Seoul region", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
  ) as { regions?: string[] };
  expect(config.regions).toEqual(["icn1"]);
});

it("freezes ten candidates and enriches only them with NAVER routes", async () => {
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
  const responseText = await response.text();
  const body = JSON.parse(responseText);

  expect(response.status).toBe(200);
  expect(mocks.naverRoutes).toHaveBeenCalledTimes(1);
  expect(mocks.naverRoutes.mock.calls[0][0]).toEqual(origin);
  expect(mocks.naverRoutes.mock.calls[0][1]).toHaveLength(10);
  expect(mocks.kakaoRoutes).not.toHaveBeenCalled();
  expect(body.recommendations).toHaveLength(10);
  expect(new TextEncoder().encode(responseText).byteLength).toBeLessThan(2 * 1024 * 1024);
  const naverInputIds = (mocks.naverRoutes.mock.calls[0][1] as ParkingLot[]).map((item) => item.id);
  const bodyIds = body.recommendations.map((item: { id: string }) => item.id);
  expect(new Set(naverInputIds)).toEqual(new Set(rankedLots.map((item) => item.id)));
  expect(new Set(bodyIds)).toEqual(new Set(naverInputIds));
  expect(bodyIds).not.toContain("lot-11");
  expect(body.recommendations.every((item: { routeSource: string }) => item.routeSource === "NAVER_DIRECTIONS")).toBe(true);
  expect(body.recommendations.every((item: { routePath?: unknown[] }) => item.routePath?.length === 2_500)).toBe(true);
  expect(body.recommendations.every((item: { routeCongestionSections?: unknown[] }) => item.routeCongestionSections?.length === 256)).toBe(true);
});

it("falls back to estimates when NAVER returns only a subset", async () => {
  mocks.naverRoutes.mockImplementation(async (routeOrigin: Coordinate, lots: ParkingLot[]) =>
    lots.slice(0, 9).map((item) => ({
      parkingId: item.id,
      driveMinutes: 7,
      driveDistanceMeters: 2_200,
      source: "NAVER_DIRECTIONS" as const,
      path: [routeOrigin, { latitude: item.latitude, longitude: item.longitude }],
      congestionSections: [{ pointIndex: 0, pointCount: 2, congestion: 1 as const }],
    })),
  );
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
  expect(body.recommendations).toHaveLength(10);
  expect(body.recommendations.filter((item: { routeSource: string }) => item.routeSource === "NAVER_DIRECTIONS")).toHaveLength(9);
  expect(body.recommendations.filter((item: { routeSource: string }) => item.routeSource === "ESTIMATE")).toHaveLength(1);
});
