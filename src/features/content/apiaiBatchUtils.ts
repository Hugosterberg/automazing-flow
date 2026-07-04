export function batchStatusLabel(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("complete")) return "Complete";
  if (value.includes("run") || value.includes("process")) return "Running";
  if (value.includes("cancel")) return "Cancelled";
  if (value.includes("fail")) return "Failed";
  return status;
}

export function isBatchTerminal(status: string): boolean {
  const value = status.toLowerCase();
  return value.includes("complete") || value.includes("cancel") || value.includes("fail");
}

export function isBatchComplete(status: string): boolean {
  return String(status || "").toLowerCase().includes("complete");
}
