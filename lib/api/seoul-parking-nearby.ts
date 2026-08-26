import type { Coordinate, ParkingLot, PublicParkingType } from "@/lib/types";
import { numberFrom, parseSeoulDate } from "@/lib/utils";

export interface NearbyParkingClient {
  fetchNearby(
    destination: Coordinate,
    rangeMeters: number,
  ): Promise<{ lots: ParkingLot[]; notice: string }>;
}

export interface NearbyParkingClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const SEOUL_NEARBY_ENDPOINT = "https://parking.seoul.go.kr/SearchParking.do";
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 2 * 60_000;
const CACHE_MAX_ENTRIES = 128;
const CACHE_SCHEMA_VERSION = "seoul-parking-nearby.v1";
const REALTIME_MAX_AGE_MS = 30 * 60_000;
const SEOUL_LAT_MIN = 37;
const SEOUL_LAT_MAX = 38;
const SEOUL_LNG_MIN = 126;
const SEOUL_LNG_MAX = 128;
const ALLOWED_PUBLIC_TYPES = new Set<PublicParkingType>(["NW", "NS", "BP"]);

type ParkingRow = Record<string, unknown>;

function text(row: ParkingRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numeric(row: ParkingRow, key: string): number | null {
  return numberFrom(row[key]);
}

function isPublicParkingType(value: string): value is PublicParkingType {
  return ALLOWED_PUBLIC_TYPES.has(value as PublicParkingType);
}

function normalizeRange(rangeMeters: number): number {
  if (!Number.isFinite(rangeMeters)) return 1_000;
  const clamped = Math.min(Math.max(Math.trunc(rangeMeters), 1), 1_000);
  return clamped;
}

function isSeoulCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= SEOUL_LAT_MIN &&
    latitude <= SEOUL_LAT_MAX &&
    longitude >= SEOUL_LNG_MIN &&
    longitude <= SEOUL_LNG_MAX
  );
}

function pickCoordinate(row: ParkingRow): { latitude: number; longitude: number } | null {
  const positions = row.position_list;
  if (!Array.isArray(positions)) return null;
  for (const entry of positions) {
    if (!entry || typeof entry !== "object") continue;
    const latitude = numberFrom((entry as ParkingRow).lat);
    const longitude = numberFrom((entry as ParkingRow).lng);
    if (latitude === null || longitude === null) continue;
    if (!isSeoulCoordinate(latitude, longitude)) continue;
    return { latitude, longitude };
  }
  return null;
}

function isTouristBusExclusive(name: string): boolean {
  const normalized = name.replace(/\s/g, "");
  return normalized.includes("관광버스") && normalized.includes("전용");
}

function buildCacheKey(destination: Coordinate, rangeMeters: number): string {
  const latitude = destination.latitude.toFixed(4);
  const longitude = destination.longitude.toFixed(4);
  const range = normalizeRange(rangeMeters);
  return `${CACHE_SCHEMA_VERSION}|${latitude}|${longitude}|${range}`;
}

function buildNotice(lots: ParkingLot[]): string {
  return `서울 주차 포털 응답을 정제한 결과 ${lots.length.toLocaleString("ko-KR")}건의 공영 주차장을 확보했습니다.`;
}

function normalizeRow(row: ParkingRow, nowMs: number): ParkingLot | null {
  const parkingCode = text(row, "parking_code");
  if (!parkingCode) return null;
  const parkingType = text(row, "parking_type");
  if (!isPublicParkingType(parkingType)) return null;
  const coordinate = pickCoordinate(row);
  if (!coordinate) return null;
  const capacity = numeric(row, "capacity");
  if (capacity === null || capacity <= 0) return null;
  const name = text(row, "parking_name");
  if (isTouristBusExclusive(name)) return null;

  const address = text(row, "new_juso") || text(row, "address");
  const queStatus = text(row, "que_status");
  const occupied = numeric(row, "cur_parking");
  const updatedAt = parseSeoulDate(row.cur_parking_time);
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : NaN;
  const freshAge =
    Number.isFinite(updatedAtMs) && updatedAt !== null
      ? nowMs - updatedAtMs
      : Number.POSITIVE_INFINITY;
  const realtimeSupported =
    queStatus === "1" && occupied !== null && freshAge >= 0 && freshAge <= REALTIME_MAX_AGE_MS;

  return {
    id: `seoul-portal-${parkingCode}`,
    sourceId: parkingCode,
    source: "SEOUL_PARKING_PORTAL",
    publicParkingType: parkingType,
    name: name || parkingCode,
    address: address || "주소 정보 없음",
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    capacity,
    occupiedSpaces: realtimeSupported ? occupied : null,
    availableSpaces: realtimeSupported ? Math.max(0, capacity - (occupied ?? 0)) : null,
    realtimeUpdatedAt: realtimeSupported ? updatedAt : null,
    realtimeSupported,
    feeRule: {
      isFree: numeric(row, "rates") === 0,
      baseMinutes: numeric(row, "time_rate"),
      baseFee: numeric(row, "rates"),
      additionalMinutes: numeric(row, "add_time_rate"),
      additionalFee: numeric(row, "add_rates"),
      dailyMaximumFee: numeric(row, "day_maximum"),
    },
    phone: text(row, "phone") || null,
    operatingLabel: null,
    isOpen: null,
  };
}

function parseEnvelope(body: unknown): ParkingRow[] {
  if (!body || typeof body !== "object") {
    throw new Error("Seoul nearby envelope missing");
  }
  const root = body as Record<string, unknown>;
  if (root.result_state !== "0000") {
    throw new Error(`Seoul nearby envelope invalid: result_state=${String(root.result_state)}`);
  }
  const resValue = root.res_value;
  if (!resValue || typeof resValue !== "object") {
    throw new Error("Seoul nearby envelope missing res_value");
  }
  const parkingList = (resValue as Record<string, unknown>).parking_list;
  if (!Array.isArray(parkingList)) {
    throw new Error("Seoul nearby envelope missing parking_list");
  }
  return parkingList as ParkingRow[];
}

async function requestNearbyParking(
  fetchImpl: typeof fetch,
  destination: Coordinate,
  rangeMeters: number,
): Promise<ParkingRow[]> {
  const params = new URLSearchParams({
    LAT: String(destination.latitude),
    LON: String(destination.longitude),
    index: "1",
    range: String(normalizeRange(rangeMeters)),
    Type: "3",
    Rule: "1",
  });
  const response = await fetchImpl(SEOUL_NEARBY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Seoul nearby HTTP ${response.status}`);
  }
  const body = await response.json();
  return parseEnvelope(body);
}

export function createNearbyParkingClient(
  options: NearbyParkingClientOptions = {},
): NearbyParkingClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; value: { lots: ParkingLot[]; notice: string } }>();
  const inFlight = new Map<string, Promise<{ lots: ParkingLot[]; notice: string }>>();

  async function load(
    destination: Coordinate,
    rangeMeters: number,
  ): Promise<{ lots: ParkingLot[]; notice: string }> {
    const rows = await requestNearbyParking(fetchImpl, destination, rangeMeters);
    const seen = new Set<string>();
    const lots: ParkingLot[] = [];
    const nowMs = now();
    for (const row of rows) {
      const parkingCode = text(row, "parking_code");
      if (!parkingCode || seen.has(parkingCode)) continue;
      const lot = normalizeRow(row, nowMs);
      if (!lot) continue;
      seen.add(parkingCode);
      lots.push(lot);
    }
    lots.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
    return { lots, notice: buildNotice(lots) };
  }

  return {
    async fetchNearby(
      destination: Coordinate,
      rangeMeters: number,
    ): Promise<{ lots: ParkingLot[]; notice: string }> {
      purgeExpired();
      const key = buildCacheKey(destination, rangeMeters);
      const cached = cache.get(key);
      if (cached && cached.until > now()) return cached.value;
      const active = inFlight.get(key);
      if (active) return active;
      const request = load(destination, rangeMeters)
        .then((value) => {
          if (cache.size >= CACHE_MAX_ENTRIES) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey !== undefined) cache.delete(oldestKey);
          }
          cache.set(key, { until: now() + CACHE_TTL_MS, value });
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request;
    },
  };

  function purgeExpired(): void {
    const current = now();
    for (const [entryKey, entry] of cache) {
      if (entry.until <= current) cache.delete(entryKey);
    }
  }
}

const defaultClient = createNearbyParkingClient();

export async function fetchNearbySeoulParking(
  destination: Coordinate,
  rangeMeters: number,
): Promise<{ lots: ParkingLot[]; notice: string }> {
  return defaultClient.fetchNearby(destination, rangeMeters);
}
