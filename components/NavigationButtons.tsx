"use client";

import { Map, Navigation } from "lucide-react";
import type { ParkingRecommendation, Place } from "@/lib/types";
import { Button } from "@/components/Button";
import { buildNaverAndroidIntentUrl, buildNaverAppNavigationUrl, buildNaverWebDirectionsUrl } from "@/lib/maps/navigation";

const KAKAO_SDK_ID = "kakao-js-sdk";

async function loadKakaoSdk() {
  if (window.Kakao) return;
  const existing = document.getElementById(KAKAO_SDK_ID) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.Kakao) { resolve(); return; }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Kakao SDK load failed")), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = KAKAO_SDK_ID;
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Kakao SDK load failed"));
    document.head.appendChild(script);
  });
}

function kakaoMapFallback(origin: Place, parking: ParkingRecommendation) {
  void origin;
  window.open(`https://map.kakao.com/link/to/${encodeURIComponent(parking.name)},${parking.latitude},${parking.longitude}`, "_blank", "noopener,noreferrer");
}

function openNaverNavigation(origin: Place, parking: ParkingRecommendation) {
  const appName = process.env.NEXT_PUBLIC_NAVER_APP_NAME || window.location.origin;
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) {
    window.location.href = buildNaverAndroidIntentUrl(origin, parking, appName);
    return;
  }
  if (/iphone|ipad|ipod/.test(ua)) {
    const started = Date.now();
    let hidden = false;
    const onVisibility = () => { if (document.hidden) hidden = true; };
    document.addEventListener("visibilitychange", onVisibility, { once: true });
    window.location.href = buildNaverAppNavigationUrl(origin, parking, appName);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (!hidden && Date.now() - started < 2_500) window.location.href = "https://apps.apple.com/app/id311867728";
    }, 1_500);
    return;
  }
  window.open(buildNaverWebDirectionsUrl(origin, parking), "_blank", "noopener,noreferrer");
}

export function NavigationButtons({ origin, parking, compact = false }: { origin: Place; parking: ParkingRecommendation; compact?: boolean }) {
  const kakao = async () => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
    if (!key) { kakaoMapFallback(origin, parking); return; }
    try {
      await loadKakaoSdk();
      if (!window.Kakao) throw new Error("Kakao SDK unavailable");
      if (!window.Kakao.isInitialized()) window.Kakao.init(key);
      window.Kakao.Navi.start({ name: parking.name, x: parking.longitude, y: parking.latitude, coordType: "wgs84" });
    } catch { kakaoMapFallback(origin, parking); }
  };
  return (
    <div className={cnNavigation(compact)}>
      <Button size={compact ? "sm" : "md"} onClick={kakao}><Navigation size={17} /> 카카오내비</Button>
      <Button variant="secondary" size={compact ? "sm" : "md"} onClick={() => openNaverNavigation(origin, parking)}><Map size={17} /> 네이버지도</Button>
    </div>
  );
}

function cnNavigation(compact: boolean) {
  return `navigation-buttons${compact ? " navigation-buttons--compact" : ""}`;
}
