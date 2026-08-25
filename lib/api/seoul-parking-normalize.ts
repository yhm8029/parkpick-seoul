import type { Coordinate, ParkingLot } from "@/lib/types";
import { numberFrom, parseSeoulDate } from "@/lib/utils";

export type SeoulRow = Record<string, unknown>;

export interface SeoulJoinResult {
  lots: ParkingLot[];
  stats: { liveRows: number; matchedRows: number; rejectedRows: number };
}

interface StaticCoordinate extends Coordinate {
  pkltCd: string;
}

const SEOUL_LAT_MIN = 37;
const SEOUL_LAT_MAX = 38;
const SEOUL_LNG_MIN = 126;
const SEOUL_LNG_MAX = 128;
const PAGE_SIZE = 1_000;

function firstField(row: SeoulRow, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function text(row: SeoulRow, keys: string[]): string {
  const value = firstField(row, keys);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numeric(row: SeoulRow, keys: string[]): number | null {
  return numberFrom(firstField(row, keys));
}

function isFiniteSeoulCoordinate(value: { latitude: number; longitude: number }): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= SEOUL_LAT_MIN &&
    value.latitude <= SEOUL_LAT_MAX &&
    value.longitude >= SEOUL_LNG_MIN &&
    value.longitude <= SEOUL_LNG_MAX
  );
}

function buildStaticIndex(staticRows: SeoulRow[]): Map<string, StaticCoordinate> {
  const grouped = new Map<string, StaticCoordinate[]>();
  for (const row of staticRows) {
    const code = text(row, ["PKLT_CD"]);
    if (!code) continue;
    const latitude = numeric(row, ["LAT"]);
    const longitude = numeric(row, ["LOT"]);
    if (latitude === null || longitude === null) continue;
    const coordinate = { pkltCd: code, latitude, longitude };
    if (!isFiniteSeoulCoordinate(coordinate)) continue;
    const bucket = grouped.get(code);
    if (bucket) bucket.push(coordinate);
    else grouped.set(code, [coordinate]);
  }
  const resolved = new Map<string, StaticCoordinate>();
  for (const [code, candidates] of grouped) {
    candidates.sort((a, b) => a.latitude - b.latitude || a.longitude - b.longitude);
    const [winner] = candidates;
    if (winner) resolved.set(code, winner);
  }
  return resolved;
}

export function joinSeoulParkingRows(realtimeRows: SeoulRow[], staticRows: SeoulRow[]): SeoulJoinResult {
  const staticIndex = buildStaticIndex(staticRows);
  const realtimeCodeCounts = new Map<string, number>();
  for (const row of realtimeRows) {
    const code = text(row, ["PKLT_CD"]);
    if (code) realtimeCodeCounts.set(code, (realtimeCodeCounts.get(code) ?? 0) + 1);
  }
  const lots: ParkingLot[] = [];
  let matchedRows = 0;
  for (const row of realtimeRows) {
    const sourceId = text(row, ["PKLT_CD"]);
    if (!sourceId) continue;
    if (realtimeCodeCounts.get(sourceId) !== 1) continue;
    const coordinate = staticIndex.get(sourceId);
    if (!coordinate) continue;
    const capacity = numeric(row, ["TPKCT"]);
    if (capacity === null || capacity <= 0) continue;
    matchedRows += 1;
    const occupied = numeric(row, ["NOW_PRK_VHCL_CNT", "CUR_PARKING"]);
    const pay = text(row, ["PAY_YN", "PAY_YN_NM"]);
    const isFree = pay.includes("무료") || pay === "N" || pay === "0";
    const realtimeStatus = text(row, ["PRK_STTS_YN"]);
    lots.push({
      id: `seoul-${sourceId}`,
      sourceId,
      source: "SEOUL_OPEN_DATA",
      name: text(row, ["PKLT_NM"]) || "공영주차장",
      address: text(row, ["ADDR"]) || "주소 정보 없음",
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      capacity,
      occupiedSpaces: occupied,
      availableSpaces: occupied === null ? null : Math.max(0, capacity - occupied),
      realtimeUpdatedAt: parseSeoulDate(firstField(row, ["NOW_PRK_VHCL_UPDT_TM", "CUR_PARKING_TIME"])),
      realtimeSupported: realtimeStatus === "1" && occupied !== null,
      feeRule: {
        isFree,
        baseMinutes: numeric(row, ["BSC_PRK_HR", "TIME_RATE"]),
        baseFee: numeric(row, ["BSC_PRK_CRG", "RATES"]),
        additionalMinutes: numeric(row, ["ADD_PRK_HR", "ADD_TIME_RATE"]),
        additionalFee: numeric(row, ["ADD_PRK_CRG", "ADD_RATES"]),
        dailyMaximumFee: numeric(row, ["DAY_MAX_CRG", "DLY_MAX_CRG", "DAY_MAXIMUM"]),
      },
      phone: text(row, ["TELNO"]) || null,
      operatingLabel: text(row, ["OPER_SE_NM"]) || null,
      isOpen: null,
    });
  }
  lots.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const liveRows = realtimeRows.length;
  const rejectedRows = Math.max(0, liveRows - matchedRows);
  return { lots, stats: { liveRows, matchedRows, rejectedRows } };
}

export const SEOUL_PARKING_PAGE_SIZE = PAGE_SIZE;
