import { describe, expect, it, vi } from "vitest";
import staticFixture from "./fixtures/seoul/get-park-info.sample.json";
import realtimeFixture from "./fixtures/seoul/get-parking-info.sample.json";
import { createSeoulParkingClient } from "@/lib/api/seoul-parking";
import { joinSeoulParkingRows } from "@/lib/api/seoul-parking-normalize";

type Wrapper = Record<string, unknown> & { row: Array<Record<string, unknown>>; list_total_count: number };

const STATIC_ROWS = staticFixture.GetParkInfo.row;
const REALTIME_ROWS = realtimeFixture.GetParkingInfo.row;

function buildStaticPayload(total: number, rows: Array<Record<string, unknown>>): Wrapper {
  const expanded: Array<Record<string, unknown>> = [];
  for (let i = 0; i < total; i += 1) {
    const template = rows[i % rows.length] ?? rows[0];
    if (!template) continue;
    expanded.push({ ...template, PKLT_CD: `PAGE-${i}` });
  }
  return {
    list_total_count: total,
    RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
    row: expanded,
  };
}

function buildRealtimePayload(total: number, rows: Array<Record<string, unknown>>): Wrapper {
  const expanded: Array<Record<string, unknown>> = [];
  for (let i = 0; i < total; i += 1) {
    const template = rows[i % rows.length] ?? rows[0];
    if (!template) continue;
    expanded.push({ ...template, PKLT_CD: i < 3 ? `PAGE-${i}` : i === 3 ? "UNMATCHED" : "" });
  }
  return {
    list_total_count: total,
    RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
    row: expanded,
  };
}

function buildResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makePagedResponse(input: string | URL, options: { staticTotal?: number; realtimeTotal?: number; staticRows?: Array<Record<string, unknown>>; realtimeRows?: Array<Record<string, unknown>> } = {}) {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const match = url.pathname.match(/\/(GetParkInfo|GetParkingInfo)\/(\d+)\/(\d+)\/?$/);
  if (!match) throw new Error(`unexpected Seoul URL: ${url.pathname}`);
  const [, service, startRaw, endRaw] = match;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (service === "GetParkInfo") {
    const total = options.staticTotal ?? STATIC_ROWS.length;
    const payload = buildStaticPayload(total, options.staticRows ?? STATIC_ROWS);
    return buildResponse({ GetParkInfo: { ...payload, row: payload.row.slice(start - 1, end) } });
  }
  const total = options.realtimeTotal ?? REALTIME_ROWS.length;
  const payload = buildRealtimePayload(total, options.realtimeRows ?? REALTIME_ROWS);
  return buildResponse({ GetParkingInfo: { ...payload, row: payload.row.slice(start - 1, end) } });
}

function makeFailedResponse(input: string | URL, failingService: "GetParkInfo" | "GetParkingInfo"): Response {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const match = url.pathname.match(/\/(GetParkInfo|GetParkingInfo)\/\d+\/\d+\/?$/);
  const service = match?.[1];
  if (service === failingService) {
    if (failingService === "GetParkingInfo") return buildResponse({});
    return buildResponse({
      [failingService]: {
        list_total_count: 0,
        RESULT: { CODE: "ERROR-500", MESSAGE: "Seoul Open API server error" },
        row: [],
      },
    });
  }
  return makePagedResponse(input, { staticTotal: STATIC_ROWS.length, realtimeTotal: REALTIME_ROWS.length });
}

describe("Seoul parking schema join", () => {
  it("joins realtime occupancy to valid static coordinates and rejects the rest deterministically", () => {
    const result = joinSeoulParkingRows(REALTIME_ROWS, STATIC_ROWS);
    expect(result.lots).toHaveLength(3);
    expect(result.lots.map((lot) => lot.sourceId)).toEqual(["LIVE-A", "LIVE-B", "LIVE-ZERO"]);
    expect(result.stats).toEqual({ liveRows: 5, matchedRows: 3, rejectedRows: 2 });
    expect(result.lots.every((lot) => lot.source === "SEOUL_OPEN_DATA")).toBe(true);

    const zeroLot = result.lots.find((lot) => lot.sourceId === "LIVE-ZERO");
    expect(zeroLot?.occupiedSpaces).toBe(0);
    expect(zeroLot?.availableSpaces).toBe(zeroLot?.capacity);
    expect(zeroLot?.feeRule.dailyMaximumFee).toBe(24000);
    expect(zeroLot?.isOpen).toBeNull();
    expect(zeroLot?.realtimeSupported).toBe(true);

    const realtimeAuthority = result.lots.find((lot) => lot.sourceId === "LIVE-A");
    expect(realtimeAuthority?.name).toBe("ParkA Realtime");
    expect(realtimeAuthority?.address).toBe("Seoul Realtime Address A");

    const duplicateRealtime = [{ ...REALTIME_ROWS[0], PKLT_CD: "LIVE-DUP" }];
    const duplicateForward = joinSeoulParkingRows(duplicateRealtime, STATIC_ROWS).lots[0];
    const duplicateReversed = joinSeoulParkingRows(duplicateRealtime, [...STATIC_ROWS].reverse()).lots[0];
    expect([duplicateForward?.latitude, duplicateForward?.longitude]).toEqual([37.55, 127.04]);
    expect([duplicateReversed?.latitude, duplicateReversed?.longitude]).toEqual([37.55, 127.04]);

    const invalidCodes = ["MISSING", "OUT-OF-RANGE", "NONNUMERIC"];
    const invalidRealtime = invalidCodes.map((PKLT_CD) => ({
      ...REALTIME_ROWS[0],
      PKLT_CD,
      NOW_PRK_VHCL_CNT: 0,
    }));
    const invalidStatic = [
      { PKLT_CD: "MISSING", LOT: 127.01 },
      { PKLT_CD: "OUT-OF-RANGE", LAT: 35, LOT: 127.01 },
      { PKLT_CD: "NONNUMERIC", LAT: "not-a-number", LOT: 127.01 },
    ];
    expect(joinSeoulParkingRows(invalidRealtime, invalidStatic).stats)
      .toEqual({ liveRows: 3, matchedRows: 0, rejectedRows: 3 });

    const zeroCapacity = joinSeoulParkingRows(
      [{ ...REALTIME_ROWS[0], TPKCT: 0 }],
      STATIC_ROWS,
    );
    expect(zeroCapacity.lots).toHaveLength(0);
    expect(zeroCapacity.stats).toEqual({ liveRows: 1, matchedRows: 0, rejectedRows: 1 });

    const duplicateRealtimeCode = joinSeoulParkingRows(
      [{ ...REALTIME_ROWS[0] }, { ...REALTIME_ROWS[0], NOW_PRK_VHCL_CNT: 1 }],
      STATIC_ROWS,
    );
    expect(duplicateRealtimeCode.lots).toHaveLength(0);
    expect(duplicateRealtimeCode.stats).toEqual({ liveRows: 2, matchedRows: 0, rejectedRows: 2 });
  });
});

describe("Seoul parking client", () => {
  it("fetches both services with paging, deduplicates concurrent requests, and caches the successful result for four minutes", async () => {
    let now = 1_000_000;
    const requestedUrls: string[] = [];
    const staticTotal = 1_500;
    const realtimeTotal = REALTIME_ROWS.length;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);
      return makePagedResponse(url, { staticTotal, realtimeTotal });
    });
    const client = createSeoulParkingClient({ fetchImpl: fetchMock as unknown as typeof fetch, now: () => now });

    const [first, second, third] = await Promise.all([
      client.fetchParkingLots("test-key"),
      client.fetchParkingLots("test-key"),
      client.fetchParkingLots("test-key"),
    ]);

    expect(first.lots).toHaveLength(3);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(first.lots.every((lot) => lot.source === "SEOUL_OPEN_DATA")).toBe(true);
    expect(first.notice).toContain("실시간 점유");
    expect(first.notice).toContain("정적 좌표");
    expect(first.notice).toContain("결합 3건");
    expect(first.notice).toContain("제외 2건");

    const uniqueUrls = new Set(requestedUrls);
    expect(fetchMock).toHaveBeenCalledTimes(uniqueUrls.size);
    expect(uniqueUrls.size).toBe(3);
    expect([...uniqueUrls].some((url) => /\/GetParkInfo\/1\/1000\/?$/.test(url))).toBe(true);
    expect([...uniqueUrls].some((url) => /\/GetParkInfo\/1001\/1500\/?$/.test(url))).toBe(true);
    expect([...uniqueUrls].some((url) => /\/GetParkingInfo\/1\/1000\/?$/.test(url))).toBe(true);

    const cached = await client.fetchParkingLots("test-key");
    expect(cached).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(uniqueUrls.size);

    const otherKey = await client.fetchParkingLots("other-key");
    expect(otherKey).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(uniqueUrls.size + 3);

    now += 4 * 60_000 + 1;
    const fourth = await client.fetchParkingLots("test-key");
    expect(fourth).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(uniqueUrls.size + 6);
  });

  it("rejects either service failure and does not cache it", async () => {
    for (const failingService of ["GetParkInfo", "GetParkingInfo"] as const) {
      const fetchMock = vi.fn(async (input: string | URL) => makeFailedResponse(input, failingService));
      const client = createSeoulParkingClient({ fetchImpl: fetchMock as unknown as typeof fetch, now: () => 2_000_000 });

      await expect(client.fetchParkingLots("test-key")).rejects.toThrow();
      const callsBeforeRetry = fetchMock.mock.calls.length;
      await expect(client.fetchParkingLots("test-key")).rejects.toThrow();
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    }

    const partialFetch = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (/\/GetParkInfo\/1001\/1500\/?$/.test(url)) {
        return buildResponse({
          GetParkInfo: {
            list_total_count: 1_500,
            RESULT: { CODE: "INFO-000", MESSAGE: "partial" },
            row: [],
          },
        });
      }
      return makePagedResponse(url, { staticTotal: 1_500, realtimeTotal: REALTIME_ROWS.length });
    });
    const partialClient = createSeoulParkingClient({ fetchImpl: partialFetch as unknown as typeof fetch, now: () => 3_000_000 });
    await expect(partialClient.fetchParkingLots("test-key")).rejects.toThrow(/partial page set/);

    const undersizedFetch = vi.fn(async (input: string | URL) =>
      makePagedResponse(input, { staticTotal: STATIC_ROWS.length, realtimeTotal: 2 }));
    const undersizedClient = createSeoulParkingClient({ fetchImpl: undersizedFetch as unknown as typeof fetch, now: () => 4_000_000 });
    await expect(undersizedClient.fetchParkingLots("test-key")).rejects.toThrow(/below threshold/);
  });
});
