"use client";

import type { RefObject } from "react";
import { CircleAlert, List, Map } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ParkingCard } from "@/components/ParkingCard";
import type { RecommendationResponse } from "@/lib/types";

import type { Place } from "@/lib/types";

export interface RecommendationPanelProps {
  headingRef: RefObject<HTMLHeadingElement | null>;
  result: RecommendationResponse;
  activeId: string | null;
  mobileView: "map" | "list";
  onSelect: (id: string) => void;
  onMobileViewChange: (view: "map" | "list") => void;
  onEdit: () => void;
  appliedOrigin?: Place | null;
  onCancel?: () => void;
}

export function RecommendationPanel({ headingRef, result, activeId, mobileView, onSelect, onMobileViewChange, onEdit, appliedOrigin, onCancel }: RecommendationPanelProps) {
  const origin = appliedOrigin ?? null;
  return <section className="result-panel" aria-labelledby="recommendation-title">
    <div className="results-head">
      <div>
        <span className="eyebrow">TOP 3 RECOMMENDATIONS</span>
        <h2 id="recommendation-title" ref={headingRef} tabIndex={-1}>{result.destination.name} 주변 추천</h2>
        <p className="sr-only" role="status">{result.destination.name} 추천 {result.recommendations.length}개를 불러왔습니다.</p>
        <p>{result.dataNotice}</p>
      </div>
      <div className="result-actions">
        <Badge tone={result.dataMode === "LIVE" ? "success" : result.dataMode === "FALLBACK" ? "warning" : "demo"}>
          {result.dataMode === "LIVE" ? "서울시 실데이터" : result.dataMode === "FALLBACK" ? "대체 데이터" : "데모 모드"}
        </Badge>
        <Button variant="ghost" size="sm" onClick={onEdit}>조건 변경</Button>
      </div>
    </div>
    <div className="view-toggle" aria-label="결과 보기 방식">
      <button type="button" className={mobileView === "list" ? "is-active" : ""} onClick={() => onMobileViewChange("list")}><List size={16} /> 목록</button>
      <button type="button" className={mobileView === "map" ? "is-active" : ""} onClick={() => onMobileViewChange("map")}><Map size={16} /> 지도</button>
    </div>
    <div className="parking-list">
      {result.recommendations.map(parking => origin ? <ParkingCard key={parking.id} origin={origin} parking={parking} active={parking.id === activeId} onSelect={() => onSelect(parking.id)} /> : null)}
    </div>
    <div className="disclaimer"><CircleAlert size={17} /><p><strong>추천은 주차면 예약이 아닙니다.</strong> 도착 전 2·3순위도 함께 확인하세요.</p></div>
  </section>;
}
