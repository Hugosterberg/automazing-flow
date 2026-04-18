import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { m } from "framer-motion";
import { Users, Upload, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useAccounts } from "@/context/AccountsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CustomerRow = Record<string, string>;
type CustomersStoragePayload = { columns: string[]; rows: CustomerRow[]; fileName: string };

function normalizeCellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * Parse a customer file (CSV/XLSX/XLS) into columns + rows.
 *
 * `xlsx` is loaded lazily: it is ~340 kB raw / ~117 kB gzipped and is only
 * ever needed when the user actually uploads a file. Keeping it out of the
 * route's main chunk makes the initial render of /customers instant.
 */
async function parseCustomerFile(
  file: File
): Promise<{ columns: string[]; rows: CustomerRow[] }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The file has no sheets.");
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });

  if (rawRows.length === 0) {
    return { columns: [], rows: [] };
  }

  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      const header = key.trim();
      if (!header || seen.has(header)) continue;
      seen.add(header);
      columns.push(header);
    }
  }

  const rows: CustomerRow[] = rawRows.map((row) => {
    const mapped: CustomerRow = {};
    for (const col of columns) {
      mapped[col] = normalizeCellValue(row[col]);
    }
    return mapped;
  });

  return { columns, rows };
}

export default function CustomersPage() {
  const { activeProfileId } = useAccounts();
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const storageKey = useMemo(
    () => `automazing-customers-upload:${activeProfileId || "default"}`,
    [activeProfileId]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setColumns([]);
        setRows([]);
        setFileName("");
        return;
      }
      const parsed = JSON.parse(raw) as CustomersStoragePayload;
      setColumns(Array.isArray(parsed.columns) ? parsed.columns : []);
      setRows(Array.isArray(parsed.rows) ? parsed.rows : []);
      setFileName(typeof parsed.fileName === "string" ? parsed.fileName : "");
    } catch {
      setColumns([]);
      setRows([]);
      setFileName("");
    }
  }, [storageKey]);

  useEffect(() => {
    const payload: CustomersStoragePayload = { columns, rows, fileName };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [columns, rows, fileName, storageKey]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!["csv", "xlsx", "xls"].includes(extension)) {
        throw new Error("Only CSV or Excel files are supported.");
      }
      const parsed = await parseCustomerFile(file);
      setColumns(parsed.columns);
      setRows(parsed.rows);
      setFileName(file.name);
    } catch (e) {
      setColumns([]);
      setRows([]);
      setFileName("");
      setError(e instanceof Error ? e.message : "Could not parse the file.");
    } finally {
      event.target.value = "";
    }
  }

  function clearData() {
    setColumns([]);
    setRows([]);
    setFileName("");
    setSearch("");
    setError(null);
    localStorage.removeItem(storageKey);
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => (row[col] || "").toLowerCase().includes(q))
    );
  }, [rows, columns, search]);

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        icon={Users}
        title="Customers"
        description="Upload a CSV or Excel file to view your full customer base in one table."
      />

      <m.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer file</CardTitle>
            <CardDescription>
              Supported formats: `.csv`, `.xlsx`, `.xls`
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex">
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="max-w-xs"
                  onChange={(e) => void handleFileChange(e)}
                />
              </label>
              <Button variant="outline" onClick={clearData} disabled={rows.length === 0 && !fileName}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
            {fileName && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Loaded file: {fileName}
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Customer base</CardTitle>
                <CardDescription>
                  {rows.length} customers loaded
                  {search.trim() ? ` · ${filteredRows.length} matching filter` : ""}
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search customer data..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {columns.length === 0 ? (
              <EmptyState
                icon={Upload}
                size="compact"
                title="No customers yet"
                description="Upload a customer file to see names, phone numbers, emails, addresses, age, and other known fields."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                        No matching customers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row, index) => (
                      <TableRow key={`row-${index}`}>
                        {columns.map((col) => (
                          <TableCell key={`${index}-${col}`} className="whitespace-nowrap">
                            {row[col] || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
}
