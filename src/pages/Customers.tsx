import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { m } from "framer-motion";
import { Users, Upload, Search, Trash2, Download, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useAccounts } from "@/context/AccountsContext";
import { useProfileDocument } from "@/features/profile-documents";
import { CustomerInsightsCard } from "@/features/customers/CustomerInsightsCard";
import { CustomerWorkspace } from "@/features/customers/CustomerWorkspace";
import { guessPrimaryColumn } from "@/features/customers/customerColumns";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { customersToCsv, downloadCsv } from "@/lib/exportCsv";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFocusedWorkspaceReading, useIsMobile, useStackedWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { isShortcutBlocked, isTypingTarget } from "@/lib/keyboardShortcuts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { pageFadeUp } from "@/lib/motion";

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

async function parseCustomerFile(file: File): Promise<{ columns: string[]; rows: CustomerRow[] }> {
  const content = await file.text();
  const parsedRows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (parsedRows.length === 0) return { columns: [], rows: [] };

  const [headerRow, ...dataRows] = parsedRows;
  const columns = headerRow.map((header, index) => header.trim() || `Kolumn ${index + 1}`);

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
  const debouncedSearch = useDebouncedValue(search, 180);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSelected = useRef(false);

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
    }
  );

  const { columns, rows, fileName } = useMemo(() => {
    const d = customersDoc.data;
    return {
      columns: Array.isArray(d.columns) ? d.columns : [],
      rows: Array.isArray(d.rows) ? d.rows : [],
      fileName: typeof d.fileName === "string" ? d.fileName : "",
    };
  }, [customersDoc.data]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((col) => (row[col] || "").toLowerCase().includes(q)));
  }, [rows, columns, debouncedSearch]);

  useEffect(() => {
    autoSelected.current = false;
    setSelectedIndex(null);
  }, [fileName, activeProfileId]);

  useEffect(() => {
    if (autoSelected.current || filteredRows.length === 0) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setSelectedIndex(0);
      autoSelected.current = true;
    }
  }, [filteredRows.length]);

  useEffect(() => {
    if (selectedIndex == null) return;
    if (selectedIndex >= filteredRows.length) setSelectedIndex(filteredRows.length > 0 ? 0 : null);
  }, [filteredRows.length, selectedIndex]);

  useEffect(() => {
    const indexParam = searchParams.get("index");
    if (indexParam == null) return;
    const idx = Number.parseInt(indexParam, 10);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (idx < filteredRows.length) setSelectedIndex(idx);
  }, [searchParams, filteredRows.length]);

  const navigateRelative = useCallback(
    (delta: number) => {
      if (filteredRows.length === 0) return;
      const current = selectedIndex ?? -1;
      const next =
        current === -1
          ? delta > 0
            ? 0
            : filteredRows.length - 1
          : Math.min(filteredRows.length - 1, Math.max(0, current + delta));
      setSelectedIndex(next);
      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev);
          nextParams.set("index", String(next));
          return nextParams;
        },
        { replace: true }
      );
    },
    [filteredRows.length, selectedIndex, setSearchParams]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;
      if (filteredRows.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateRelative(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateRelative(-1);
      } else if (e.key === "/" && !e.shiftKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && selectedIndex != null) {
        e.preventDefault();
        setSelectedIndex(null);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("index");
          return next;
        }, { replace: true });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredRows.length, navigateRelative, selectedIndex, setSearchParams]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (extension !== "csv") throw new Error("Endast CSV-filer stöds.");
      const parsed = await parseCustomerFile(file);
      customersDoc.save({ columns: parsed.columns, rows: parsed.rows, fileName: file.name });
    } catch (e) {
      customersDoc.save({ columns: [], rows: [], fileName: "" });
      setError(e instanceof Error ? e.message : "Kunde inte läsa filen.");
    } finally {
      event.target.value = "";
    }
  }

  function clearData() {
    customersDoc.save({ columns: [], rows: [], fileName: "" });
    setSearch("");
    setSelectedIndex(null);
    setError(null);
    autoSelected.current = false;
  }

  function exportCustomers() {
    if (rows.length === 0) return;
    const exportRows = debouncedSearch.trim() ? filteredRows : rows;
    downloadCsv(customersToCsv(columns, exportRows), `kunder-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const filledFieldCount = useMemo(() => {
    if (rows.length === 0) return 0;
    let filled = 0;
    for (const row of rows) {
      for (const col of columns) {
        if ((row[col] || "").trim()) filled += 1;
      }
    }
    return filled;
  }, [rows, columns]);

  const isMobile = useIsMobile();
  const isStackedWorkspace = useStackedWorkspace();
  const focusedReading = useFocusedWorkspaceReading(selectedIndex != null);

  return (
    <div className={cn("max-w-7xl w-full", focusedReading ? "space-y-0" : "space-y-6")}>
      {!focusedReading ? (
        <>
      <PageHeader
        icon={Users}
        title="Kunder"
        description={
          isMobile
            ? "Tryck en kund i listan för att se alla fält."
            : "Ladda upp din kundbas, sök och granska varje kund med alla fält på ett ställe."
        }
      />

      <PageSmartBar
        title={
          isMobile
            ? "Ladda upp CSV, sök och tryck en kund för detaljer."
            : "Bygg en enkel CRM-vy från din CSV — perfekt för uppföljning, segmentering och AI-frågor via Day.ai."
        }
        steps={
          isMobile
            ? ["Ladda upp CSV", "Sök och tryck en kund", "Kopiera kontaktuppgifter"]
            : [
                "Ladda upp en CSV med kolumner som e-post, namn och telefon",
                "Sök och välj en kund i listan till vänster",
                "Kopiera kontaktuppgifter eller exportera filtrerade rader",
              ]
        }
        tip="Koppla Day.ai under Kopplingar för att ställa frågor om kunder och affärer härifrån."
      />

      <m.div {...pageFadeUp} transition={{ duration: 0.35, delay: 0.03 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.customers}
          title="CRM-assistent (Day.ai MCP)"
          description="Ställ frågor om kunder och affärer när Day.ai är kopplat via OAuth."
        />
      </m.div>
        </>
      ) : null}

      <m.div
        {...pageFadeUp}
        transition={{ duration: 0.35, delay: focusedReading ? 0 : 0.04 }}
        className={cn(
          "app-workspace-shell",
          focusedReading && "workspace-reading-focus rounded-none border-x-0 shadow-none sm:rounded-xl sm:border-x"
        )}
      >
        {!focusedReading ? (
        <div className="app-workspace-toolbar flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <label className="inline-flex">
            <Input type="file" accept=".csv,text/csv" className={cn("max-w-[220px] text-sm", isMobile ? "h-10" : "h-8 text-xs")} onChange={(e) => void handleFileChange(e)} />
          </label>
          {fileName ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Upload className="h-3.5 w-3.5" />
              {fileName}
            </span>
          ) : null}
          <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Sök kunder…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "border-border/60 bg-background/60 pl-8 pr-8 text-sm shadow-sm",
                isMobile ? "h-10" : "h-8 text-xs"
              )}
              disabled={rows.length === 0}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Rensa sökning"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button variant="outline" size="sm" className={cn("text-sm", isMobile ? "h-10" : "h-8 text-xs")} onClick={exportCustomers} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Exportera
          </Button>
          <Button variant="outline" size="sm" className={cn("text-sm", isMobile ? "h-10" : "h-8 text-xs")} onClick={clearData} disabled={rows.length === 0 && !fileName}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Rensa
          </Button>
          <p className="ml-auto hidden text-[11px] tabular-nums text-muted-foreground md:block">
            {rows.length > 0
              ? `${filteredRows.length} visade · ${rows.length} totalt · ${columns.length} kolumner`
              : "Ingen fil laddad"}
          </p>
        </div>
        ) : null}

        {error ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div>
        ) : null}

        {!focusedReading ? (
        <div className="app-workspace-stats grid grid-cols-3 gap-2 px-3 py-2 sm:px-4">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Kunder</p>
            <p className="text-xs font-semibold tabular-nums">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Kolumner</p>
            <p className="text-xs font-semibold tabular-nums">{columns.length}</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Ifyllda fält</p>
            <p className="text-xs font-semibold tabular-nums">{filledFieldCount}</p>
          </div>
        </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {rows.length === 0 ? (
            <div className="flex h-full min-h-[320px] items-center justify-center p-8">
              <EmptyState
                icon={Upload}
                title="Ingen kundbas ännu"
                description="Ladda upp en CSV ovan. Sök, granska och exportera — koppla Day.ai under Kopplingar för AI-frågor om kunderna."
              />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-full min-h-[200px] items-center justify-center p-8">
              <EmptyState size="compact" title="Inga träffar" description="Prova ett annat sökord eller rensa filtret." />
            </div>
          ) : (
            <CustomerWorkspace
              rows={filteredRows}
              columns={columns}
              selectedIndex={selectedIndex}
              searchQuery={debouncedSearch}
              onSelect={(index) => {
                setSelectedIndex(index);
                if (index == null) {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("index");
                    return next;
                  }, { replace: true });
                } else {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("index", String(index));
                    return next;
                  }, { replace: true });
                }
              }}
            />
          )}
        </div>

        {filteredRows.length > 0 && !isStackedWorkspace ? (
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4">
            <span className="truncate">
              {selectedIndex != null && filteredRows[selectedIndex] ? (
                <>
                  Vald:{" "}
                  <span className="font-medium text-foreground/80">
                    {filteredRows[selectedIndex][guessPrimaryColumn(columns)] || `Rad ${selectedIndex + 1}`}
                  </span>
                  {filteredRows.length > 1 ? (
                    <span className="ml-2 tabular-nums">
                      ({selectedIndex + 1}/{filteredRows.length})
                    </span>
                  ) : null}
                </>
              ) : (
                "Välj en kund i listan"
              )}
            </span>
            <span className="hidden sm:inline">J/K bläddra · / sök</span>
          </div>
        ) : null}
      </m.div>

      {rows.length > 0 ? (
        <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <CustomerInsightsCard columns={columns} rows={rows} />
        </m.div>
      ) : null}
    </div>
  );
}
