"use client";

import { useEffect, useState } from "react";

interface Stats {
  available: true;
  today: number;
  thirtyDays: number;
}

function valid(value: unknown): value is Stats {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Stats>;
  return data.available === true &&
    typeof data.today === "number" && Number.isFinite(data.today) && data.today >= 0 &&
    typeof data.thirtyDays === "number" && Number.isFinite(data.thirtyDays) && data.thirtyDays >= 0;
}

export function VisitStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/visit-stats", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("visitor stats unavailable")))
      .then((value: unknown) => { if (valid(value)) setStats(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!stats) return null;
  return (
    <aside className="visit-stats" aria-label="방문자 통계">
      <div><span>TODAY</span><strong>{stats.today.toLocaleString("ko-KR")}명</strong></div>
      <div><span>30 DAYS</span><strong>{stats.thirtyDays.toLocaleString("ko-KR")}명</strong></div>
      <p className="sr-only">30 DAYS는 날짜별 익명 방문자 수를 합산한 값입니다.</p>
    </aside>
  );
}
