import { describe, expect, it, vi } from "vitest";
import { searchNaverLocalPlaces } from "@/lib/api/naver-local-search";

describe("NAVER API HUB local search", () => {
  it("authenticates with API HUB headers and normalizes actual places", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://naverapihub.apigw.ntruss.com/search/v1/local");
      expect(url.searchParams.get("query")).toBe("홍대입구역");
      expect(url.searchParams.get("display")).toBe("5");
      expect(url.searchParams.get("start")).toBe("1");
      expect(url.searchParams.get("sort")).toBe("random");
      expect(url.searchParams.get("format")).toBe("json");

      const headers = new Headers(init?.headers);
      expect(headers.get("X-NCP-APIGW-API-KEY-ID")).toBe("hub-id");
      expect(headers.get("X-NCP-APIGW-API-KEY")).toBe("hub-secret");
      expect(init?.cache).toBe("no-store");

      return new Response(JSON.stringify({
        items: [
          {
            title: "<b>홍대입구역</b> 공항철도",
            category: "교통,운수&gt;지하철,전철",
            address: "서울특별시 마포구 동교동 190-1",
            roadAddress: "서울특별시 마포구 와우산로37길 35",
            mapx: "1269265991",
            mapy: "375577188",
          },
          { title: "좌표 없음", address: "서울특별시 마포구", mapx: "invalid", mapy: "3755" },
        ],
      }), { status: 200 });
    });

    const places = await searchNaverLocalPlaces(
      "홍대입구역",
      { keyId: "hub-id", apiKey: "hub-secret" },
      fetchMock as unknown as typeof fetch,
    );

    expect(places).toEqual([{
      id: "naver-local-1269265991-375577188",
      name: "홍대입구역 공항철도",
      address: "서울특별시 마포구 와우산로37길 35",
      latitude: 37.5577188,
      longitude: 126.9265991,
      category: "교통,운수>지하철,전철",
      source: "NAVER",
    }]);
  });
});
