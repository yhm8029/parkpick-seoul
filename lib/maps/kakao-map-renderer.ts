import type { Coordinate } from "@/lib/types";

export interface KakaoMapPoint extends Coordinate {
  id: string;
  kind: "origin" | "destination" | "parking";
  label: string;
  rank?: number;
}

export interface RenderKakaoMapOptions {
  container: HTMLElement;
  key: string;
  center: Coordinate;
  points: KakaoMapPoint[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}

const KAKAO_SCRIPT_ID = "kakao-map-sdk";
const KAKAO_SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";

export function loadKakaoMapSdk(key: string): Promise<void> {
  if (window.kakao?.maps) return Promise.resolve();

  const existing = document.getElementById(KAKAO_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.kakao?.maps) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Kakao map SDK load failed")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = KAKAO_SCRIPT_ID;
    script.src = `${KAKAO_SDK_URL}?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Kakao map SDK load failed")), { once: true });
    document.head.appendChild(script);
  });
}

export async function renderKakaoMap({ container, key, center, points, activeId, onSelect }: RenderKakaoMapOptions): Promise<void> {
  await loadKakaoMapSdk(key);
  const maps = window.kakao?.maps;
  if (!maps) throw new Error("Kakao map SDK is unavailable");

  await new Promise<void>((resolve) => {
    maps.load(() => {
      container.replaceChildren();
      const map = new maps.Map(container, {
        center: new maps.LatLng(center.latitude, center.longitude),
        level: 5,
      });
      const bounds = new maps.LatLngBounds();

      points.forEach((point) => {
        const position = new maps.LatLng(point.latitude, point.longitude);
        bounds.extend(position);
        const content = document.createElement(point.kind === "parking" ? "button" : "div");
        content.className = point.kind === "parking"
          ? `map-marker map-marker--parking${activeId === point.id ? " is-active" : ""}`
          : `map-marker map-marker--${point.kind}`;
        content.textContent = point.kind === "parking" ? String(point.rank) : point.kind === "origin" ? "출" : "도";
        content.title = point.label;
        if (point.kind === "parking") content.addEventListener("click", () => onSelect?.(point.id));

        new maps.CustomOverlay({
          position,
          content,
          yAnchor: 1.05,
          zIndex: activeId === point.id ? 4 : 3,
        }).setMap(map);
      });

      if (points.length) map.setBounds(bounds);
      window.setTimeout(() => map.relayout(), 0);
      resolve();
    });
  });
}
