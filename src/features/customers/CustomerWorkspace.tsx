import { useEffect, useRef } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { SearchHighlight } from "@/features/messages/SearchHighlight";
import { CustomerDetailPanel, CustomerDetailPlaceholder, type CustomerRow } from "./CustomerDetailPanel";
import { guessPrimaryColumn, guessSecondaryColumn } from "./customerColumns";

type Props = {
  rows: CustomerRow[];
  columns: string[];
  selectedIndex: number | null;
  searchQuery: string;
  onSelect: (index: number | null) => void;
};

function CustomerList({
  rows,
  columns,
  selectedIndex,
  searchQuery,
  onSelect,
}: Props) {
  const primary = guessPrimaryColumn(columns);
  const secondary = guessSecondaryColumn(columns, primary);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (selectedIndex == null) return;
    rowRefs.current.get(selectedIndex)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, rows.length]);

  return (
    <div className="message-inbox-pane flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <p className="text-[11px] font-medium text-foreground/80">Kunder</p>
        <span className="text-[10px] tabular-nums text-muted-foreground">{rows.length} st</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto app-scroll">
        {rows.map((row, index) => {
          const selected = selectedIndex === index;
          const title = (primary && row[primary]) || `Rad ${index + 1}`;
          const sub = secondary ? row[secondary] : "";
          return (
            <li key={index}>
              <button
                ref={(el) => {
                  if (el) rowRefs.current.set(index, el);
                  else rowRefs.current.delete(index);
                }}
                type="button"
                onClick={() => onSelect(index)}
                className={cn(
                  "relative w-full border-b border-border/35 px-3 py-2 text-left transition-colors duration-150",
                  "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                  selected && "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[calc(0.75rem-2px)]"
                )}
                aria-current={selected ? "true" : undefined}
              >
                <p className={cn("truncate text-[13px]", selected ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
                  <SearchHighlight text={title} query={searchQuery} />
                </p>
                {sub ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    <SearchHighlight text={sub} query={searchQuery} />
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CustomerWorkspace({ rows, columns, selectedIndex, searchQuery, onSelect }: Props) {
  const selectedRow = selectedIndex != null ? rows[selectedIndex] : null;
  const isDesktopWorkspace = useIsDesktopWorkspace();

  if (columns.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Ladda upp en CSV-fil för att börja.
      </div>
    );
  }

  if (!isDesktopWorkspace) {
    return (
      <div className="flex h-full min-h-0">
        {!selectedRow || selectedIndex == null ? (
          <CustomerList
            rows={rows}
            columns={columns}
            selectedIndex={selectedIndex}
            searchQuery={searchQuery}
            onSelect={onSelect}
          />
        ) : (
          <section className="message-reading-pane flex h-full min-h-0 w-full flex-col overflow-hidden">
            <CustomerDetailPanel
              row={selectedRow}
              columns={columns}
              index={selectedIndex}
              onBack={() => onSelect(null)}
              showBack
            />
          </section>
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="flex h-full min-h-0">
        <ResizablePanel defaultSize={36} minSize={28} maxSize={48} className="min-h-0 min-w-[260px] border-r border-border/40">
          <CustomerList
            rows={rows}
            columns={columns}
            selectedIndex={selectedIndex}
            searchQuery={searchQuery}
            onSelect={onSelect}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="w-px bg-border/40 transition-colors hover:bg-primary/35" />
        <ResizablePanel defaultSize={64} minSize={40} className="min-h-0 min-w-0">
          <section className="message-reading-pane flex h-full min-h-0 flex-col overflow-hidden">
            {selectedRow && selectedIndex != null ? (
              <CustomerDetailPanel row={selectedRow} columns={columns} index={selectedIndex} />
            ) : (
              <CustomerDetailPlaceholder />
            )}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
  );
}
