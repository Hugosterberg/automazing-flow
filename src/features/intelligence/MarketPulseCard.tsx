import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useMarketPulse } from "./useMarketPulse";

/**
 * Market pulse — crypto/market sentiment from the tenant's connected
 * LunarCrush MCP account, on the home dashboard.
 *
 * Renders NOTHING when no provider is connected or the provider fails:
 * the dashboard must never nag about a feature the user hasn't opted into.
 * The first text line is the headline; the full provider text sits behind
 * a collapsible so the card stays one glance tall.
 */
export function MarketPulseCard({ businessProfileId }: { businessProfileId: string | null }) {
  const { pulse } = useMarketPulse(businessProfileId);
  const [open, setOpen] = useState(false);

  if (!pulse || !pulse.text) return null;

  const lines = pulse.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headline = lines[0] ?? "";
  const rest = lines.slice(1).join("\n").trim();

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" aria-hidden />
            <h2 className="text-sm font-semibold capitalize truncate">
              Market pulse · {pulse.topic}
            </h2>
          </div>
          {pulse.fetchedAt ? (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatRelativeTime(pulse.fetchedAt)}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{headline}</p>
        {rest ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
              {open ? "Show less" : "Show more"}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs text-muted-foreground font-sans">
                {rest}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  );
}
