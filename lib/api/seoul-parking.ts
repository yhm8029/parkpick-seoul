import type { ParkingLot } from "@/lib/types";
import { numberFrom, parseSeoulDate } from "@/lib/utils";

let cache: { until: number; lots: ParkingLot[]; notice: string } | null = null;
const first = (row: Record<string, unknown>, keys: string[]) => keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== "") ?? null;
const text = (row: Record<string, unknown>, keys: string[], fallback = "") => String(first(row, keys) ?? fallback).trim();
const num = (row: Record<string, unknown>, keys: string[]) => numberFrom(first(row, keys));

function normalize(row: Record<string, unknown>, index: number): ParkingLot | null {
  const latitude = num(row, ["LAT", "LATITUDE", "YCODE", "Y"]);
  const longitude = num(row, ["LOT", "LNG", "LONGITUDE", "XCODE", "X"]);
  const capacity = num(row, ["TPKCT", "CAPACITY"]) ?? 0;
  const occupied = num(row, ["NOW_PRK_VHCL_CNT", "CUR_PARKING"]);
  if (latitude === null || longitude === null || capacity <= 0 || latitude < 37 || latitude > 38 || longitude < 126 || longitude > 128) return null;
  const sourceId = text(row, ["PKLT_CD", "PARKING_CODE"], `row-${index}`);
  const pay = text(row, ["PAY_YN", "PAY_YN_NM"]);
  return {
    id: `seoul-${sourceId}`, sourceId, source: "SEOUL_OPEN_DATA", name: text(row, ["PKLT_NM", "PARKING_NAME"], "공영주차장"), address: text(row, ["ADDR", "ADDR_NEW", "ADDRESS"], "주소 정보 없음"), latitude, longitude, capacity,
    occupiedSpaces: occupied, availableSpaces: occupied === null ? null : Math.max(0, capacity - occupied), realtimeUpdatedAt: parseSeoulDate(first(row, ["NOW_PRK_VHCL_UPDT_TM", "CUR_PARKING_TIME"])), realtimeSupported: occupied !== null,
    feeRule: { isFree: pay.includes("무료") || pay === "N" || pay === "0", baseMinutes: num(row, ["BSC_PRK_HR", "TIME_RATE"]), baseFee: num(row, ["BSC_PRK_CRG", "RATES"]), additionalMinutes: num(row, ["ADD_PRK_HR", "ADD_TIME_RATE"]), additionalFee: num(row, ["ADD_PRK_CRG", "ADD_RATES"]), dailyMaximumFee: num(row, ["DLY_MAX_CRG", "DAY_MAXIMUM"]) },
    phone: text(row, ["TELNO", "TEL"]) || null, operatingLabel: text(row, ["OPER_SE_NM"]) || null, isOpen: true
  };
}

async function page(key: string, start: number, end: number) {
  const response = await fetch(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/GetParkingInfo/${start}/${end}/`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Seoul API ${response.status}`);
  const body = await response.json() as { GetParkingInfo?: { list_total_count?: number; row?: Array<Record<string, unknown>>; RESULT?: { CODE?: string; MESSAGE?: string } } };
  if (!body.GetParkingInfo) throw new Error("Unexpected Seoul API response");
  if (body.GetParkingInfo.RESULT?.CODE && body.GetParkingInfo.RESULT.CODE !== "INFO-000") throw new Error(body.GetParkingInfo.RESULT.MESSAGE || body.GetParkingInfo.RESULT.CODE);
  return body.GetParkingInfo;
}

export async function fetchSeoulParkingLots(): Promise<{ lots: ParkingLot[]; notice: string }> {
  if (cache && cache.until > Date.now()) return { lots: cache.lots, notice: cache.notice };
  const key = process.env.SEOUL_OPEN_API_KEY;
  if (!key) throw new Error("SEOUL_OPEN_API_KEY missing");
  const firstPage = await page(key, 1, 1_000);
  const rows = [...(firstPage.row ?? [])];
  const total = Math.min(firstPage.list_total_count ?? rows.length, 5_000);
  for (let start = 1_001; start <= total; start += 1_000) rows.push(...((await page(key, start, Math.min(start + 999, total))).row ?? []));
  const lots = rows.map(normalize).filter((lot): lot is ParkingLot => lot !== null);
  if (!lots.length) throw new Error("No valid parking rows");
  const notice = `서울시 주차정보 ${lots.length.toLocaleString("ko-KR")}곳의 최신 수집값입니다. 현장보다 지연될 수 있습니다.`;
  cache = { until: Date.now() + 4 * 60_000, lots, notice };
  return { lots, notice };
}
