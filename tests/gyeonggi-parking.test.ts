import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  joinGyeonggiParkingRows,
  parseGyeonggiParkingXml,
} from "@/lib/api/gyeonggi-parking-normalize";
import {
  createGyeonggiParkingClient,
  fetchGyeonggiParkingLots,
} from "@/lib/api/gyeonggi-parking";
import type { ParkingLot } from "@/lib/types";

const INFO_FIXTURE_PATH = fileURLToPath(new URL("./fixtures/gyeonggi/parking-info.sample.xml", import.meta.url));
const AVAILABILITY_FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/gyeonggi/parking-availability.sample.xml", import.meta.url),
);

const infoXml = readFileSync(INFO_FIXTURE_PATH, "utf8");
const availabilityXml = readFileSync(AVAILABILITY_FIXTURE_PATH, "utf8");

describe("Gyeonggi GITS normalizer", () => {
  it("parses documented XML envelopes into normalized body rows", () => {
    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    expect(infoRows).toHaveLength(4);
    expect(infoRows[0]).toMatchObject({
      pkplcId: "GG-1",
      pkplcNm: "율전 공영주차장",
      latCrdn: "37.3001",
      lonCrdn: "127.0101",
      pklotCnt: "100",
      parkingBscTime: "30",
      parkingBscFare: "1000",
    });

    const availabilityRows = parseGyeonggiParkingXml(availabilityXml, "AVAILABILITY");
    expect(availabilityRows).toHaveLength(3);
    expect(availabilityRows[0]).toMatchObject({ pkplcId: "GG-1", avblPklotCnt: "23" });
  });

  it("joins info and availability rows by pkplcId while rejecting invalid lots", () => {
    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    const availabilityRows = parseGyeonggiParkingXml(availabilityXml, "AVAILABILITY");
    const joined = joinGyeonggiParkingRows(infoRows, availabilityRows);

    expect(joined.lots.map((lot) => lot.sourceId)).toEqual(["GG-1", "GG-2"]);
    expect(joined.stats).toEqual({
      infoRows: 4,
      availabilityRows: 3,
      matchedRows: 1,
      rejectedRows: 2,
    });

    expect(joined.lots[0]).toMatchObject({
      source: "GYEONGGI_GITS",
      availableSpaces: 23,
      realtimeSupported: true,
      realtimeUpdatedAt: expect.stringMatching(/^2026-08-31T01:15:00/),
      feeRule: { isFree: false, baseMinutes: 30, baseFee: 1000 },
      address: "경기도 수원시 장안구 율전로 1",
    });
    expect(joined.lots[0]?.id).toBe("gyeonggi-GG-1");
    expect(joined.lots[0]?.latitude).toBe(37.3001);
    expect(joined.lots[0]?.longitude).toBe(127.0101);
    expect(joined.lots[0]?.capacity).toBe(100);
    expect(joined.lots[0]?.feeRule).toMatchObject({
      isFree: false,
      baseMinutes: 30,
      baseFee: 1000,
      additionalMinutes: 10,
      additionalFee: 500,
      dailyMaximumFee: 12000,
    });

    expect(joined.lots[1]).toMatchObject({
      source: "GYEONGGI_GITS",
      availableSpaces: null,
      realtimeSupported: false,
      feeRule: { isFree: true },
    });
    expect(joined.lots[1]?.realtimeUpdatedAt).toBeNull();
  });

  it("clamps available spaces to capacity and falls back when availability is invalid", () => {
    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    const customAvailability = [
      { pkplcId: "GG-1", avblPklotCnt: "999", ocrnDt: "2026-08-31 10:15:00" },
      { pkplcId: "GG-2", avblPklotCnt: "not-a-number", ocrnDt: "2026-08-31 10:15:00" },
    ];
    const joined = joinGyeonggiParkingRows(infoRows, customAvailability);
    expect(joined.lots[0]?.availableSpaces).toBe(100);
    expect(joined.lots[0]?.realtimeSupported).toBe(true);
    expect(joined.lots[1]?.availableSpaces).toBeNull();
    expect(joined.lots[1]?.realtimeSupported).toBe(false);
  });

  it("rejects non-zero header codes, structurally malformed XML, and out-of-range coordinates", () => {
    const badHeader = infoXml.replace("<headerCd>0</headerCd>", "<headerCd>7</headerCd>");
    expect(() => parseGyeonggiParkingXml(badHeader, "INFO")).toThrow(/header/);

    const malformed = "<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody></ServiceResult>";
    expect(() => parseGyeonggiParkingXml(malformed, "INFO")).toThrow();

    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    const joined = joinGyeonggiParkingRows(infoRows, []);
    expect(joined.lots.find((lot) => lot.sourceId === "GG-OOR")).toBeUndefined();
    expect(joined.stats.rejectedRows).toBe(2);
  });

  it("decodes the five standard XML entities inside field values", () => {
    const encoded = `<?xml version="1.0" encoding="UTF-8"?>
<ServiceResult>
  <msgHeader><headerCd>0</headerCd><headerMsg>정상</headerMsg><itemCount>1</itemCount></msgHeader>
  <msgBody>
    <body>
      <pkplcId>GG-ENTITY</pkplcId>
      <pkplcNm>Foo &amp; Bar &lt;Limited&gt; &quot;Seoul&quot; &apos;North&apos;</pkplcNm>
      <latCrdn>37.4</latCrdn>
      <lonCrdn>127.0</lonCrdn>
      <pklotCnt>20</pklotCnt>
    </body>
  </msgBody>
</ServiceResult>`;
    const rows = parseGyeonggiParkingXml(encoded, "INFO");
    expect(rows[0]?.pkplcNm).toBe("Foo & Bar <Limited> \"Seoul\" 'North'");
  });

  it("ignores availability rows whose pkplcId is missing or duplicates an existing one", () => {
    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    const availability = [
      { pkplcId: "", avblPklotCnt: "10", ocrnDt: "2026-08-31 10:15:00" },
      { pkplcId: "GG-1", avblPklotCnt: "7", ocrnDt: "2026-08-31 10:15:00" },
      { pkplcId: "GG-1", avblPklotCnt: "8", ocrnDt: "2026-08-31 10:15:00" },
    ];
    const joined = joinGyeonggiParkingRows(infoRows, availability);
    expect(joined.lots[0]?.availableSpaces).toBe(7);
    expect(joined.stats.matchedRows).toBe(1);
  });
});

describe("Gyeonggi parking client", () => {
  it("passes serviceKey through URLSearchParams to both endpoints, runs concurrently, caches, and coalesces in-flight requests", async () => {
    let now = 1_700_000_000_000;
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const signal = init?.signal as AbortSignal | undefined;
      const parsed = new URL(url);
      expect(parsed.searchParams.get("serviceKey")).toBe("server-only-key");
      expect(parsed.hostname).toBe("openapigits.gg.go.kr");
      expect(parsed.protocol).toBe("https:");
      if (signal) {
        // Ensure timeout configured via AbortSignal
        expect(signal.aborted).toBe(false);
      }
      if (parsed.pathname.endsWith("getParkingPlaceInfoList")) {
        return new Response(infoXml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (parsed.pathname.endsWith("getParkingPlaceAvailabilityInfoList")) {
        return new Response(availabilityXml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    const client = createGyeonggiParkingClient({ fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });

    const [a, b, c] = await Promise.all([
      client.fetchParkingLots("server-only-key"),
      client.fetchParkingLots("server-only-key"),
      client.fetchParkingLots("server-only-key"),
    ]);

    expect(a.lots).toHaveLength(2);
    expect(a.lots.map((lot) => lot.sourceId)).toEqual(["GG-1", "GG-2"]);
    expect(a.lots.every((lot) => lot.source === "GYEONGGI_GITS")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a.notice).toContain("경기도");
    expect(a.notice).not.toContain("server-only-key");

    now += 30_000;
    const cached = await client.fetchParkingLots("server-only-key");
    expect(cached).toBe(a);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    now += 61_000;
    const refreshed = await client.fetchParkingLots("server-only-key");
    expect(refreshed).not.toBe(a);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("rejects non-zero provider response codes without caching and never includes the key in the notice", async () => {
    let now = 1_700_000_000_000;
    const errorXml = infoXml.replace("<headerCd>0</headerCd>", "<headerCd>7</headerCd>");
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("getParkingPlaceInfoList")) {
        return new Response(errorXml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      return new Response(availabilityXml, { status: 200, headers: { "content-type": "application/xml" } });
    });
    const client = createGyeonggiParkingClient({ fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });

    await expect(client.fetchParkingLots("server-only-key")).rejects.toThrow(/header/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const callsBeforeRetry = fetchImpl.mock.calls.length;
    await expect(client.fetchParkingLots("server-only-key")).rejects.toThrow(/header/);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it("rejects when the key is empty before issuing network requests", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));
    const client = createGyeonggiParkingClient({ fetchImpl: fetchImpl as unknown as typeof fetch, now: () => 1 });
    await expect(client.fetchParkingLots("   ")).rejects.toThrow(/key/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back through fetchGyeonggiParkingLots using the configured env key without exposing it", async () => {
    const originalKey = process.env.GYEONGGI_GITS_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.GYEONGGI_GITS_API_KEY = "env-only-key";
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const parsed = new URL(url);
      expect(parsed.searchParams.get("serviceKey")).toBe("env-only-key");
      if (parsed.pathname.endsWith("getParkingPlaceInfoList")) {
        return new Response(infoXml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      return new Response(availabilityXml, { status: 200, headers: { "content-type": "application/xml" } });
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      vi.resetModules();
      const mod = await import("@/lib/api/gyeonggi-parking");
      const result = await mod.fetchGyeonggiParkingLots();
      expect(result.lots).toHaveLength(2);
      expect(result.notice).not.toContain("env-only-key");
      expect(result.lots.every((lot) => lot.source === "GYEONGGI_GITS")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GYEONGGI_GITS_API_KEY;
      else process.env.GYEONGGI_GITS_API_KEY = originalKey;
    }
  });

  it("rejects before network access when the env key is missing", async () => {
    const originalKey = process.env.GYEONGGI_GITS_API_KEY;
    delete process.env.GYEONGGI_GITS_API_KEY;
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      vi.resetModules();
      const mod = await import("@/lib/api/gyeonggi-parking");
      await expect(mod.fetchGyeonggiParkingLots()).rejects.toThrow(/GYEONGGI_GITS_API_KEY/);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey !== undefined) process.env.GYEONGGI_GITS_API_KEY = originalKey;
    }
  });
});
