import { searchNaverAddresses } from "@/lib/api/naver-geocode";
import { DEMO_PLACES } from "@/lib/mock";
import type { Place } from "@/lib/types";

function demoSearch(query: string): Place[] {
  const normalized = query.replace(/\s/g, "").toLowerCase();
  return DEMO_PLACES.filter((place) =>
    `${place.name}${place.address}${place.category ?? ""}`.replace(/\s/g, "").toLowerCase().includes(normalized),
  ).slice(0, 8);
}

export async function searchPlaces(query: string): Promise<{
  places: Place[];
  mode: "LIVE" | "DEMO";
  notice: string;
}> {
  const keyId = process.env.NAVER_MAP_NCP_KEY_ID;
  const clientSecret = process.env.NAVER_MAP_NCP_CLIENT_SECRET;
  if (keyId && clientSecret) {
    try {
      const places = await searchNaverAddresses(query.slice(0, 80), { keyId, clientSecret });
      if (places.length) return { places, mode: "LIVE", notice: "네이버 주소검색 결과입니다." };
    } catch {
      // Fall through to curated examples without exposing provider details.
    }
  }
  return {
    places: demoSearch(query),
    mode: "DEMO",
    notice: "네이버 주소검색 결과가 없어 예시 장소를 표시합니다.",
  };
}
