export function batchStatusLabel(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("complete")) return "Klar";
  if (value.includes("run") || value.includes("process")) return "Körs";
  if (value.includes("cancel")) return "Avbruten";
  if (value.includes("fail")) return "Misslyckad";
  return status;
}

export function isBatchTerminal(status: string): boolean {
  const value = status.toLowerCase();
  return value.includes("complete") || value.includes("cancel") || value.includes("fail");
}

export function isBatchComplete(status: string): boolean {
  return String(status || "").toLowerCase().includes("complete");
}
