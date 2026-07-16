import { t } from "@/lib/i18n";

export function batchStatusLabel(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("complete")) return t("content:batch.status.complete");
  if (value.includes("run") || value.includes("process")) return t("content:batch.status.running");
  if (value.includes("cancel")) return t("content:batch.status.cancelled");
  if (value.includes("fail")) return t("content:batch.status.failed");
  return status;
}

export function isBatchTerminal(status: string): boolean {
  const value = status.toLowerCase();
  return value.includes("complete") || value.includes("cancel") || value.includes("fail");
}

export function isBatchComplete(status: string): boolean {
  return String(status || "").toLowerCase().includes("complete");
}
