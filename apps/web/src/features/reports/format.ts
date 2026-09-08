import { trimDecimal } from "../catalog/format";

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

export function formatFreshnessTime(lastReceivedAt: string | null): string {
  return lastReceivedAt ? formatDateTime(lastReceivedAt) : "Nunca";
}

/** grossMarginPercent already arrives pre-multiplied by 100 (apps/api/src/reports.ts). */
export function formatPercent(value: string): string {
  return `${trimDecimal(value)}%`;
}
