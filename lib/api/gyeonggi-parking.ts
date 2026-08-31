import type { ParkingLot } from "@/lib/types";
import {
  joinGyeonggiParkingRows,
  parseGyeonggiParkingXml,
  type GyeonggiJoinResult,
  type GyeonggiService,
} from "@/lib/api/gyeonggi-parking-normalize";

export interface GyeonggiParkingClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface GyeonggiParkingFetchResult {
  lots: ParkingLot[];
  notice: string;
  stats: GyeonggiJoinResult["stats"];
}

export interface GyeonggiParkingClient {
  fetchParkingLots(key: string): Promise<GyeonggiParkingFetchResult>;
}

const INFO_URL = "https://openapigits.gg.go.kr/api/rest/getParkingPlaceInfoList";
const AVAILABILITY_URL =
  "https://openapigits.gg.go.kr/api/rest/getParkingPlaceAvailabilityInfoList";
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

function buildServiceUrl(endpoint: string, key: string): string {
  const params = new URLSearchParams({ serviceKey: key });
  return `${endpoint}?${params.toString()}`;
}

async function fetchServiceXml(
  fetchImpl: typeof fetch,
  endpoint: string,
  key: string,
  service: GyeonggiService,
): Promise<string> {
  const response = await fetchImpl(buildServiceUrl(endpoint, key), {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: "application/xml, text/xml" },
  });
  if (!response.ok) {
    throw new Error(`Gyeonggi GITS HTTP ${response.status} (${service})`);
  }
  return response.text();
}

function buildNotice(joined: number, stats: GyeonggiJoinResult["stats"]): string {
  return `경기도 교통정보센터 기본·실시간 정보를 결합해 ${joined.toLocaleString("ko-KR")}곳의 경기도 공영주차장을 추천에 포함했습니다. (기본 ${stats.infoRows.toLocaleString("ko-KR")} / 실시간 ${stats.availabilityRows.toLocaleString("ko-KR")} / 실시간 매칭 ${stats.matchedRows.toLocaleString("ko-KR")} / 제외 ${stats.rejectedRows.toLocaleString("ko-KR")})`;
}

export function createGyeonggiParkingClient(
  options: GyeonggiParkingClientOptions = {},
): GyeonggiParkingClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; value: GyeonggiParkingFetchResult }>();
  const inFlight = new Map<string, Promise<GyeonggiParkingFetchResult>>();

  async function load(key: string): Promise<GyeonggiParkingFetchResult> {
    const [infoXml, availabilityXml] = await Promise.all([
      fetchServiceXml(fetchImpl, INFO_URL, key, "INFO"),
      fetchServiceXml(fetchImpl, AVAILABILITY_URL, key, "AVAILABILITY"),
    ]);
    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    const availabilityRows = parseGyeonggiParkingXml(availabilityXml, "AVAILABILITY");
    const joined = joinGyeonggiParkingRows(infoRows, availabilityRows);
    return {
      lots: joined.lots,
      notice: buildNotice(joined.lots.length, joined.stats),
      stats: joined.stats,
    };
  }

  return {
    async fetchParkingLots(key: string): Promise<GyeonggiParkingFetchResult> {
      const normalizedKey = key.trim();
      if (!normalizedKey) throw new Error("GYEONGGI_GITS_API_KEY missing");

      const cached = cache.get(normalizedKey);
      if (cached && cached.until > now()) return cached.value;

      const active = inFlight.get(normalizedKey);
      if (active) return active;

      const request = load(normalizedKey)
        .then((value) => {
          cache.set(normalizedKey, { until: now() + CACHE_TTL_MS, value });
          return value;
        })
        .finally(() => {
          inFlight.delete(normalizedKey);
        });
      inFlight.set(normalizedKey, request);
      return request;
    },
  };
}

const defaultClient = createGyeonggiParkingClient();

export async function fetchGyeonggiParkingLots(): Promise<GyeonggiParkingFetchResult> {
  const key = process.env.GYEONGGI_GITS_API_KEY;
  if (!key) throw new Error("GYEONGGI_GITS_API_KEY missing");
  return defaultClient.fetchParkingLots(key);
}
