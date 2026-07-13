import { useMemo, useState } from "react";
import { m } from "framer-motion";
import { Activity as ActivityIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, PageToolbar } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { useVisibleIntervalRefetch } from "@/hooks/useVisibleIntervalRefetch";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { ActivityFeed, useActivityFeed } from "@/features/activity";
import type { ActivityEventRow } from "@/features/activity";

type SeverityFilter = "all" | ActivityEventRow["severity"];

/**
 * /activity — tenant-wide audit feed. Read-only view over activity_events.
 *
 * Module and severity filters are applied client-side because we cap the
 * query at 200 rows — more than enough for interactive browsing while keeping
 * the round-trip small. For real deep history we'd add server-side filters
 * and pagination; not needed at MVP volume.
 */
export default function ActivityPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  const { events, isLoading, isFetching, refetch } = useActivityFeed(
    businessProfileId,
    { limit: 200 }
  );

  useVisibleIntervalRefetch(() => void refetch(), 60_000, { enabled: Boolean(businessProfileId) });

  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  // Derive the module facets from the rows we actually have. Keeps the UI
  // honest — we only offer filters for modules the tenant has events in.
  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.module);
    return Array.from(set).sort();
  }, [events]);

  const visible = useMemo(() => {
    return events.filter((e) => {
      if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
      if (severityFilter !== "all" && e.severity !== severityFilter) return false;
      return true;
    });
  }, [events, moduleFilter, severityFilter]);

  if (!businessProfileId) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ActivityIcon className="h-7 w-7 text-muted-foreground" />
          Activity
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a business profile to see its activity feed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl w-full">
      <PageHeader
        icon={ActivityIcon}
        title="Activity"
        description="Audit trail for every change in this business profile."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="text-muted-foreground"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      <PageToolbar trailing={`${visible.length} of ${events.length}`}>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Filter by module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {moduleOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </PageToolbar>

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
        <ActivityFeed
          events={visible}
          isLoading={isLoading}
          emptyMessage={
            moduleFilter !== "all" || severityFilter !== "all"
              ? "No events match the selected filters."
              : "No activity recorded for this business profile yet. Create a task or connect an integration to get started."
          }
        />
      </m.div>
    </div>
  );
}
