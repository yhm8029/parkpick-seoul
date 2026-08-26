"use client";

import { Navigation } from "lucide-react";
import { Button } from "@/components/Button";
import type { ParkingRecommendation } from "@/lib/types";

const KAKAO_SDK_ID = "kakao-js-sdk";

async function loadKakaoSdk() {
  if (window.Kakao) return;
  const existing = document.getElementById(KAKAO_SDK_ID) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
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

export function KakaoNavigationButton({ parking }: { parking: ParkingRecommendation }) {
  const open = async () => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
    if (!key) {
      window.open(`https://map.kakao.com/link/to/${encodeURIComponent(parking.name)},${parking.latitude},${parking.longitude}`, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await loadKakaoSdk();
      if (!window.Kakao) throw new Error("Kakao SDK unavailable");
      if (!window.Kakao.isInitialized()) window.Kakao.init(key);
      window.Kakao.Navi.start({ name: parking.name, x: parking.longitude, y: parking.latitude, coordType: "wgs84" });
    } catch {
      window.open(`https://map.kakao.com/link/to/${encodeURIComponent(parking.name)},${parking.latitude},${parking.longitude}`, "_blank", "noopener,noreferrer");
    }
  };
  return <Button onClick={open}><Navigation size={17} /> 카카오내비</Button>;
}
