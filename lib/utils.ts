import type { FeeRule } from "@/lib/types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function numberFrom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSeoulDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const direct = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}+09:00`);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 12) return null;
  const [y, m, d, h, min, s] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8), digits.slice(8, 10), digits.slice(10, 12), digits.slice(12, 14) || "00"];
  const parsed = new Date(`${y}-${m}-${d}T${h}:${min}:${s}+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type FeeUnit = { minutes: number; fee: number };

function normalizeUnit(minutes: unknown, fee: unknown): FeeUnit | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0) return null;
  return { minutes, fee };
}

export function formatFeeRateLabel(rule: FeeRule): string {
  if (rule.isFree) return "무료";
  const base = normalizeUnit(rule.baseMinutes, rule.baseFee);
  const additional = normalizeUnit(rule.additionalMinutes, rule.additionalFee);
  if (base && additional) {
    if (base.minutes === additional.minutes && base.fee === additional.fee) {
      return `${base.minutes}분당 ${formatCurrency(base.fee)}`;
    }
    return `기본 ${base.minutes}분 ${formatCurrency(base.fee)} · 추가 ${additional.minutes}분 ${formatCurrency(additional.fee)}`;
  }
  if (base) return `기본 ${base.minutes}분 ${formatCurrency(base.fee)}`;
  if (additional) return `추가 ${additional.minutes}분 ${formatCurrency(additional.fee)}`;
  return "요금 기준 확인 필요";
}

export function formatCurrency(value: number | null): string {
  if (value === null) return "요금 확인 필요";
  if (value === 0) return "무료";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function toLocalDateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function localInputToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
