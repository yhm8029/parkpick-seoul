"use client";

import { CarFront, CircleAlert, Footprints, Gauge, MapPin, ParkingCircle, ShieldCheck, WalletCards } from "lucide-react";
import type { ParkingRecommendation } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import { NavigationButtons } from "@/components/NavigationButtons";

const riskLabel = { LOW: ["만차 위험 낮음", "success"], MEDIUM: ["만차 위험 보통", "warning"], HIGH: ["만차 위험 높음", "danger"], UNKNOWN: ["위험 미확인", "neutral"] } as const;
const statusLabel = { LIVE: ["실시간", "success"], DELAYED: ["다소 지연", "warning"], STALE: ["오래된 정보", "danger"], OFFLINE: ["연결 지연", "danger"], UNKNOWN: ["실시간 미지원", "neutral"] } as const;

export function ParkingCard({ parking, active, onSelect }: { parking: ParkingRecommendation; active: boolean; onSelect: () => void }) {
  const risk = riskLabel[parking.availabilityRisk]; const status = statusLabel[parking.realtimeStatus];
  return <article className={`parking-card${active ? " is-active" : ""}`}>
    <div className="parking-head"><button type="button" className="rank" onClick={onSelect}><strong>{parking.rank}</strong><span>순위</span></button><div className="parking-identity"><div><Badge tone={risk[1]}>{risk[0]}</Badge><Badge tone={status[1]}>{status[0]}</Badge>{parking.source === "DEMO" ? <Badge tone="demo">예시 데이터</Badge> : null}</div><h3>{parking.name}</h3><p><MapPin size={14} /> {parking.address}</p></div><button type="button" className="score" onClick={onSelect}><strong>{parking.score}</strong><span>점</span></button></div>
    <div className="availability"><div><span><ParkingCircle size={16} /> 현재 빈자리</span><strong>{parking.availableSpaces == null ? "확인 불가" : `${parking.availableSpaces}면`}</strong><small>전체 {parking.capacity}면</small></div><i /><div><span><Gauge size={16} /> 도착 시 예상</span><strong>{parking.predictedAvailable ? `${parking.predictedAvailable.min}~${parking.predictedAvailable.max}면` : "데이터 부족"}</strong><small>{parking.predictedAvailable ? `신뢰도 ${parking.predictedAvailable.confidence === "HIGH" ? "높음" : parking.predictedAvailable.confidence === "MEDIUM" ? "보통" : "낮음"}` : "현재값 중심"}</small></div></div>
    <dl className="metrics"><div><dt><CarFront size={16} /> 자동차</dt><dd>{parking.driveMinutes}분</dd><small>{parking.routeSource === "ESTIMATE" ? "추정" : "경로 반영"}</small></div><div><dt><Footprints size={16} /> 도보</dt><dd>{parking.walkMinutes}분</dd><small>{parking.walkDistanceMeters}m</small></div><div><dt><WalletCards size={16} /> 예상요금</dt><dd>{formatCurrency(parking.estimatedFee)}</dd><small>할인 전</small></div></dl>
    <div className="reason-list">{parking.reasons.slice(0, 2).map(reason => <p key={reason}><ShieldCheck size={15} /> {reason}</p>)}{parking.warnings.slice(0, 1).map(warning => <p className="warning" key={warning}><CircleAlert size={15} /> {warning}</p>)}</div>
    <NavigationButtons parking={parking} />
  </article>;
}
