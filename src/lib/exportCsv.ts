/**
 * CSV export utilities.
 *
 * Usage:
 *   import { downloadCsv, accountsToCsv } from "@/lib/exportCsv";
 *   downloadCsv(accountsToCsv(accounts), "konton.csv");
 */

type CsvRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadCsv(content: string, filename: string) {
  const bom = "\uFEFF"; // UTF-8 BOM so Excel reads Swedish chars correctly
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function accountsToCsv(accounts: {
  username: string;
  displayName?: string;
  platform: string;
  connectedAt: string;
  stats?: {
    followersCount?: number;
    mediaCount?: number;
    engagementRate?: number;
  };
}[]): string {
  const rows: CsvRow[] = accounts.map((a) => ({
    Plattform: a.platform,
    Konto: a.displayName ?? a.username,
    Användarnamn: a.username,
    Följare: a.stats?.followersCount ?? "",
    Inlägg: a.stats?.mediaCount ?? "",
    "Engagemang (%)": a.stats?.engagementRate ?? "",
    "Ansluten sedan": a.connectedAt ? a.connectedAt.slice(0, 10) : "",
  }));
  return toCsv(rows);
}

export function connectionsToCsv(connections: {
  platform: string;
  username: string;
  displayName?: string;
  health: string;
  connectedAt: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}[]): string {
  const rows: CsvRow[] = connections.map((c) => ({
    Plattform: c.platform,
    Konto: c.displayName ?? c.username,
    Status: c.health,
    "Ansluten sedan": c.connectedAt ? c.connectedAt.slice(0, 10) : "",
    "Senast synkad": c.lastSyncedAt ? c.lastSyncedAt.slice(0, 10) : "",
    Fel: c.lastSyncError ?? "",
  }));
  return toCsv(rows);
}

export function customersToCsv(columns: string[], rows: Record<string, string>[]): string {
  if (columns.length === 0 || rows.length === 0) return "";
  const csvRows: CsvRow[] = rows.map((row) => {
    const out: CsvRow = {};
    for (const col of columns) out[col] = row[col] ?? "";
    return out;
  });
  return toCsv(csvRows);
}

export function shopifyOrdersToCsv(
  orders: {
    name: string;
    customer: string | null;
    email: string;
    lineItemCount: number;
    status: string;
    fulfillment: string;
    total: number;
    currency: string;
    createdAt: string;
  }[]
): string {
  const rows: CsvRow[] = orders.map((o) => ({
    Order: o.name,
    Customer: o.customer || o.email || "",
    Items: o.lineItemCount,
    Payment: o.status,
    Fulfillment: o.fulfillment || "unfulfilled",
    Total: o.total,
    Currency: o.currency,
    Date: o.createdAt ? o.createdAt.slice(0, 10) : "",
  }));
  return toCsv(rows);
}
