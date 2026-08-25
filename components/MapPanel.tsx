"use client";

import { MapPinned } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate, MapProvider, ParkingRecommendation, Place } from "@/lib/types";
import { Badge } from "@/components/Badge";

const KAKAO_SCRIPT_ID = "kakao-map-sdk";
const NAVER_SCRIPT_ID = "naver-map-sdk";

function script(id: string, src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) return new Promise((resolve, reject) => {
    if (ready()) { resolve(); return; }
    existing.addEventListener("load", () => resolve(), { once: true });
    existing.addEventListener("error", () => reject(new Error(`${id} load failed`)), { once: true });
  });
  return new Promise((resolve, reject) => {
    const element = document.createElement("script"); element.id = id; element.src = src; element.async = true;
    element.onload = () => resolve(); element.onerror = () => reject(new Error(`${id} load failed`)); document.head.appendChild(element);
  });
}

interface Point extends Coordinate { id: string; kind: "origin" | "destination" | "parking"; label: string; rank?: number; }

export function MapPanel({ origin, destination, recommendations, activeId, onSelect }: { origin: Coordinate | null; destination: Place | null; recommendations: ParkingRecommendation[]; activeId?: string | null; onSelect?: (id: string) => void }) {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
  const naverKey = process.env.NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID;
  const initial: MapProvider = kakaoKey ? "KAKAO" : naverKey ? "NAVER" : "PREVIEW";
  const [provider, setProvider] = useState<MapProvider>(initial);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const points = useMemo<Point[]>(() => {
    const items: Point[] = [];
    if (origin) items.push({ ...origin, id: "origin", kind: "origin", label: "출발" });
    if (destination) items.push({ ...destination, id: "destination", kind: "destination", label: destination.name });
    recommendations.forEach(item => items.push({ ...item, id: item.id, kind: "parking", label: item.name, rank: item.rank }));
    return items;
  }, [origin, destination, recommendations]);

  useEffect(() => {
    if (!destination || provider === "PREVIEW" || !containerRef.current) { setState("idle"); return; }
    const key = provider === "KAKAO" ? kakaoKey : naverKey;
    if (!key) { setState("error"); return; }
    let cancelled = false;
    setState("loading");
    const renderKakao = async () => {
      await script(KAKAO_SCRIPT_ID, `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`, () => Boolean(window.kakao?.maps));
      if (cancelled || !window.kakao?.maps || !containerRef.current) return;
      window.kakao.maps.load(() => {
        if (cancelled || !window.kakao?.maps || !containerRef.current) return;
        const maps = window.kakao.maps; containerRef.current.replaceChildren();
        const map = new maps.Map(containerRef.current, { center: new maps.LatLng(destination.latitude, destination.longitude), level: 5 });
        const bounds = new maps.LatLngBounds();
        points.forEach(point => {
          const position = new maps.LatLng(point.latitude, point.longitude); bounds.extend(position);
          const content = document.createElement(point.kind === "parking" ? "button" : "div");
          content.className = point.kind === "parking" ? `map-marker map-marker--parking${activeId === point.id ? " is-active" : ""}` : `map-marker map-marker--${point.kind}`;
          content.textContent = point.kind === "parking" ? String(point.rank) : point.kind === "origin" ? "출" : "도";
          content.title = point.label;
          if (point.kind === "parking") content.addEventListener("click", () => onSelect?.(point.id));
          new maps.CustomOverlay({ position, content, yAnchor: 1.05, zIndex: activeId === point.id ? 4 : 3 }).setMap(map);
        });
        map.setBounds(bounds); window.setTimeout(() => map.relayout(), 0); setState("ready");
      });
    };
    const renderNaver = async () => {
      window.navermap_authFailure = () => { if (!cancelled) setState("error"); };
      await script(NAVER_SCRIPT_ID, `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`, () => Boolean(window.naver?.maps));
      if (cancelled || !window.naver?.maps || !containerRef.current) return;
      const maps = window.naver.maps; containerRef.current.replaceChildren();
      const map = new maps.Map(containerRef.current, { center: new maps.LatLng(destination.latitude, destination.longitude), zoom: 14, zoomControl: true });
      const bounds = new maps.LatLngBounds();
      points.forEach(point => {
        const position = new maps.LatLng(point.latitude, point.longitude); bounds.extend(position);
        const content = `<div class="map-marker map-marker--${point.kind}${activeId === point.id ? " is-active" : ""}">${point.kind === "parking" ? point.rank : point.kind === "origin" ? "출" : "도"}</div>`;
        const marker = new maps.Marker({ position, map, title: point.label, icon: { content } });
        if (point.kind === "parking") maps.Event.addListener(marker, "click", () => onSelect?.(point.id));
      });
      map.fitBounds(bounds); setState("ready");
    };
    (provider === "KAKAO" ? renderKakao() : renderNaver()).catch(error => { console.error(error); if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [provider, destination, points, activeId, onSelect, kakaoKey, naverKey]);

  const bounds = useMemo(() => {
    const source = points.length ? points : [{ latitude: 37.5665, longitude: 126.978 }];
    return { minLat: Math.min(...source.map(p => p.latitude)), maxLat: Math.max(...source.map(p => p.latitude)), minLng: Math.min(...source.map(p => p.longitude)), maxLng: Math.max(...source.map(p => p.longitude)) };
  }, [points]);
  const position = (point: Point) => {
    const x = 12 + (point.longitude - bounds.minLng) / Math.max(.006, bounds.maxLng - bounds.minLng) * 76;
    const y = 88 - (point.latitude - bounds.minLat) / Math.max(.006, bounds.maxLat - bounds.minLat) * 76;
    return { left: `${Math.max(8, Math.min(92, x))}%`, top: `${Math.max(8, Math.min(92, y))}%` };
  };
  const actualReady = state === "ready" && provider !== "PREVIEW";
  return (
    <section className="map-card" aria-label="주차장 지도">
      <div className="map-toolbar">
        <div><MapPinned size={18} /><strong>{destination ? `${destination.name} 주변` : "목적지를 선택하세요"}</strong></div>
        <div className="map-provider-tabs" role="group" aria-label="지도 공급자">
          <button type="button" className={provider === "KAKAO" ? "is-active" : ""} onClick={() => setProvider("KAKAO")} disabled={!kakaoKey}>카카오맵{!kakaoKey ? " · 키 필요" : ""}</button>
          <button type="button" className={provider === "NAVER" ? "is-active" : ""} onClick={() => setProvider("NAVER")} disabled={!naverKey}>네이버지도{!naverKey ? " · 키 필요" : ""}</button>
          <button type="button" className={provider === "PREVIEW" ? "is-active" : ""} onClick={() => setProvider("PREVIEW")}>미리보기</button>
        </div>
      </div>
      <div className="map-stage">
        <div ref={containerRef} className={`real-map${actualReady ? " is-visible" : ""}`} />
        {!actualReady ? <div className="preview-map">
          <div className="preview-river" /><div className="preview-road preview-road--one" /><div className="preview-road preview-road--two" />
          {points.map(point => <button type="button" key={point.id} style={position(point)} className={`preview-marker preview-marker--${point.kind}${activeId === point.id ? " is-active" : ""}`} onClick={() => point.kind === "parking" && onSelect?.(point.id)}>{point.kind === "parking" ? point.rank : point.kind === "origin" ? "출" : "도"}<span>{point.kind === "parking" ? `${point.rank}순위` : point.label}</span></button>)}
          {!points.length ? <div className="map-empty"><MapPinned size={34} /><strong>목적지를 먼저 선택하세요</strong><span>카카오맵과 네이버지도 중 원하는 지도를 선택할 수 있습니다.</span></div> : null}
          {state === "loading" ? <div className="map-loading">{provider === "NAVER" ? "네이버지도" : "카카오맵"} 불러오는 중…</div> : null}
          {state === "error" ? <div className="map-error">지도 키·등록 도메인을 확인해 주세요. 미리보기는 계속 사용할 수 있습니다.</div> : null}
        </div> : null}
      </div>
      <div className="map-footer"><Badge tone={provider === "NAVER" ? "success" : provider === "KAKAO" ? "info" : "demo"}>{provider === "NAVER" ? "NAVER Web Dynamic Map" : provider === "KAKAO" ? "Kakao Maps" : "좌표 미리보기"}</Badge><span>출발지 · 목적지 · 추천 1~3순위</span></div>
    </section>
  );
}
