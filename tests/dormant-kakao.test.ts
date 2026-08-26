import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dormant Kakao map source", () => {
  it("keeps the Kakao SDK out of active MapPanel and in the dormant renderer", () => {
    const mapPanel = readFileSync(resolve(process.cwd(), "components/MapPanel.tsx"), "utf8");
    const renderer = readFileSync(resolve(process.cwd(), "lib/maps/kakao-map-renderer.ts"), "utf8");
    const sdkUrl = "dapi.kakao.com/v2/maps/sdk.js";

    expect(mapPanel).not.toContain(sdkUrl);
    expect(renderer).toContain(sdkUrl);
    expect(renderer).toMatch(/export\s+(?:async\s+)?function\s+loadKakaoMapSdk\b/);
    expect(renderer).toMatch(/export\s+(?:async\s+)?function\s+renderKakaoMap\b/);
  });
});
