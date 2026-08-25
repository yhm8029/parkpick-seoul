import type { Place } from "@/lib/types";

interface NcpAddress {
  x?: string;
  y?: string;
  roadAddress?: string;
  jibunAddress?: string;
}

interface NcpResponse {
  status?: string;
  addresses?: NcpAddress[];
}

const NCP_GEOCODE_ENDPOINT = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const NCP_TIMEOUT_MS = 5_000;

export async function searchNaverAddresses(
  query: string,
  credentials: { keyId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Place[]> {
  const url = new URL(NCP_GEOCODE_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("count", "8");

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "x-ncp-apigw-api-key-id": credentials.keyId,
      "x-ncp-apigw-api-key": credentials.clientSecret,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(NCP_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Naver NCP geocoding ${response.status}`);
  }

  const body = (await response.json()) as NcpResponse;
  if (body.status !== "OK") {
    throw new Error(`Naver NCP geocoding status: ${body.status ?? "UNKNOWN"}`);
  }

  const addresses = body.addresses ?? [];
  const places: Place[] = [];
  for (const item of addresses) {
    if (!item.x || !item.y) continue;
    const longitude = Number(item.x);
    const latitude = Number(item.y);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const address = item.roadAddress || item.jibunAddress || "주소 정보 없음";
    places.push({
      id: `naver-${longitude}-${latitude}`,
      name: address,
      address,
      latitude,
      longitude,
      source: "NAVER",
    });
  }
  return places;
}
