import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/seoul/search-parking.sample.json";
import { createNearbyParkingClient } from "@/lib/api/seoul-parking-nearby";

type SearchParkingFixture = {
  result_state: string;
  res_value: { parking_list_count: number; parking_list: Array<Record<string, unknown>> };
};

const FIXTURE = fixture as SearchParkingFixture;
const DESTINATION = { latitude: 37.5665, longitude: 126.978 };
const FIXTURE_TS_MS = Date.UTC(2026, 7, 26, 0, 0, 0);
const TEST_NOW_MS = FIXTURE_TS_MS + 5 * 60_000;

function buildJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeFetchMock() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return buildJsonResponse(FIXTURE);
  });
  return { fetchMock, calls };
}

describe("createNearbyParkingClient", () => {
  it("POSTs the six required fields, normalizes live NW rows, and marks unsupported NS rows", async () => {
    const { fetchMock, calls } = makeFetchMock();
    const client = createNearbyParkingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => TEST_NOW_MS,
    });

    const result = await client.fetchNearby(DESTINATION, 1_000);

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded",
    });
    const params = new URLSearchParams(String(init?.body ?? ""));
    expect([...params.keys()].sort()).toEqual(
      ["LAT", "LON", "Rule", "Type", "index", "range"].sort(),
    );
    expect(params.get("LAT")).toBe(DESTINATION.latitude.toString());
    expect(params.get("LON")).toBe(DESTINATION.longitude.toString());
    expect(params.get("index")).toBe("1");
    expect(params.get("range")).toBe("1000");
    expect(params.get("Type")).toBe("3");
    expect(params.get("Rule")).toBe("1");
    expect(url).toBe("https://parking.seoul.go.kr/SearchParking.do");

    expect(result.lots.map((lot) => lot.sourceId)).toEqual(["B01-NS", "LIVE-NW", "STATIC-NS"]);
    expect(result.lots.every((lot) => lot.source === "SEOUL_PARKING_PORTAL")).toBe(true);

    const live = result.lots.find((lot) => lot.sourceId === "LIVE-NW");
    expect(live).toBeDefined();
    expect(live?.source).toBe("SEOUL_PARKING_PORTAL");
    expect(live?.occupiedSpaces).toBe(28);
    expect(live?.availableSpaces).toBe(87);
    expect(live?.realtimeSupported).toBe(true);
    expect(live?.address).toBe("Seoul Live Lot New Address");
    expect(live?.feeRule.baseFee).toBe(1000);
    expect(live?.feeRule.additionalFee).toBe(500);
    expect(live?.feeRule.dailyMaximumFee).toBe(18000);
    expect(live?.phone).toBe("02-1111-0001");

    for (const sourceId of ["STATIC-NS", "B01-NS"] as const) {
      const nsLot = result.lots.find((lot) => lot.sourceId === sourceId);
      expect(nsLot, `missing ${sourceId}`).toBeDefined();
      expect(nsLot?.source).toBe("SEOUL_PARKING_PORTAL");
      expect(nsLot?.occupiedSpaces).toBeNull();
      expect(nsLot?.availableSpaces).toBeNull();
      expect(nsLot?.realtimeUpdatedAt).toBeNull();
      expect(nsLot?.realtimeSupported).toBe(false);
    }
    expect(result.lots.find((lot) => lot.sourceId === "B01-NS")?.phone).toBe("02-1111-0006");
    expect(result.lots.find((lot) => lot.sourceId === "STATIC-NS")?.phone).toBe("02-1111-0002");
  });

  it("refetches after cache expiry and evicts oldest entries beyond the cache cap", async () => {
    let now = TEST_NOW_MS;
    const fetchMock = vi.fn(async () => buildJsonResponse(FIXTURE));
    const client = createNearbyParkingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
    });

    const first = await client.fetchNearby(DESTINATION, 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2 * 60_000 + 1;
    const expired = await client.fetchNearby(DESTINATION, 1_000);
    expect(expired).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    // Cache already holds the refreshed DESTINATION entry. Fill with 127 distinct keys so cache reaches the 128-entry cap, then insert one more key to force eviction of the oldest cached entry.
    for (let i = 0; i < 127; i += 1) {
      await client.fetchNearby(
        { latitude: 37.0 + i * 1e-4, longitude: 126.978 },
        1_000,
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(127);
    await client.fetchNearby({ latitude: 37.0 + 127 * 1e-4, longitude: 126.978 }, 1_000);
    await client.fetchNearby({ latitude: 37.0 + 128 * 1e-4, longitude: 126.978 }, 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(129);

    fetchMock.mockClear();
    const evictedKey = await client.fetchNearby(
      { latitude: 37.0, longitude: 126.978 },
      1_000,
    );
    expect(evictedKey).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const stillCached = await client.fetchNearby(
      { latitude: 37.0 + 128 * 1e-4, longitude: 126.978 },
      1_000,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    void stillCached;
  });
});
