import { useMemo, useState, type ChangeEvent } from "react";
import { m } from "framer-motion";
import { Users, Upload, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useAccounts } from "@/context/AccountsContext";
import { useProfileDocument } from "@/features/profile-documents";
import { CustomerInsightsCard } from "@/features/customers/CustomerInsightsCard";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpQueryBox, runCrmQuery } from "@/features/intelligence";
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

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

/**
 * Parse a customer CSV file into columns + rows.
 */
async function parseCustomerFile(
  file: File
): Promise<{ columns: string[]; rows: CustomerRow[] }> {
  const content = await file.text();
  const parsedRows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (parsedRows.length === 0) {
    return { columns: [], rows: [] };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const columns = headerRow.map((header, index) => header.trim() || `Column ${index + 1}`);

  const rows: CustomerRow[] = dataRows.map((row) => {
    const mapped: CustomerRow = {};
    columns.forEach((col, index) => {
      mapped[col] = normalizeCellValue(row[index]);
    });
    return mapped;
  });

  return { columns, rows };
}

export default function CustomersPage() {
  const { activeProfileId } = useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Uploaded customer data persists per business profile in the DB (synced
  // across devices). One-time migration reads the legacy per-profile key.
  const legacyKey = `automazing-customers-upload:${activeProfileId || "default"}`;
  const customersDoc = useProfileDocument<CustomersStoragePayload>(
    "customers",
    { columns: [], rows: [], fileName: "" },
    {
      legacyRead: () => {
        try {
          const raw = localStorage.getItem(legacyKey);
          return raw ? (JSON.parse(raw) as CustomersStoragePayload) : undefined;
        } catch {
          return undefined;
        }
      },
      legacyWrite: (_bpId, value) => {
        try {
          localStorage.setItem(legacyKey, JSON.stringify(value));
        } catch {
          /* ignore */
        }
      },
    },
  );
  const { columns, rows, fileName } = useMemo(() => {
    const d = customersDoc.data;
    return {
      columns: Array.isArray(d.columns) ? d.columns : [],
      rows: Array.isArray(d.rows) ? d.rows : [],
      fileName: typeof d.fileName === "string" ? d.fileName : "",
    };
  }, [customersDoc.data]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (extension !== "csv") {
        throw new Error("Only CSV files are supported.");
      }
      const parsed = await parseCustomerFile(file);
      customersDoc.save({ columns: parsed.columns, rows: parsed.rows, fileName: file.name });
    } catch (e) {
      customersDoc.save({ columns: [], rows: [], fileName: "" });
      setError(e instanceof Error ? e.message : "Could not parse the file.");
    } finally {
      event.target.value = "";
    }
  }

  function clearData() {
    customersDoc.save({ columns: [], rows: [], fileName: "" });
    setSearch("");
    setError(null);
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
        description="Upload a CSV file to view your full customer base in one table."
      />

      <m.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.04 }}
      >
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CRM assistant (Day.ai MCP)</CardTitle>
            <CardDescription className="text-xs">
              Ask questions about customers and deals when Day.ai is connected via OAuth.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <McpQueryBox
              businessProfileId={businessProfileId}
              platforms={["dayai"]}
              title="CRM query"
              placeholder="e.g. open deals over 50k this quarter"
              buttonLabel="Ask CRM"
              onQuery={(q) => runCrmQuery({ businessProfileId, query: q })}
            />
          </CardContent>
        </Card>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer file</CardTitle>
            <CardDescription>
              Supported format: `.csv`
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex">
                <Input
                  type="file"
                  accept=".csv,text/csv"
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

      {rows.length > 0 ? (
        <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          <CustomerInsightsCard columns={columns} rows={rows} />
        </m.div>
      ) : null}

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
