import { describe, expect, it } from "vitest";
import {
  buildNaverAndroidIntentUrl,
  buildNaverAppNavigationUrl,
  buildNaverWebDirectionsUrl,
  clampLatitude,
  toWebMercator
} from "@/lib/maps/navigation";

const origin = { name: "현재 위치", latitude: 37.4979, longitude: 127.0276 };
const parking = { name: "역삼1문화센터 공영주차장", latitude: 37.49534845, longitude: 127.03323757 };
const appName = "https://parkpick.example";

describe("Naver navigation URL builders", () => {
  it("builds the mobile app URL with origin, destination and appname", () => {
    const url = buildNaverAppNavigationUrl(origin, parking, appName);
    expect(url).toContain("slat=37.4979");
    expect(url).toContain("slng=127.0276");
    const snameEncoded = encodeURIComponent(origin.name);
    const dnameEncoded = encodeURIComponent(parking.name);
    const appnameEncoded = encodeURIComponent(appName);
    const spaceClass = "(?:\\+|%20)";
    expect(url).toMatch(new RegExp(`[?&]sname=${snameEncoded.replace(/%20/g, spaceClass)}`));
    expect(url).toContain("dlat=37.49534845");
    expect(url).toContain("dlng=127.03323757");
    expect(url).toMatch(new RegExp(`[?&]dname=${dnameEncoded.replace(/%20/g, spaceClass)}`));
    expect(url).toMatch(new RegExp(`[?&]appname=${appnameEncoded.replace(/%20/g, spaceClass)}`));
    expect(url.startsWith("nmap://route/car?")).toBe(true);
  });

  it("wraps the same query inside an Android intent for com.nhn.android.nmap", () => {
    const url = buildNaverAndroidIntentUrl(origin, parking, appName);
    expect(url.startsWith("intent://route/car?")).toBe(true);
    expect(url).toContain("package=com.nhn.android.nmap");
    expect(url).toContain("slat=37.4979");
    expect(url).toContain("dlat=37.49534845");
    expect(url).toContain("appname=" + encodeURIComponent(appName));
  });

  it("builds the desktop directions URL with EPSG:3857 segments", () => {
    const url = buildNaverWebDirectionsUrl(origin, parking);
    expect(url.startsWith("https://map.naver.com/p/directions/")).toBe(true);
    const parts = url.split("/");
    const originEncoded = encodeURIComponent(origin.name);
    const parkingEncoded = encodeURIComponent(parking.name);
    expect(parts.some(part => part.includes(originEncoded))).toBe(true);
    expect(parts.some(part => part.includes(parkingEncoded))).toBe(true);
    expect(parts.some(part => part.endsWith(",PLACE_POI"))).toBe(true);
    expect(parts[parts.length - 1]).toBe("car");
    const originMercator = toWebMercator(origin);
    expect(parts).toContainEqual(expect.stringContaining(String(originMercator.x)));
    const destinationMercator = toWebMercator(parking);
    expect(parts).toContainEqual(expect.stringContaining(String(destinationMercator.y)));
    expect(url).not.toContain(encodeURI("127.0276,37.4979"));
  });

  it("clamps latitude to the Web Mercator limit", () => {
    expect(clampLatitude(89)).toBe(85.0511287798066);
    expect(clampLatitude(-89)).toBe(-85.0511287798066);
    expect(clampLatitude(37.5)).toBe(37.5);
  });
});
