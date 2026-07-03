import { useState } from "react";
import { ChevronDown, KeyRound, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useMarketPulse } from "./useMarketPulse";

/**
 * Market pulse — crypto/market sentiment from the tenant's connected
 * LunarCrush MCP account, on the home dashboard.
 *
 * When LunarCrush is not connected or the API key is missing, shows a
 * compact setup card instead of hiding silently.
 */
export function MarketPulseCard({ businessProfileId }: { businessProfileId: string | null }) {
  const { pulse, isLoading } = useMarketPulse(businessProfileId);
  const [open, setOpen] = useState(false);

  if (isLoading || !pulse) return null;

  if (!pulse.available || !pulse.text) {
    const needsKey =
      pulse.reason === "missing_credential" || pulse.reason === "auth_expired";
    return (
      <Card className="border-dashed border-border/80">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {needsKey ? (
              <KeyRound className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            ) : (
              <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
            )}
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Market pulse</p>
              <p className="text-xs text-muted-foreground">
                {pulse.message ||
                  (needsKey
                    ? "LunarCrush is connected but the API key is missing or expired."
                    : "Connect LunarCrush under Connections → Intelligence & MCP to see crypto sentiment here.")}
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/connections">Connect LunarCrush</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

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
