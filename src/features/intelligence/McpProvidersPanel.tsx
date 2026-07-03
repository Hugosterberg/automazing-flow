import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { McpProviderStatusList } from "./McpProviderStatusList";
import { MCP_PLATFORMS_WITH_UI } from "./mcpFeatureConfig";

/**
 * Compact MCP status on Connections — full query UI lives at /intelligence.
 */
export function McpProvidersPanel({ businessProfileId }: { businessProfileId: string | null }) {
  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">MCP provider status</CardTitle>
            <CardDescription className="text-xs mt-1">
              Whether each data provider is connected and has credentials to make API calls.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
            <Link to="/intelligence">
              Open MCP Intelligence
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <McpProviderStatusList businessProfileId={businessProfileId} />
        <p className="text-[11px] text-muted-foreground mt-4">
          Run queries for all {MCP_PLATFORMS_WITH_UI.length} providers on the{" "}
          <Link to="/intelligence" className="underline underline-offset-2 hover:text-foreground">
            MCP Intelligence
          </Link>{" "}
          page — keyed providers need an API key at connect time.
        </p>
      </CardContent>
    </Card>
  );
}

export { McpReadinessHint } from "./McpReadinessHint";
