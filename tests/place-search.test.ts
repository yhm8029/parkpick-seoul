import { describe, expect, it, vi } from "vitest";
import { searchNaverAddresses } from "@/lib/api/naver-geocode";
import { searchPlaces } from "@/lib/api/naver-place-search";

describe("Naver NCP geocoding adapter", () => {
  it("normalizes longitude from x and latitude from y and keeps the client secret in headers only", async () => {
    const credentials = { keyId: "test-key-id", clientSecret: "test-secret-value" };
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
      expect(url).toContain("query=%EC%BD%94%EC%97%91%EC%8A%A4");
      expect(url).toContain("count=8");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-ncp-apigw-api-key-id")).toBe("test-key-id");
      expect(headers.get("x-ncp-apigw-api-key")).toBe("test-secret-value");
      expect(headers.get("Accept")).toBe("application/json");
      expect(init?.cache).toBe("no-store");
      return new Response(
        JSON.stringify({
          status: "OK",
          addresses: [
            {
              x: "127.0592",
              y: "37.5117",
              roadAddress: "서울 강남구 영동대로 513",
              jibunAddress: "서울 강남구 삼성동 159",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const places = await searchNaverAddresses("코엑스", credentials, fetchMock as unknown as typeof fetch);
    expect(places).toHaveLength(1);
    expect(places[0]).toEqual({
      id: "naver-127.0592-37.5117",
      name: "서울 강남구 영동대로 513",
      address: "서울 강남구 영동대로 513",
      latitude: 37.5117,
      longitude: 127.0592,
      category: undefined,
      source: "NAVER",
    });
  });

  it("rejects when the NCP Geocoding endpoint returns 403 so the caller can fall back safely", async () => {
    const credentials = { keyId: "test-key-id", clientSecret: "test-secret-value" };
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    await expect(
      searchNaverAddresses("코엑스", credentials, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/403/);
  });

  it("uses NAVER geocoding and never calls Kakao place search", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "dormant-kakao-key");
    vi.stubEnv("NAVER_MAP_NCP_KEY_ID", "naver-id");
    vi.stubEnv("NAVER_MAP_NCP_CLIENT_SECRET", "naver-secret");
    const fetchSpy = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({
      status: "OK",
      addresses: [{ x: "127.0592", y: "37.5117", roadAddress: "서울 강남구 영동대로 513" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);
    try {
      const result = await searchPlaces("코엑스");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("maps.apigw.ntruss.com/map-geocode");
      expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain("dapi.kakao.com");
      expect(result.mode).toBe("LIVE");
      expect(result.places[0]?.source).toBe("NAVER");
      expect(result.notice).toContain("네이버");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
