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
import { clamp, localInputToIso, toLocalDateTimeInput } from "@/lib/utils";

const cityHall = DEMO_PLACES.find(place => place.id === "city-hall") as Place;
const coex = DEMO_PLACES.find(place => place.id === "coex") as Place;
const profileItems: Array<{ value: RecommendationProfile; label: string; sub: string }> = [
  { value: "BALANCED", label: "균형", sub: "빈자리·거리·요금" },
  { value: "CHEAP", label: "저렴", sub: "주차비 우선" },
  { value: "NEAR", label: "가까움", sub: "도보 우선" },
  { value: "CERTAIN", label: "주차확실", sub: "만차위험 최소" }
];

const PROFILE_SELECTOR_ENABLED = false;

type DistanceMode = "AUTO" | "MANUAL";
type DraftRevision = number;

function clampManualDistance(value: number): number {
  if (!Number.isFinite(value)) return 1_000;
  const rounded = Math.round(value / 50) * 50;
  return clamp(rounded, 50, 1_000);
}

function manualFromEffective(meters: number | null | undefined): number {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0) return 1_000;
  return clampManualDistance(meters);
}

export function AppShell() {
  const geo = useGeolocation();
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [arrival, setArrival] = useState(() => toLocalDateTimeInput(new Date()));
  const [duration, setDuration] = useState(180);
  const [profile, setProfile] = useState<RecommendationProfile>("BALANCED");
  const [distanceMode, setDistanceMode] = useState<DistanceMode>("AUTO");
  const [manualDistance, setManualDistance] = useState(1_000);
  const [editing, setEditing] = useState(false);
  const [appliedOrigin, setAppliedOrigin] = useState<Place | null>(null);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [retainedResult, setRetainedResult] = useState(false);
  const [manualDistanceTouched, setManualDistanceTouched] = useState(false);
  const [emptyDistance, setEmptyDistance] = useState(false);
  const [, setDraftRevision] = useState<DraftRevision>(0);
  const draftRevisionRef = useRef<DraftRevision>(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const cancelInFlight = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
  }, []);

  const beginEdit = useCallback(() => {
    cancelInFlight();
    setEditing(true);
    setError(null);
    setEmptyDistance(false);
  }, [cancelInFlight]);

  useEffect(() => {
    if (result) resultHeadingRef.current?.focus();
  }, [result]);
  useEffect(() => () => {
    const controller = requestControllerRef.current;
    requestControllerRef.current = null;
    controller?.abort();
  }, []);

  const gpsPlace = useMemo<Place | null>(() => geo.value ? { id: "gps", name: "현재 위치", address: `GPS 좌표 · 정확도 약 ±${geo.value.accuracyMeters}m`, latitude: geo.value.latitude, longitude: geo.value.longitude, category: "GPS", source: "GPS" } : null, [geo.value]);
  const applyGps = useCallback(() => { if (gpsPlace) { cancelInFlight(); setOrigin(gpsPlace); } }, [gpsPlace, cancelInFlight]);
  useEffect(() => {
    if (geo.status !== "granted" || !gpsPlace) return;
    const timer = window.setTimeout(applyGps, 0);
    return () => window.clearTimeout(timer);
  }, [geo.status, gpsPlace, applyGps]);

  const recommendations = result?.recommendations ?? [];
  const active = recommendations.find(item => item.id === activeId) ?? recommendations[0] ?? null;
  const ready = Boolean(origin && destination);
  const showForm = !result || editing;
  const mapOrigin = appliedOrigin ?? origin;
  const mapDestination = result ? result.destination : destination;
  const mapRecommendations = result ? recommendations : [];
  const mapActiveId = result ? (active?.id ?? null) : null;

  const bumpDraftRevision = useCallback(() => {
    draftRevisionRef.current = draftRevisionRef.current + 1;
    setDraftRevision(draftRevisionRef.current);
  }, []);

  const onInputChange = useCallback(() => {
    cancelInFlight();
    bumpDraftRevision();
  }, [cancelInFlight, bumpDraftRevision]);

  const onSliderChange = useCallback((next: number) => {
    setManualDistance(clampManualDistance(next));
    bumpDraftRevision();
  }, [bumpDraftRevision]);

  const onSwitchMode = useCallback((next: DistanceMode) => {
    setDistanceMode(next);
    if (next === "MANUAL" && !manualDistanceTouched) {
      setManualDistance(manualFromEffective(result?.effectiveDistanceMeters));
      setManualDistanceTouched(true);
    }
    bumpDraftRevision();
  }, [manualDistanceTouched, result?.effectiveDistanceMeters, bumpDraftRevision]);

  const recommend = async () => {
    if (!origin || !destination) { setError("출발지와 목적지를 모두 선택해 주세요."); return; }
    cancelInFlight();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    activeControllerRef.current = controller;
    const submitRevision = draftRevisionRef.current;
    const isStale = () => requestControllerRef.current !== controller || controller.signal.aborted || draftRevisionRef.current !== submitRevision;
    setLoading(true);
    setError(null);
    setEmptyDistance(false);
    const manualDistanceSnapshot = clampManualDistance(manualDistance);
    const distanceSelection = distanceMode === "MANUAL"
      ? { distanceMode: "MANUAL" as const, maxDistanceMeters: manualDistanceSnapshot }
      : { distanceMode: "AUTO" as const };
    const requestBody = {
      origin: { latitude: origin.latitude, longitude: origin.longitude },
      destination,
      arrivalAt: localInputToIso(arrival),
      durationMinutes: duration,
      profile,
      ...distanceSelection
    };
    try {
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: controller.signal });
      if (isStale()) return;
      const payload = await response.json().catch(() => null) as RecommendationResponse | null;
      if (isStale()) return;
      if (!response.ok || !payload || !Array.isArray(payload.recommendations)) {
        if (result) {
          setRetainedResult(true);
          setError(null);
        } else {
          setError("추천 결과를 불러오지 못했습니다.");
        }
        return;
      }
      const snapshotOrigin: Place = { ...origin };
      const retainedActiveId = activeId && payload.recommendations.some(item => item.id === activeId) ? activeId : null;
      const nextActive = retainedActiveId ?? payload.recommendations[0]?.id ?? null;
      setAppliedOrigin(snapshotOrigin);
      setResult(payload);
      setActiveId(nextActive);
      setMobileView("list");
      setEditing(false);
      setError(null);
      setRetainedResult(false);
      if (payload.recommendations.length === 0) {
        setEmptyDistance(true);
        setActiveId(null);
        setEditing(true);
      }
    } catch (reason) {
      if (isStale()) return;
      if (result) {
        setRetainedResult(true);
        setError(null);
      } else {
        setError(reason instanceof Error ? reason.message : "추천 결과를 불러오지 못했습니다.");
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  };

  const demo = () => {
    cancelInFlight();
    setOrigin(cityHall);
    setDestination(coex);
    setArrival(toLocalDateTimeInput(new Date(Date.now() + 30 * 60_000)));
    setDuration(180);
    setProfile("BALANCED");
    bumpDraftRevision();
  };
  const selectOrigin = (place: Place) => { cancelInFlight(); setOrigin(place); bumpDraftRevision(); };
  const clearOrigin = () => { cancelInFlight(); setOrigin(null); bumpDraftRevision(); };
  const selectDestination = (place: Place) => { cancelInFlight(); setDestination(place); bumpDraftRevision(); };
  const clearDestination = () => { cancelInFlight(); setDestination(null); bumpDraftRevision(); };
  const activate = useCallback((id: string) => setActiveId(id), []);

  return <main>
    <section className="hero"><div className="container hero-grid"><div><Badge tone="info"><Sparkles size={14} /> 네이버지도 기반</Badge><h1>목적지만 정하면,<br /><em>주차장은 알아서 비교.</em></h1><p>GPS 출발지와 목적지를 기준으로 빈자리, 요금, 이동시간을 비교하고 네이버지도로 바로 출발합니다.</p><div className="hero-features"><span><LocateFixed size={17} /> GPS 현재 위치</span><span><MapPinned size={17} /> 네이버 지도</span><span><Navigation size={17} /> 네이버 길안내</span></div></div><div className="hero-flow"><div><b>01</b><span><strong>출발·목적지</strong><small>GPS 또는 장소검색</small></span></div><ArrowRight /><div><b>02</b><span><strong>상위 3곳 비교</strong><small>거리·요금·빈자리</small></span></div><ArrowRight /><div><b>03</b><span><strong>경로 확인·출발</strong><small>네이버지도</small></span></div></div></div></section>

    <section className="planner"><div className={`container planner-grid${result ? ` planner-grid--results planner-grid--mobile-${result && !editing ? mobileView : "map"}` : ""}`}>{showForm ? <div className="control-card"><div className="control-head"><div><span className="eyebrow">PARKING PLANNER</span><h2>방문 계획 입력</h2></div><Button variant="ghost" size="sm" onClick={demo}><RefreshCw size={15} /> 예시 채우기</Button></div>
      <section className="step"><div className="step-title"><b>1</b><span><strong>출발지</strong><small>현재 위치 또는 직접 검색</small></span></div><div className={`gps-box${origin?.source === "GPS" ? " is-selected" : ""}`}><span className="gps-icon"><LocateFixed /></span><div><strong>내 위치로 출발</strong><p>{geo.error || (geo.status === "requesting" || geo.status === "checking" ? "GPS를 확인하고 있습니다." : geo.value ? `현재 위치 확인 완료 · ±${geo.value.accuracyMeters}m` : "버튼을 눌러 위치 권한을 요청합니다.")}</p></div>{geo.value ? <><Button variant="soft" size="sm" onClick={applyGps}>{origin?.source === "GPS" ? "사용 중" : "출발지로 사용"}</Button><Button variant="ghost" size="icon" onClick={() => { onInputChange(); geo.refreshPosition(); }} aria-label="위치 새로고침"><RefreshCw size={17} /></Button></> : <Button variant="secondary" size="sm" onClick={() => { onInputChange(); geo.requestPosition(); }} disabled={geo.status === "requesting" || geo.status === "checking" || geo.status === "unsupported" || geo.status === "insecure"}>{geo.status === "requesting" || geo.status === "checking" ? <LoaderCircle className="spin" size={17} /> : <LocateFixed size={17} />} 현재 위치 사용</Button>}</div><div className="divider"><span>또는</span></div><PlaceSearch label="출발지 직접 검색" placeholder="예: 서울역, 강남구청" selected={origin} onSelect={selectOrigin} onClear={clearOrigin} hint="GPS 권한이 없어도 사용할 수 있습니다." /></section>
      <section className="step"><div className="step-title"><b>2</b><span><strong>목적지</strong><small>최종 방문 장소</small></span></div><PlaceSearch label="목적지 검색" placeholder="예: 코엑스, 더현대 서울" selected={destination} onSelect={selectDestination} onClear={clearDestination} /></section>
      <section className="step step--last"><div className="step-title"><b>3</b><span><strong>추천 조건</strong><small>체류시간과 탐색 반경</small></span></div><div className="options"><div className="options-title"><SlidersHorizontal size={17} /><strong>방문 조건</strong></div><div className="option-grid"><label>도착 예정시간<div className="inline"><input type="datetime-local" value={arrival} onChange={event => { onInputChange(); setArrival(event.target.value); }} /><Button className="now-button" variant="soft" size="sm" onClick={() => { onInputChange(); setArrival(toLocalDateTimeInput(new Date())); }}>지금</Button></div></label><label>예상 체류 시간<select value={duration} onChange={event => { onInputChange(); setDuration(Number(event.target.value)); }}><option value={60}>1시간</option><option value={120}>2시간</option><option value={180}>3시간</option><option value={240}>4시간</option><option value={360}>6시간</option></select></label></div>{PROFILE_SELECTOR_ENABLED ? <fieldset><legend>추천 기준</legend><div className="profiles">{profileItems.map(item => <label key={item.value} className={profile === item.value ? "is-selected" : ""}><input type="radio" name="profile" checked={profile === item.value} onChange={() => { onInputChange(); setProfile(item.value); }} /><strong>{item.label}</strong><small>{item.sub}</small></label>)}</div></fieldset> : null}<div className="distance"><div className="distance-toggle" role="group" aria-label="탐색 반경"><button type="button" className={distanceMode === "AUTO" ? "is-selected" : ""} onClick={() => onSwitchMode("AUTO")}>AUTO</button><button type="button" className={distanceMode === "MANUAL" ? "is-selected" : ""} onClick={() => onSwitchMode("MANUAL")}>MANUAL</button></div>{distanceMode === "AUTO" ? <p className="distance-hint">가까운 공영주차장 3곳 자동 탐색</p> : <label className="distance-slider"><span>최대 거리 <strong>{manualDistance}m</strong></span><input type="range" min={50} max={1_000} step={50} value={manualDistance} onChange={event => onSliderChange(Number(event.target.value))} aria-label="최대 거리" /></label>}</div></div></section>
      {retainedResult && result ? <div className="form-notice" role="status"><CircleAlert size={17} /> <span>새 추천을 가져오지 못해 이전 추천 결과를 유지합니다.</span></div> : null}
      {error ? <div className="form-error" role="alert"><CircleAlert size={17} /> <span>{error}</span></div> : null}
      {emptyDistance ? <div className="form-notice" role="status"><CircleAlert size={17} /> <span>선택한 거리 안에서 공영주차장을 찾지 못했습니다.</span></div> : null}
      <Button size="lg" full onClick={recommend} disabled={!ready || loading}>{loading ? <LoaderCircle className="spin" /> : <SearchCheck />} {loading ? "주차장을 비교하는 중" : "추천 주차장 찾기"}</Button>{!ready ? <p className="button-hint">출발지와 목적지를 선택하면 활성화됩니다.</p> : null}
</div> : null}{result && appliedOrigin && !editing ? <RecommendationPanel headingRef={resultHeadingRef} result={result} activeId={activeId} mobileView={mobileView} onSelect={activate} onMobileViewChange={setMobileView} onEdit={beginEdit} appliedOrigin={appliedOrigin} /> : null}<div className="preview-column"><MapPanel origin={mapOrigin} destination={mapDestination} recommendations={mapRecommendations} activeId={mapActiveId} onSelect={activate} />{result && appliedOrigin && !editing && active ? <div className="active-route"><div><small>{active.rank}순위</small><strong>{active.name}</strong><span>출발지→주차장 자동차 {active.driveMinutes}분 · 주차장→목적지 도보 {active.walkMinutes}분</span></div><NavigationButtons origin={appliedOrigin} parking={active} compact /></div> : null}<div className="route-summary"><div><Route /><span><strong>{(result ? mapOrigin?.name : origin?.name) || "출발지 미선택"}</strong><small>출발</small></span></div><ArrowRight /><div><Map /><span><strong>{mapDestination?.name || "목적지 미선택"}</strong><small>도착</small></span></div></div>{!result ? <div className="principles"><div><BadgeCheck /><span><strong>위치 최소 사용</strong><small>GPS 좌표를 저장하지 않음</small></span></div><div><Database /><span><strong>데이터 상태 표시</strong><small>실시간·지연·데모 구분</small></span></div><div><CarFront /><span><strong>네이버 길안내</strong><small>네이버지도 연결</small></span></div></div> : null}</div></div></section>

    <section className="how"><div className="container"><div className="section-heading"><span className="eyebrow">HOW IT WORKS</span><h2>네이버 경로와 동일한 추천 기준</h2><p>네이버지도는 표시·길안내를 맡고, 추천점수는 거리·요금·빈자리 데이터를 함께 반영합니다.</p></div><div className="how-grid"><div><ParkingCircle /><strong>빈자리 가능성</strong><p>현재 가용면과 도착시간의 불확실성을 반영합니다.</p></div><div><Route /><strong>이동 편의</strong><p>출발지부터 주차장까지 자동차와 목적지까지 도보를 구분해 보여줍니다.</p></div><div><MapPinned /><strong>네이버지도</strong><p>현재 교통 기준 경로와 네이버 길안내로 연결합니다.</p></div></div></div></section>

    <div className="mobile-bar">{active && result && appliedOrigin && !editing ? <><div><small>{active.rank}순위</small><strong>{active.name}</strong></div><NavigationButtons origin={appliedOrigin} parking={active} compact /></> : <Button size="lg" full onClick={recommend} disabled={!ready || loading}>{loading ? <LoaderCircle className="spin" /> : <SearchCheck />} 추천받기</Button>}</div>
  </main>;
}
