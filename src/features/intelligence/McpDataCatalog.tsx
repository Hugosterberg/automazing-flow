import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMcpProvidersStatus, mcpStatusLabel } from "./useMcpProvidersStatus";
import { MCP_FEATURE_DEFINITIONS } from "./mcpFeatureConfig";

function featuresForPlatform(platform: string) {
  return MCP_FEATURE_DEFINITIONS.filter((f) => f.platforms.includes(platform));
}

/**
 * Grid of all MCP providers and which data types each can fetch in the app.
 */
export function McpDataCatalog({ businessProfileId }: { businessProfileId: string | null }) {
  const { providers, isLoading } = useMcpProvidersStatus(businessProfileId);

  const rows = useMemo(
    () =>
      providers.map((p) => ({
        ...p,
        features: featuresForPlatform(p.platform),
      })),
    [providers]
  );

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
          MCP data catalog
        </CardTitle>
        <CardDescription className="text-xs">
          Every provider and the query types available when connected. Use the Tools tab for raw tool calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar katalog…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.platform}
                className="rounded-md border border-border/60 p-3 space-y-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{row.label}</span>
                  <Badge variant={row.status === "ready" ? "default" : "outline"}>
                    {mcpStatusLabel(row.status)}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">{row.platform}</p>
                {row.features.length > 0 ? (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    {row.features.map((f) => (
                      <li key={f.id}>· {f.title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Raw tools via Tools explorer</p>
                )}
                <Link
                  to="/intelligence"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Open in Intelligence
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
