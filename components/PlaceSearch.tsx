"use client";

import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Place } from "@/lib/types";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";

export function PlaceSearch({ label, placeholder, selected, onSelect, onClear, hint }: { label: string; placeholder: string; selected: Place | null; onSelect: (place: Place) => void; onClear: () => void; hint?: string }) {
  const id = useId(); const root = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(selected?.name ?? ""); const [results, setResults] = useState<Place[]>([]); const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false); const [active, setActive] = useState(-1); const [mode, setMode] = useState<"LIVE" | "DEMO" | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [previousSelected, setPreviousSelected] = useState(selected);
  if (selected !== previousSelected) {
    const keepTypedQuery = previousSelected !== null && selected === null && query !== previousSelected.name;
    setPreviousSelected(selected);
    if (!keepTypedQuery) setQuery(selected?.name ?? "");
    setResults([]); setOpen(false); setLoading(false); setActive(-1); setMode(null); setMessage(null);
  }
  useEffect(() => { const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside); }, []);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === selected?.name) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/places/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const payload = await response.json() as { places: Place[]; mode: "LIVE" | "DEMO"; notice: string };
        setResults(payload.places); setMode(payload.mode); setMessage(payload.places.length ? payload.notice : "검색 결과가 없습니다."); setOpen(true); setActive(payload.places.length ? 0 : -1);
      } catch (error) { if ((error as Error).name !== "AbortError") { setResults([]); setMessage("장소검색에 실패했습니다."); setOpen(true); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected?.name]);
  const choose = (place: Place) => { onSelect(place); setQuery(place.name); setOpen(false); setResults([]); };
  const keydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(value => Math.min(results.length - 1, value + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(value => Math.max(0, value - 1)); }
    else if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
    else if (event.key === "Escape") setOpen(false);
  };
  return <div className="place-search" ref={root}>
    <label htmlFor={id}>{label}</label>
    <div className={`search-control${selected ? " is-selected" : ""}`}><Search size={19} /><input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" placeholder={placeholder} value={query} onKeyDown={keydown} onFocus={() => results.length && setOpen(true)} onChange={event => { const nextQuery = event.target.value; setQuery(nextQuery); if (nextQuery.trim().length < 2) { setResults([]); setOpen(false); setLoading(false); setActive(-1); setMode(null); setMessage(null); } if (selected && nextQuery !== selected.name) onClear(); }} />{loading ? <LoaderCircle className="spin" size={18} /> : query ? <Button variant="ghost" size="icon" onClick={() => { setQuery(""); setResults([]); setOpen(false); setLoading(false); setActive(-1); setMode(null); setMessage(null); onClear(); }} aria-label={`${label} 지우기`}><X size={17} /></Button> : null}</div>
    {selected ? <p className="selected-place"><MapPin size={14} /> {selected.address}{selected.source === "GPS" ? <Badge tone="success">GPS</Badge> : null}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    {open ? <div className="search-popover"><div className="search-popover__head"><span>{results.length}개 장소</span>{mode === "DEMO" ? <Badge tone="demo">데모</Badge> : <Badge tone="success">실검색</Badge>}</div><ul id={`${id}-list`} role="listbox">{results.map((place, index) => <li key={place.id}><button id={`${id}-${index}`} type="button" role="option" aria-selected={active === index} className={active === index ? "is-active" : ""} onMouseEnter={() => setActive(index)} onClick={() => choose(place)}><span><MapPin size={17} /></span><div><strong>{place.name}</strong><small>{place.address}</small></div><em>{place.category}</em></button></li>)}</ul>{message ? <p className="search-message">{message}</p> : null}</div> : null}
  </div>;
}
