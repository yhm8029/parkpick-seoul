import type { Place } from "@/lib/types";

export interface NaverApiHubCredentials {
  keyId: string;
  apiKey: string;
}

interface NaverLocalItem {
  title?: unknown;
  category?: unknown;
  address?: unknown;
  roadAddress?: unknown;
  mapx?: unknown;
  mapy?: unknown;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITY_MAP[entity] ?? entity)
    .trim();
}

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const normalized = Math.abs(raw) > limit ? raw / 10_000_000 : raw;
  return Number.isFinite(normalized) && Math.abs(normalized) <= limit ? normalized : null;
}

export async function searchNaverLocalPlaces(
  query: string,
  credentials: NaverApiHubCredentials,
  fetcher: typeof fetch = fetch,
): Promise<Place[]> {
  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
  url.search = new URLSearchParams({
    query: query.slice(0, 80),
    display: "5",
    start: "1",
    sort: "random",
    format: "json",
  }).toString();

  const response = await fetcher(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": credentials.keyId,
      "X-NCP-APIGW-API-KEY": credentials.apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`NAVER API HUB local search failed (${response.status})`);

  const payload = await response.json() as { items?: unknown };
  if (!Array.isArray(payload.items)) return [];

  return payload.items.flatMap((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") return [];
    const item = rawItem as NaverLocalItem;
    const name = cleanText(item.title);
    const address = cleanText(item.roadAddress) || cleanText(item.address);
    const longitude = coordinate(item.mapx, 180);
    const latitude = coordinate(item.mapy, 90);
    if (!name || !address || longitude == null || latitude == null) return [];

    const rawX = String(item.mapx);
    const rawY = String(item.mapy);
    return [{
      id: `naver-local-${rawX}-${rawY}${index ? `-${index}` : ""}`,
      name,
      address,
      latitude,
      longitude,
      category: cleanText(item.category) || undefined,
      source: "NAVER" as const,
    }];
  });
}
