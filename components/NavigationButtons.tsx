"use client";

import { Map } from "lucide-react";
import { Button } from "@/components/Button";
import { buildNaverAndroidIntentUrl, buildNaverAppNavigationUrl, buildNaverWebDirectionsUrl } from "@/lib/maps/navigation";
import type { ParkingRecommendation, Place } from "@/lib/types";

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

export function NavigationButtons({ origin, parking, compact = false }: {
  origin: Place;
  parking: ParkingRecommendation;
  compact?: boolean;
}) {
  return (
    <div className={`navigation-buttons${compact ? " navigation-buttons--compact" : ""}`}>
      <Button variant="secondary" size={compact ? "sm" : "md"} onClick={() => openNaverNavigation(origin, parking)}><Map size={17} /> 네이버지도</Button>
    </div>
  );
}
