"use client";

import { useCallback, useEffect, useState } from "react";
import type { Coordinate } from "@/lib/types";

export type GeoStatus = "idle" | "checking" | "requesting" | "granted" | "denied" | "unavailable" | "timeout" | "unsupported" | "insecure";
export interface GeoValue extends Coordinate { accuracyMeters: number; capturedAt: string; }

export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [value, setValue] = useState<GeoValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.isSecureContext) { setStatus("insecure"); setError("GPS는 HTTPS 또는 localhost에서만 사용할 수 있습니다."); return; }
    if (!("geolocation" in navigator)) { setStatus("unsupported"); setError("이 브라우저는 위치 기능을 지원하지 않습니다."); return; }
    if (!navigator.permissions?.query) return;
    let permission: PermissionStatus | null = null;
    const onChange = () => { if (permission?.state === "denied" && !value) { setStatus("denied"); setError("브라우저에서 위치 권한이 차단되어 있습니다."); } };
    setStatus("checking");
    navigator.permissions.query({ name: "geolocation" }).then(result => { permission = result; result.addEventListener("change", onChange); onChange(); setStatus(current => current === "checking" ? "idle" : current); }).catch(() => setStatus("idle"));
    return () => { permission?.removeEventListener("change", onChange); };
  }, [value]);

  const requestPosition = useCallback(() => {
    if (!window.isSecureContext) { setStatus("insecure"); setError("GPS는 HTTPS 또는 localhost에서만 사용할 수 있습니다."); return; }
    if (!("geolocation" in navigator)) { setStatus("unsupported"); setError("이 브라우저는 위치 기능을 지원하지 않습니다."); return; }
    setStatus("requesting"); setError(null);
    navigator.geolocation.getCurrentPosition(position => {
      setValue({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: Math.round(position.coords.accuracy), capturedAt: new Date(position.timestamp).toISOString() });
      setStatus("granted");
    }, positionError => {
      if (positionError.code === positionError.PERMISSION_DENIED) { setStatus("denied"); setError("위치 권한이 차단됐습니다. 브라우저 사이트 설정에서 허용해 주세요."); }
      else if (positionError.code === positionError.TIMEOUT) { setStatus("timeout"); setError("위치 확인 시간이 초과됐습니다. 다시 시도하거나 직접 출발지를 입력하세요."); }
      else { setStatus("unavailable"); setError("현재 위치를 확인하지 못했습니다. GPS·Wi-Fi 상태를 확인하세요."); }
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
  }, []);

  return { status, value, error, requestPosition, refreshPosition: requestPosition };
}
