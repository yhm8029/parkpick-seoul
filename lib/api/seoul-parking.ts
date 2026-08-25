import type { ParkingLot } from "@/lib/types";
import { joinSeoulParkingRows, type SeoulJoinResult, type SeoulRow, SEOUL_PARKING_PAGE_SIZE } from "@/lib/api/seoul-parking-normalize";

type SeoulService = "GetParkInfo" | "GetParkingInfo";
type SeoulPayload = {
  list_total_count?: number;
  row?: SeoulRow[];
  RESULT?: { CODE?: string; MESSAGE?: string };
};

type ValidatedSeoulPayload = {
  list_total_count: number;
  row: SeoulRow[];
  RESULT: { CODE: "INFO-000"; MESSAGE?: string };
};

export interface SeoulParkingClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface SeoulParkingFetchResult {
  lots: ParkingLot[];
  notice: string;
  stats: SeoulJoinResult["stats"];
}

const CACHE_TTL_MS = 4 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MIN_JOINED_ROWS = 3;
const SEOUL_OPEN_API_BASE = "http://openapi.seoul.go.kr:8088";

function readPayload(body: unknown, service: SeoulService): ValidatedSeoulPayload {
  if (!body || typeof body !== "object") throw new Error(`Seoul API ${service} root missing`);
  const root = (body as Record<string, unknown>)[service];
  if (!root || typeof root !== "object") throw new Error(`Seoul API ${service} root missing`);
  const payload = root as SeoulPayload;
  const code = payload.RESULT?.CODE;
  if (code !== "INFO-000") throw new Error(`Seoul API ${service} error: ${payload.RESULT?.MESSAGE ?? code ?? "missing result code"}`);
  if (!Array.isArray(payload.row)) throw new Error(`Seoul API ${service} row missing`);
  const total = payload.list_total_count;
  if (!Number.isSafeInteger(total) || (total as number) < 0) throw new Error(`Seoul API ${service} total invalid`);
  return { list_total_count: total as number, row: payload.row, RESULT: { CODE: "INFO-000", MESSAGE: payload.RESULT?.MESSAGE } };
}

function buildServiceUrl(key: string, service: SeoulService, start: number, end: number): string {
  return `${SEOUL_OPEN_API_BASE}/${encodeURIComponent(key)}/json/${service}/${start}/${end}/`;
}

async function fetchSinglePage(fetchImpl: typeof fetch, key: string, service: SeoulService, collected: SeoulRow[], start: number, end: number): Promise<number> {
  const response = await fetchImpl(buildServiceUrl(key, service, start, end), {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Seoul API ${service} HTTP ${response.status}`);
  const body = await response.json();
  const payload = readPayload(body, service);
  for (const row of payload.row) collected.push(row);
  return payload.list_total_count;
}

async function fetchService(fetchImpl: typeof fetch, key: string, service: SeoulService): Promise<SeoulRow[]> {
  const collected: SeoulRow[] = [];
  const total = await fetchSinglePage(fetchImpl, key, service, collected, 1, SEOUL_PARKING_PAGE_SIZE);
  for (let start = SEOUL_PARKING_PAGE_SIZE + 1; start <= total; start += SEOUL_PARKING_PAGE_SIZE) {
    const end = Math.min(start + SEOUL_PARKING_PAGE_SIZE - 1, total);
    const pageTotal = await fetchSinglePage(fetchImpl, key, service, collected, start, end);
    if (pageTotal !== total) throw new Error(`Seoul API ${service} total changed during paging`);
  }
  if (collected.length !== total) throw new Error(`Seoul API ${service} partial page set: expected ${total}, received ${collected.length}`);
  return collected;
}

function buildNotice(joined: number, stats: SeoulJoinResult["stats"]): string {
  return `서울시 실시간 점유 정보와 정적 좌표를 결합한 ${joined.toLocaleString("ko-KR")}건입니다. (결합 ${stats.matchedRows}건 / 제외 ${stats.rejectedRows}건)`;
}

export interface SeoulParkingClient {
  fetchParkingLots(key: string): Promise<SeoulParkingFetchResult>;
}

export function createSeoulParkingClient(options: SeoulParkingClientOptions = {}): SeoulParkingClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; value: SeoulParkingFetchResult }>();
  const inFlight = new Map<string, Promise<SeoulParkingFetchResult>>();

  async function load(key: string): Promise<SeoulParkingFetchResult> {
    const [staticRows, realtimeRows] = await Promise.all([
      fetchService(fetchImpl, key, "GetParkInfo"),
      fetchService(fetchImpl, key, "GetParkingInfo"),
    ]);
    const joined = joinSeoulParkingRows(realtimeRows, staticRows);
    if (joined.lots.length < MIN_JOINED_ROWS) {
      throw new Error(
        `Seoul join below threshold: ${joined.lots.length} joined rows (${JSON.stringify(joined.stats)})`,
      );
    }
    return { lots: joined.lots, notice: buildNotice(joined.lots.length, joined.stats), stats: joined.stats };
  }

  return {
    async fetchParkingLots(key: string): Promise<SeoulParkingFetchResult> {
      const normalizedKey = key.trim();
      if (!normalizedKey) throw new Error("Seoul API key missing");
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

const defaultClient = createSeoulParkingClient();

export async function fetchSeoulParkingLots(): Promise<{ lots: ParkingLot[]; notice: string }> {
  const key = process.env.SEOUL_OPEN_API_KEY;
  if (!key) throw new Error("SEOUL_OPEN_API_KEY missing");
  const result = await defaultClient.fetchParkingLots(key);
  return { lots: result.lots, notice: result.notice };
}
