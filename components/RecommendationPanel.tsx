"use client";

import { CircleAlert, List, Map } from "lucide-react";
import { Badge } from "@/components/Badge";
import { ParkingCard } from "@/components/ParkingCard";
import type { RecommendationResponse } from "@/lib/types";

export interface RecommendationPanelProps {
  result: RecommendationResponse;
  activeId: string | null;
  mobileView: "map" | "list";
  onSelect: (id: string) => void;
  onMobileViewChange: (view: "map" | "list") => void;
}

export function RecommendationPanel({ result, activeId, mobileView, onSelect, onMobileViewChange }: RecommendationPanelProps) {
  return <section className="result-panel" aria-labelledby="recommendation-title">
    <div className="results-head">
      <div>
        <span className="eyebrow">TOP 3 RECOMMENDATIONS</span>
        <h2 id="recommendation-title">{result.destination.name} 주변 추천</h2>
        <p>{result.dataNotice}</p>
      </div>
      <Badge tone={result.dataMode === "LIVE" ? "success" : result.dataMode === "FALLBACK" ? "warning" : "demo"}>
        {result.dataMode === "LIVE" ? "서울시 실데이터" : result.dataMode === "FALLBACK" ? "대체 데이터" : "데모 모드"}
      </Badge>
    </div>
    <div className="view-toggle" aria-label="결과 보기 방식">
      <button type="button" className={mobileView === "list" ? "is-active" : ""} onClick={() => onMobileViewChange("list")}><List size={16} /> 목록</button>
      <button type="button" className={mobileView === "map" ? "is-active" : ""} onClick={() => onMobileViewChange("map")}><Map size={16} /> 지도</button>
    </div>
    <div className="parking-list">
      {result.recommendations.map(parking => <ParkingCard key={parking.id} parking={parking} active={parking.id === activeId} onSelect={() => onSelect(parking.id)} />)}
    </div>
    <div className="disclaimer"><CircleAlert size={17} /><p><strong>추천은 주차면 예약이 아닙니다.</strong> 도착 전 2·3순위도 함께 확인하세요.</p></div>
  </section>;
}
