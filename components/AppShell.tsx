"use client";

import { ArrowRight, BadgeCheck, CarFront, CircleAlert, Database, LoaderCircle, LocateFixed, Map, MapPinned, Navigation, ParkingCircle, RefreshCw, Route, SearchCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { MapPanel } from "@/components/MapPanel";
import { NavigationButtons } from "@/components/NavigationButtons";
import { PlaceSearch } from "@/components/PlaceSearch";
import { RecommendationPanel } from "@/components/RecommendationPanel";
import { useGeolocation } from "@/hooks/use-geolocation";
import { DEMO_PLACES } from "@/lib/mock";
import type { Place, RecommendationProfile, RecommendationResponse } from "@/lib/types";
import { localInputToIso, toLocalDateTimeInput } from "@/lib/utils";

const cityHall = DEMO_PLACES.find(place => place.id === "city-hall") as Place;
const coex = DEMO_PLACES.find(place => place.id === "coex") as Place;
const profileItems: Array<{ value: RecommendationProfile; label: string; sub: string }> = [
  { value: "BALANCED", label: "균형", sub: "빈자리·거리·요금" },
  { value: "CHEAP", label: "저렴", sub: "주차비 우선" },
  { value: "NEAR", label: "가까움", sub: "도보 우선" },
  { value: "CERTAIN", label: "주차확실", sub: "만차위험 최소" }
];

export function AppShell() {
  const geo = useGeolocation();
  const [origin, setOrigin] = useState<Place | null>(null); const [destination, setDestination] = useState<Place | null>(null);
  const [arrival, setArrival] = useState(() => toLocalDateTimeInput(new Date())); const [duration, setDuration] = useState(180); const [profile, setProfile] = useState<RecommendationProfile>("BALANCED"); const [maxWalk, setMaxWalk] = useState(15);
  const [result, setResult] = useState<RecommendationResponse | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [activeId, setActiveId] = useState<string | null>(null); const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const requestControllerRef = useRef<AbortController | null>(null);
  const invalidateResult = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
    setResult(null);
    setActiveId(null);
    setError(null);
  }, []);
  useEffect(() => () => {
    const controller = requestControllerRef.current;
    requestControllerRef.current = null;
    controller?.abort();
  }, []);
  const gpsPlace = useMemo<Place | null>(() => geo.value ? { id: "gps", name: "현재 위치", address: `GPS 좌표 · 정확도 약 ±${geo.value.accuracyMeters}m`, latitude: geo.value.latitude, longitude: geo.value.longitude, category: "GPS", source: "GPS" } : null, [geo.value]);
  const useGps = useCallback(() => { if (gpsPlace) { invalidateResult(); setOrigin(gpsPlace); } }, [gpsPlace, invalidateResult]);
  useEffect(() => { if (geo.status === "granted" && gpsPlace) useGps(); }, [geo.status, gpsPlace, useGps]);
  const recommendations = result?.recommendations ?? []; const active = recommendations.find(item => item.id === activeId) ?? recommendations[0] ?? null;
  const ready = Boolean(origin && destination);

  const recommend = async () => {
    if (!origin || !destination) { setError("출발지와 목적지를 모두 선택해 주세요."); return; }
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true); setError(null);
    try {
      const requestBody = { origin: { latitude: origin.latitude, longitude: origin.longitude }, destination, arrivalAt: localInputToIso(arrival), durationMinutes: duration, profile, maxWalkMinutes: maxWalk };
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: controller.signal });
      const payload = await response.json().catch(() => null) as RecommendationResponse | null;
      if (!response.ok || !payload || !Array.isArray(payload.recommendations)) throw new Error("추천 결과를 불러오지 못했습니다.");
      if (payload.recommendations.length === 0) throw new Error("조건에 맞는 추천 주차장을 찾지 못했습니다.");
      if (requestControllerRef.current !== controller || controller.signal.aborted) return;
      setResult(payload); setActiveId(payload.recommendations[0]?.id ?? null); setMobileView("list");
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error && reason.message === "조건에 맞는 추천 주차장을 찾지 못했습니다." ? reason.message : "추천 결과를 불러오지 못했습니다.");
    } finally {
      if (requestControllerRef.current === controller) { requestControllerRef.current = null; setLoading(false); }
    }
  };
  const demo = () => { invalidateResult(); setOrigin(cityHall); setDestination(coex); setArrival(toLocalDateTimeInput(new Date(Date.now() + 30 * 60_000))); setDuration(180); setProfile("BALANCED"); };
  const selectDestination = (place: Place) => { invalidateResult(); setDestination(place); };
  const activate = useCallback((id: string) => setActiveId(id), []);

  return <main>
    <section className="hero"><div className="container hero-grid"><div><Badge tone="info"><Sparkles size={14} /> 카카오맵 · 네이버지도 동시 지원</Badge><h1>목적지만 정하면,<br /><em>주차장은 알아서 비교.</em></h1><p>GPS 출발지와 목적지를 기준으로 빈자리, 요금, 이동시간을 비교하고 카카오내비 또는 네이버지도로 바로 출발합니다.</p><div className="hero-features"><span><LocateFixed size={17} /> GPS 현재 위치</span><span><MapPinned size={17} /> 지도 공급자 전환</span><span><Navigation size={17} /> 두 네비 앱 연동</span></div></div><div className="hero-flow"><div><b>01</b><span><strong>출발·목적지</strong><small>GPS 또는 장소검색</small></span></div><ArrowRight /><div><b>02</b><span><strong>상위 3곳 비교</strong><small>거리·요금·빈자리</small></span></div><ArrowRight /><div><b>03</b><span><strong>지도 선택·출발</strong><small>카카오 또는 네이버</small></span></div></div></div></section>

    <section className="planner"><div className={`container planner-grid${result ? ` planner-grid--results planner-grid--mobile-${mobileView}` : ""}`}>{result ? <RecommendationPanel result={result} activeId={activeId} mobileView={mobileView} onSelect={activate} onMobileViewChange={setMobileView} onEdit={invalidateResult} /> : <div className="control-card"><div className="control-head"><div><span className="eyebrow">PARKING PLANNER</span><h2>방문 계획 입력</h2></div><Button variant="ghost" size="sm" onClick={demo}><RefreshCw size={15} /> 예시 채우기</Button></div>
      <section className="step"><div className="step-title"><b>1</b><span><strong>출발지</strong><small>현재 위치 또는 직접 검색</small></span></div><div className={`gps-box${origin?.source === "GPS" ? " is-selected" : ""}`}><span className="gps-icon"><LocateFixed /></span><div><strong>내 위치로 출발</strong><p>{geo.error || (geo.status === "requesting" || geo.status === "checking" ? "GPS를 확인하고 있습니다." : geo.value ? `현재 위치 확인 완료 · ±${geo.value.accuracyMeters}m` : "버튼을 눌러 위치 권한을 요청합니다.")}</p></div>{geo.value ? <><Button variant="soft" size="sm" onClick={useGps}>{origin?.source === "GPS" ? "사용 중" : "출발지로 사용"}</Button><Button variant="ghost" size="icon" onClick={() => { invalidateResult(); geo.refreshPosition(); }} aria-label="위치 새로고침"><RefreshCw size={17} /></Button></> : <Button variant="secondary" size="sm" onClick={() => { invalidateResult(); geo.requestPosition(); }} disabled={geo.status === "requesting" || geo.status === "checking" || geo.status === "unsupported" || geo.status === "insecure"}>{geo.status === "requesting" || geo.status === "checking" ? <LoaderCircle className="spin" size={17} /> : <LocateFixed size={17} />} 현재 위치 사용</Button>}</div><div className="divider"><span>또는</span></div><PlaceSearch label="출발지 직접 검색" placeholder="예: 서울역, 강남구청" selected={origin} onSelect={place => { invalidateResult(); setOrigin(place); }} onClear={() => { invalidateResult(); setOrigin(null); }} hint="GPS 권한이 없어도 사용할 수 있습니다." /></section>
      <section className="step"><div className="step-title"><b>2</b><span><strong>목적지</strong><small>최종 방문 장소</small></span></div><PlaceSearch label="목적지 검색" placeholder="예: 코엑스, 더현대 서울" selected={destination} onSelect={selectDestination} onClear={() => { invalidateResult(); setDestination(null); }} /><div className="quick-places">{DEMO_PLACES.slice(0, 5).map(place => <button type="button" key={place.id} onClick={() => selectDestination(place)}>{place.name}</button>)}</div></section>
      <section className="step step--last"><div className="step-title"><b>3</b><span><strong>추천 조건</strong><small>체류시간과 우선순위</small></span></div><div className="options"><div className="options-title"><SlidersHorizontal size={17} /><strong>방문 조건</strong></div><div className="option-grid"><label>도착 예정<div className="inline"><input type="datetime-local" value={arrival} onChange={event => { invalidateResult(); setArrival(event.target.value); }} /><Button variant="soft" size="sm" onClick={() => { invalidateResult(); setArrival(toLocalDateTimeInput(new Date())); }}>지금</Button></div></label><label>예상 체류<select value={duration} onChange={event => { invalidateResult(); setDuration(Number(event.target.value)); }}><option value={60}>1시간</option><option value={120}>2시간</option><option value={180}>3시간</option><option value={240}>4시간</option><option value={360}>6시간</option></select></label></div><fieldset><legend>추천 기준</legend><div className="profiles">{profileItems.map(item => <label key={item.value} className={profile === item.value ? "is-selected" : ""}><input type="radio" name="profile" checked={profile === item.value} onChange={() => { invalidateResult(); setProfile(item.value); }} /><strong>{item.label}</strong><small>{item.sub}</small></label>)}</div></fieldset><label className="walk"><span>최대 도보시간 <strong>{maxWalk}분</strong></span><input type="range" min={5} max={25} value={maxWalk} onChange={event => { invalidateResult(); setMaxWalk(Number(event.target.value)); }} /></label></div></section>
      {error ? <div className="form-error"><CircleAlert size={17} /> {error}</div> : null}<Button size="lg" full onClick={recommend} disabled={!ready || loading}>{loading ? <LoaderCircle className="spin" /> : <SearchCheck />} {loading ? "주차장을 비교하는 중" : "추천 주차장 찾기"}</Button>{!ready ? <p className="button-hint">출발지와 목적지를 선택하면 활성화됩니다.</p> : null}
    </div>}<div className="preview-column"><MapPanel origin={origin} destination={destination} recommendations={recommendations} activeId={activeId} onSelect={activate} />{result && active ? <div className="active-route"><div><small>{active.rank}순위</small><strong>{active.name}</strong><span>자동차 {active.driveMinutes}분 · 도보 {active.walkMinutes}분</span></div><NavigationButtons parking={active} compact /></div> : null}<div className="route-summary"><div><Route /><span><strong>{origin?.name || "출발지 미선택"}</strong><small>출발</small></span></div><ArrowRight /><div><Map /><span><strong>{destination?.name || "목적지 미선택"}</strong><small>도착</small></span></div></div>{!result ? <div className="principles"><div><BadgeCheck /><span><strong>위치 최소 사용</strong><small>GPS 좌표를 저장하지 않음</small></span></div><div><Database /><span><strong>데이터 상태 표시</strong><small>실시간·지연·데모 구분</small></span></div><div><CarFront /><span><strong>네비 앱 위임</strong><small>카카오·네이버 연결</small></span></div></div> : null}</div></div></section>

    <section className="how"><div className="container"><div className="section-heading"><span className="eyebrow">HOW IT WORKS</span><h2>지도는 선택하고, 추천 기준은 동일하게</h2><p>카카오맵과 네이버지도는 표시·길안내 공급자이고, 추천점수는 동일한 거리·요금·빈자리 데이터로 계산됩니다.</p></div><div className="how-grid"><div><ParkingCircle /><strong>빈자리 가능성</strong><p>현재 가용면과 도착시간의 불확실성을 반영합니다.</p></div><div><Route /><strong>이동 편의</strong><p>자동차 이동시간과 목적지까지 도보를 함께 봅니다.</p></div><div><MapPinned /><strong>지도 공급자 선택</strong><p>카카오맵과 네이버 Web Dynamic Map을 화면에서 전환합니다.</p></div></div></div></section>

    <div className="mobile-bar">{active && result ? <><div><small>{active.rank}순위</small><strong>{active.name}</strong></div><NavigationButtons parking={active} compact /></> : <Button size="lg" full onClick={recommend} disabled={!ready || loading}>{loading ? <LoaderCircle className="spin" /> : <SearchCheck />} 추천받기</Button>}</div>
  </main>;
}
