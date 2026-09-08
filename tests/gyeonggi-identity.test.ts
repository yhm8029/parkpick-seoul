import { describe, expect, it } from "vitest";
import { joinGyeonggiParkingRows, parseGyeonggiParkingXml } from "@/lib/api/gyeonggi-parking-normalize";

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<response><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>${body}</msgBody></response>`;
}

function infoItemList(capacity: string, laeId: string, pkplcId: string): string {
  return `<itemList>
    <laeId>${laeId}</laeId><pkplcId>${pkplcId}</pkplcId>
    <pkplcNm>${laeId}-${pkplcId}</pkplcNm>
    <roadNmAddr>도로명 ${laeId}-${pkplcId}</roadNmAddr>
    <latCrdn>37.5</latCrdn><lonCrdn>127.0</lonCrdn><pklotCnt>${capacity}</pklotCnt>
    <parkingBscFare>1000</parkingBscFare><parkingBscTime>30</parkingBscTime>
    <addUnitFare>500</addUnitFare><addUnitTime>10</addUnitTime><ddPktckFare>10000</ddPktckFare>
    <wkdayOprtStartTime>0900</wkdayOprtStartTime><wkdayOprtEndTime>1800</wkdayOprtEndTime>
  </itemList>`;
}

function availItemList(capacity: string, laeId: string, pkplcId: string): string {
  return `<itemList>
    <laeId>${laeId}</laeId><pkplcId>${pkplcId}</pkplcId>
    <avblPklotCnt>${capacity}</avblPklotCnt><ocrnDt>20240101120000</ocrnDt>
  </itemList>`;
}

describe("gyeonggi composite identity", () => {
  it("joins adjacent itemList rows for INFO and AVAILABILITY", () => {
    const infoXml = envelope(infoItemList("100", "31150", "00030") + infoItemList("200", "31110", "00030"));
    const availXml = envelope(availItemList("30", "31150", "00030") + availItemList("80", "31110", "00030"));
    const info = parseGyeonggiParkingXml(infoXml, "INFO");
    const avail = parseGyeonggiParkingXml(availXml, "AVAILABILITY");
    const result = joinGyeonggiParkingRows(info, avail);
    expect(result.stats.infoRows).toBe(2);
    expect(result.stats.availabilityRows).toBe(2);
    expect(result.stats.matchedRows).toBe(2);
    expect(result.lots).toHaveLength(2);
    const lotA = result.lots.find((l) => l.sourceId === "31150:00030");
    const lotB = result.lots.find((l) => l.sourceId === "31110:00030");
    expect(lotA?.availableSpaces).toBe(30);
    expect(lotB?.availableSpaces).toBe(80);
    expect(lotA?.id).toBe("gyeonggi-31150:00030");
    const ids = result.lots.map((l) => l.sourceId);
    expect(new Set(ids).size).toBe(2);
    expect(result.lots[0].id).not.toBe(result.lots[1].id);
  });

  it("rejects mismatched itemList/body wrapper", () => {
    const xml = envelope('<itemList><x>1</x></body>');
    expect(() => parseGyeonggiParkingXml(xml, "INFO")).toThrow();
  });

  it("availability with missing laeId is offline, info is rejected", () => {
    const availNoLae = `<itemList><pkplcId>00030</pkplcId><avblPklotCnt>50</avblPklotCnt><ocrnDt>20240101120000</ocrnDt></itemList>`;
    const availXml = envelope(availNoLae);
    const infoXml = envelope(infoItemList("100", "31150", "00030"));
    const availRows = parseGyeonggiParkingXml(availXml, "AVAILABILITY");
    const infoRows = parseGyeonggiParkingXml(infoXml, "INFO");
    const result = joinGyeonggiParkingRows(infoRows, availRows);
    const lot = result.lots[0];
    expect(lot.availableSpaces).toBeNull();
    expect(lot.realtimeSupported).toBe(false);
    expect(result.stats.matchedRows).toBe(0);
    const infoNoLae = envelope(`<itemList><pkplcId>00030</pkplcId><pkplcNm>no-lae</pkplcNm><roadNmAddr>addr</roadNmAddr><latCrdn>37.5</latCrdn><lonCrdn>127.0</lonCrdn><pklotCnt>100</pklotCnt></itemList>`);
    const rejected = joinGyeonggiParkingRows(parseGyeonggiParkingXml(infoNoLae, "INFO"), []);
    expect(rejected.lots).toHaveLength(0);
    expect(rejected.stats.rejectedRows).toBe(1);
  });
});
