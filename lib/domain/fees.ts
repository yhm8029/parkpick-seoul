import type { FeeRule } from "@/lib/types";

export function calculateParkingFee(durationMinutes: number, rule: FeeRule): number | null {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  if (rule.isFree) return 0;
  const { baseMinutes, baseFee, additionalMinutes, additionalFee, dailyMaximumFee } = rule;
  if (
    baseMinutes === null || baseMinutes === undefined || baseMinutes <= 0 ||
    baseFee === null || baseFee === undefined ||
    additionalMinutes === null || additionalMinutes === undefined || additionalMinutes <= 0 ||
    additionalFee === null || additionalFee === undefined
  ) return null;

  let fee = durationMinutes <= baseMinutes
    ? baseFee
    : baseFee + Math.ceil((durationMinutes - baseMinutes) / additionalMinutes) * additionalFee;
  if (dailyMaximumFee && dailyMaximumFee > 0) fee = Math.min(fee, dailyMaximumFee);
  return Math.max(0, Math.round(fee));
}
