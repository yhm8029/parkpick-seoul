import type { ParkingLot } from "@/lib/types";
import { numberFrom, parseSeoulDate } from "@/lib/utils";

export type GyeonggiRow = Record<string, string>;
export type GyeonggiService = "INFO" | "AVAILABILITY";

export interface GyeonggiJoinResult {
  lots: ParkingLot[];
  stats: {
    infoRows: number;
    availabilityRows: number;
    matchedRows: number;
    rejectedRows: number;
  };
}

const GYEONGGI_LAT_MIN = 36;
const GYEONGGI_LAT_MAX = 39;
const GYEONGGI_LNG_MIN = 125;
const GYEONGGI_LNG_MAX = 129;
const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
    }
    return XML_ENTITIES[entity] ?? `&${entity};`;
  });
}

function parseBodyFields(body: string): GyeonggiRow {
  const withoutCData = body.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1");
  const row: GyeonggiRow = {};
  const fieldPattern = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>|<([A-Za-z0-9_]+)\s*\/>/gi;
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(withoutCData)) !== null) {
    const name = (match[1] ?? match[3] ?? "").trim();
    if (!name) continue;
    row[name] = decodeXmlEntities((match[2] ?? "").trim());
  }

  return row;
}

function readBodyRegion(xml: string): string {
  const stripped = xml.replace(/^\uFEFF/, "").trim();
  if (!stripped.startsWith("<")) throw new Error("Gyeonggi XML envelope missing");

  const headerBlock = stripped.match(/<msgHeader>([\s\S]*?)<\/msgHeader>/i)?.[1];
  if (!headerBlock) throw new Error("Gyeonggi XML msgHeader missing");

  const code = headerBlock.match(/<headerCd>\s*([^<]*?)\s*<\/headerCd>/i)?.[1]?.trim();
  if (code !== "0") {
    throw new Error(`Gyeonggi XML header rejected (code=${code || "missing"})`);
  }

  const bodyRegion = stripped.match(/<msgBody>([\s\S]*?)<\/msgBody>/i)?.[1];
  if (bodyRegion === undefined) throw new Error("Gyeonggi XML msgBody missing");
  return bodyRegion;
}

export function parseGyeonggiParkingXml(
  xml: string,
  service: GyeonggiService,
): GyeonggiRow[] {
  if (typeof xml !== "string" || !xml.trim()) {
    throw new Error("Gyeonggi XML envelope missing");
  }

  const bodyRegion = readBodyRegion(xml);
  const rows: GyeonggiRow[] = [];
  const bodyPattern = /<body\b[^>]*>([\s\S]*?)<\/body>/gi;
  let bodyMatch: RegExpExecArray | null;

  while ((bodyMatch = bodyPattern.exec(bodyRegion)) !== null) {
    rows.push(parseBodyFields(bodyMatch[1] ?? ""));
  }

  if (rows.length === 0 && service === "INFO") {
    throw new Error("Gyeonggi XML msgBody contains no <body> rows");
  }
  return rows;
}

function isFiniteGyeonggiCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= GYEONGGI_LAT_MIN &&
    latitude <= GYEONGGI_LAT_MAX &&
    longitude >= GYEONGGI_LNG_MIN &&
    longitude <= GYEONGGI_LNG_MAX
  );
}

function firstField(row: GyeonggiRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function numericField(row: GyeonggiRow, keys: string[]): number | null {
  return numberFrom(firstField(row, keys));
}

function formatHhmm(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 4) return value.trim() || null;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function buildOperatingLabel(info: GyeonggiRow): string | null {
  const periods = [
    ["평일", "wkdayOprtStartTime", "wkdayOprtEndTime"],
    ["토요일", "satOprtStartTime", "satOprtEndTime"],
    ["공휴일", "hldyOprtStartTime", "hldyOprtEndTime"],
  ] as const;

  const labels = periods.flatMap(([label, startKey, endKey]) => {
    const start = formatHhmm(firstField(info, [startKey]));
    const end = formatHhmm(firstField(info, [endKey]));
    return start && end ? [`${label} ${start}~${end}`] : [];
  });
  return labels.length > 0 ? labels.join(" / ") : null;
}

export function joinGyeonggiParkingRows(
  infoRows: GyeonggiRow[],
  availabilityRows: GyeonggiRow[],
): GyeonggiJoinResult {
  const lots: ParkingLot[] = [];
  let matchedRows = 0;
  let rejectedRows = 0;

  const availabilityById = new Map<string, GyeonggiRow>();
  for (const row of availabilityRows) {
    const id = (row.pkplcId ?? "").trim();
    if (id && !availabilityById.has(id)) availabilityById.set(id, row);
  }

  for (const info of infoRows) {
    const sourceId = (info.pkplcId ?? "").trim();
    const name = (info.pkplcNm ?? "").trim();
    const latitude = numberFrom(info.latCrdn);
    const longitude = numberFrom(info.lonCrdn);
    const capacity = numberFrom(info.pklotCnt);

    if (
      !sourceId ||
      !name ||
      latitude === null ||
      longitude === null ||
      capacity === null ||
      capacity <= 0 ||
      !isFiniteGyeonggiCoordinate(latitude, longitude)
    ) {
      rejectedRows += 1;
      continue;
    }

    const baseFee = numericField(info, ["parkingBscFare"]);
    const additionalFee = numericField(info, ["addUnitFare"]);
    const dailyMaximumFee = numericField(info, ["ddPktckFare"]);
    const feeValues = [baseFee, additionalFee, dailyMaximumFee].filter(
      (value): value is number => value !== null,
    );
    const isFree = feeValues.length > 0 && feeValues.every((value) => value === 0);

    const availability = availabilityById.get(sourceId);
    const rawCount = availability ? numberFrom(availability.avblPklotCnt) : null;
    const hasRealtime = rawCount !== null && rawCount >= 0;
    const availableSpaces = hasRealtime ? Math.min(capacity, rawCount) : null;
    const realtimeUpdatedAt = hasRealtime
      ? parseSeoulDate(availability?.ocrnDt ?? null)
      : null;
    if (hasRealtime) matchedRows += 1;

    lots.push({
      id: `gyeonggi-${sourceId}`,
      sourceId,
      source: "GYEONGGI_GITS",
      name,
      address: (info.roadNmAddr ?? "").trim() || "주소 정보 없음",
      latitude,
      longitude,
      capacity,
      occupiedSpaces: availableSpaces === null ? null : capacity - availableSpaces,
      availableSpaces,
      realtimeUpdatedAt,
      realtimeSupported: hasRealtime,
      feeRule: {
        isFree,
        baseMinutes: numericField(info, ["parkingBscTime"]),
        baseFee,
        additionalMinutes: numericField(info, ["addUnitTime"]),
        additionalFee,
        dailyMaximumFee,
      },
      operatingLabel: buildOperatingLabel(info),
      isOpen: null,
    });
  }

  lots.sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  return {
    lots,
    stats: {
      infoRows: infoRows.length,
      availabilityRows: availabilityRows.length,
      matchedRows,
      rejectedRows,
    },
  };
}
