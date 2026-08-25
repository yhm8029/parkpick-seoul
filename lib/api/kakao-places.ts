import { DEMO_PLACES } from "@/lib/mock";
import type { Place } from "@/lib/types";
import { searchNaverAddresses } from "@/lib/api/naver-geocode";

interface KakaoDocument {
  id?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  category_group_name?: string;
  x?: string;
  y?: string;
}

function demoSearch(query: string): Place[] {
  const normalized = query.replace(/\s/g, "").toLowerCase();
  return DEMO_PLACES.filter(place => `${place.name}${place.address}${place.category ?? ""}`.replace(/\s/g, "").toLowerCase().includes(normalized)).slice(0, 8);
}

async function tryNaverFallback(query: string): Promise<Place[] | null> {
  const keyId = process.env.NAVER_MAP_NCP_KEY_ID;
  const clientSecret = process.env.NAVER_MAP_NCP_CLIENT_SECRET;
  if (!keyId || !clientSecret) return null;
  try {
    const places = await searchNaverAddresses(query, { keyId, clientSecret });
    return places.length > 0 ? places : null;
  } catch (error) {
    console.error("naver geocoding fallback", error);
    return null;
  }
}

export async function searchPlaces(query: string): Promise<{ places: Place[]; mode: "LIVE" | "DEMO"; notice: string }> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    const naverPlaces = await tryNaverFallback(query);
    if (naverPlaces) return { places: naverPlaces, mode: "LIVE", notice: "네이버 주소검색 결과입니다." };
    return { places: demoSearch(query), mode: "DEMO", notice: "카카오 키가 없어 예시 장소를 표시합니다." };
  }
  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", query.slice(0, 80));
    url.searchParams.set("size", "8");
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Kakao place search ${response.status}`);
    const body = await response.json() as { documents?: KakaoDocument[] };
    const places = (body.documents ?? []).map((document): Place | null => {
      const latitude = Number(document.y); const longitude = Number(document.x);
      if (!document.place_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const place: Place = { id: `kakao-${document.id ?? `${longitude}-${latitude}`}`, name: document.place_name, address: document.road_address_name || document.address_name || "주소 정보 없음", latitude, longitude, source: "KAKAO" };
      if (document.category_group_name) place.category = document.category_group_name;
      return place;
    }).filter((place): place is Place => place !== null);
    if (places.length === 0) {
      const naverPlaces = await tryNaverFallback(query);
      if (naverPlaces) return { places: naverPlaces, mode: "LIVE", notice: "네이버 주소검색 결과입니다." };
      return { places: demoSearch(query), mode: "DEMO", notice: "실시간 검색 결과가 없어 예시 장소를 표시합니다." };
    }
    return { places, mode: "LIVE", notice: "카카오 장소검색 결과입니다." };
  } catch (error) {
    console.error("place search fallback", error);
    const naverPlaces = await tryNaverFallback(query);
    if (naverPlaces) return { places: naverPlaces, mode: "LIVE", notice: "네이버 주소검색 결과입니다." };
    return { places: demoSearch(query), mode: "DEMO", notice: "장소검색 연결 실패로 예시 장소를 표시합니다." };
  }
}
