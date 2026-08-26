"use client";

import { MapPinned } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/Badge";
import { loadNaverMapSdk } from "@/lib/maps/naver-sdk";
import type { Coordinate, ParkingRecommendation, Place } from "@/lib/types";

interface Point extends Coordinate {
  id: string;
  kind: "origin" | "destination" | "parking";
  label: string;
  rank?: number;
}

type NaverMapInstance = {
  fitBounds: (bounds: unknown, options?: Record<string, number>) => void;
  setCenter: (coordinate: unknown) => void;
  setZoom: (zoom: number) => void;
};

const SEOUL_CENTER: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const congestionColor = { 1: "#16a36a", 2: "#f59e0b", 3: "#dc4c3f" } as const;

export function MapPanel({
  origin,
  destination,
  recommendations,
  activeId,
  onSelect,
}: {
  origin: Coordinate | null;
  destination: Place | null;
  recommendations: ParkingRecommendation[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const naverKey = process.env.NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID;
  const provider = naverKey ? "NAVER" : "PREVIEW";
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapVersion, setMapVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<NaverMapInstance | null>(null);

  const points = useMemo<Point[]>(() => {
    const items: Point[] = [];
    if (origin) items.push({ ...origin, id: "origin", kind: "origin", label: "출발" });
    if (destination) items.push({ ...destination, id: "destination", kind: "destination", label: destination.name });
    recommendations.forEach((item) => items.push({
      ...item,
      id: item.id,
      kind: "parking",
      label: item.name,
      rank: item.rank,
    }));
    return items;
  }, [origin, destination, recommendations]);
  const mapDataKey = useMemo(() => JSON.stringify({
    points: points.map(({ id, latitude, longitude }) => [id, latitude, longitude]),
    routes: recommendations.map((item) => [item.id, item.routePath ?? []]),
  }), [points, recommendations]);
  const pointsRef = useRef(points);
  const recommendationsRef = useRef(recommendations);
  const originRef = useRef(origin);
  const destinationRef = useRef(destination);
  const activeIdRef = useRef(activeId);
  const onSelectRef = useRef(onSelect);
  pointsRef.current = points;
  recommendationsRef.current = recommendations;
  originRef.current = origin;
  destinationRef.current = destination;
  activeIdRef.current = activeId;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!naverKey || !containerRef.current) {
      mapRef.current = null;
      setState("idle");
      return;
    }

    let cancelled = false;
    setState("loading");
    void loadNaverMapSdk(naverKey).then(() => {
      if (cancelled || !window.naver?.maps || !containerRef.current) return;
      const maps = window.naver.maps;
      const currentPoints = pointsRef.current;
      const currentRecommendations = recommendationsRef.current;
      const currentActiveId = activeIdRef.current;
      const centerPoint = destinationRef.current ?? originRef.current ?? SEOUL_CENTER;
      const center = new maps.LatLng(centerPoint.latitude, centerPoint.longitude);
      containerRef.current.replaceChildren();
      const map = new maps.Map(containerRef.current, { center, zoom: 14, zoomControl: true });
      mapRef.current = map;

      const active = currentActiveId
        ? currentRecommendations.find((item) => item.id === currentActiveId)
        : undefined;
      const coordinates: Coordinate[] = [
        ...(currentPoints.length ? currentPoints : [centerPoint]),
        ...(active?.routePath ?? []),
      ];
      const latitudes = coordinates.map((point) => point.latitude);
      const longitudes = coordinates.map((point) => point.longitude);
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLng = Math.min(...longitudes);
      const maxLng = Math.max(...longitudes);
      const bounds = new maps.LatLngBounds(
        new maps.LatLng(minLat, minLng),
        new maps.LatLng(maxLat, maxLng),
      );

      currentPoints.forEach((point) => {
        const position = new maps.LatLng(point.latitude, point.longitude);
        const label = point.kind === "parking" ? point.rank : point.kind === "origin" ? "출" : "도";
        const content = `<div class="map-marker map-marker--${point.kind}${currentActiveId === point.id ? " is-active" : ""}">${label}</div>`;
        const marker = new maps.Marker({ position, map, title: point.label, icon: { content } });
        if (point.kind === "parking") maps.Event.addListener(marker, "click", () => onSelectRef.current?.(point.id));
      });

      const isDegenerate = coordinates.length <= 1 || (minLat === maxLat && minLng === maxLng);
      if (!currentPoints.length) {
        map.setCenter(center);
        map.setZoom(13);
      } else if (isDegenerate) {
        map.setCenter(center);
        map.setZoom(15);
      } else {
        map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40, maxZoom: 16 });
      }
      setState("ready");
      setMapVersion((version) => version + 1);
    }).catch(() => {
      if (!cancelled) setState("error");
    });

    return () => { cancelled = true; };
  }, [naverKey, mapDataKey]);

  useEffect(() => {
    const maps = window.naver?.maps;
    const map = mapRef.current;
    if (!maps || !map || !activeId) return;
    const active = recommendations.find((item) => item.id === activeId);
    if (!active?.routePath || active.routePath.length < 2) return;

    const overlays: Array<{ setMap: (nextMap: unknown) => void }> = [];
    const toLatLng = (path: Coordinate[]) => path.map((point) => new maps.LatLng(point.latitude, point.longitude));
    overlays.push(new maps.Polyline({
      map,
      path: toLatLng(active.routePath),
      strokeColor: "#8b9692",
      strokeWeight: 6,
      strokeOpacity: .75,
    }));

    for (const section of active.routeCongestionSections ?? []) {
      if (section.congestion === 0) continue;
      const start = Math.max(0, Math.min(active.routePath.length - 1, section.pointIndex));
      const end = Math.max(start + 1, Math.min(active.routePath.length, start + section.pointCount));
      const sharedStart = start > 0 ? start - 1 : start;
      const segment = active.routePath.slice(sharedStart, end);
      if (segment.length < 2) continue;
      overlays.push(new maps.Polyline({
        map,
        path: toLatLng(segment),
        strokeColor: congestionColor[section.congestion],
        strokeWeight: 7,
        strokeOpacity: .96,
      }));
    }

    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [activeId, recommendations, mapVersion]);

  const previewBounds = useMemo(() => {
    const source = points.length ? points : [SEOUL_CENTER];
    return {
      minLat: Math.min(...source.map((point) => point.latitude)),
      maxLat: Math.max(...source.map((point) => point.latitude)),
      minLng: Math.min(...source.map((point) => point.longitude)),
      maxLng: Math.max(...source.map((point) => point.longitude)),
    };
  }, [points]);
  const previewPosition = (point: Point) => ({
    left: `${Math.max(8, Math.min(92, 12 + (point.longitude - previewBounds.minLng) / Math.max(.006, previewBounds.maxLng - previewBounds.minLng) * 76))}%`,
    top: `${Math.max(8, Math.min(92, 88 - (point.latitude - previewBounds.minLat) / Math.max(.006, previewBounds.maxLat - previewBounds.minLat) * 76))}%`,
  });

  const actualReady = state === "ready" && provider === "NAVER";
  const title = destination ? `${destination.name} 주변` : origin ? "현재 위치 주변" : "서울 중심";
  return (
    <section className="map-card" aria-label="주차장 지도">
      <div className="map-toolbar">
        <div><MapPinned size={18} /><strong>{title}</strong></div>
        <Badge tone={provider === "NAVER" ? "success" : "demo"}>NAVER</Badge>
      </div>
      <div className="map-stage">
        <div ref={containerRef} className={`real-map${actualReady ? " is-visible" : ""}`} />
        {!actualReady ? <div className="preview-map">
          <div className="preview-river" /><div className="preview-road preview-road--one" /><div className="preview-road preview-road--two" />
          {points.map((point) => <button type="button" key={point.id} style={previewPosition(point)} className={`preview-marker preview-marker--${point.kind}${activeId === point.id ? " is-active" : ""}`} onClick={() => point.kind === "parking" && onSelect?.(point.id)}>{point.kind === "parking" ? point.rank : point.kind === "origin" ? "출" : "도"}<span>{point.kind === "parking" ? `${point.rank}순위` : point.label}</span></button>)}
          {!points.length ? <div className="map-empty"><MapPinned size={34} /><strong>서울 중심 지도</strong><span>현재 위치를 사용하면 내 주변 지도로 이동합니다.</span></div> : null}
          {state === "loading" ? <div className="map-loading">네이버 지도를 불러오는 중</div> : null}
          {state === "error" ? <div className="map-error">네이버 지도 인증 정보를 확인해 주세요. 미리보기는 계속 사용할 수 있습니다.</div> : null}
        </div> : null}
      </div>
      <div className="map-footer"><Badge tone={provider === "NAVER" ? "success" : "demo"}>{provider === "NAVER" ? "NAVER Web Dynamic Map" : "좌표 미리보기"}</Badge><span>출발지 · 목적지 · 추천 1~3순위</span></div>
    </section>
  );
}
