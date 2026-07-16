import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, PlugZap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { McpQueryBox } from "./McpQueryBox";
import { McpProviderStatusList } from "./McpProviderStatusList";
import {
  MCP_FEATURE_DEFINITIONS,
  MCP_HUB_TABS,
  MCP_PLATFORMS_WITH_UI,
  mcpFeaturesForTab,
  type McpHubTabId,
} from "./mcpFeatureConfig";
import { McpMultiSourceCompare } from "./McpMultiSourceCompare";
import { McpDataCatalog } from "./McpDataCatalog";
import { McpToolsExplorer } from "./McpToolsExplorer";

const QUERY_TABS = MCP_HUB_TABS.filter(
  (t) => !["overview", "compare", "catalog", "tools"].includes(t.id)
);

type Props = {
  businessProfileId: string | null;
  /** Controlled tab (URL-synced from Intelligence page). */
  tab?: McpHubTabId;
  onTabChange?: (tab: McpHubTabId) => void;
  /** When true, parent renders PageModeTabs — hide inner tab list. */
  hideTabList?: boolean;
};

/**
 * Unified hub: one tab per MCP category, one input box per feature.
 * Covers every MCP provider in the catalog (some share a fallback input).
 */
export function McpIntelligenceHub({
  businessProfileId,
  tab: controlledTab,
  onTabChange,
  hideTabList = false,
}: Props) {
  const [internalTab, setInternalTab] = useState<McpHubTabId>("compare");
  const tab = controlledTab ?? internalTab;

  function setTab(next: McpHubTabId) {
    onTabChange?.(next);
    if (controlledTab === undefined) setInternalTab(next);
  }

  const featureCount = MCP_FEATURE_DEFINITIONS.length;
  const platformCount = MCP_PLATFORMS_WITH_UI.length;

  const tabContent = useMemo(
    () =>
      QUERY_TABS.map((hubTab) => ({
        ...hubTab,
        features: mcpFeaturesForTab(hubTab.id as Exclude<McpHubTabId, "overview">),
      })),
    []
  );

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
              MCP Intelligence
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {featureCount} frågeverktyg över {platformCount} leverantörer. Varje fält visar autentiseringsstatus innan du kör ett anrop.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
            <Link to="/connections?tab=mcp">
              <PlugZap className="h-3.5 w-3.5" aria-hidden />
              Koppla leverantörer
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as McpHubTabId)}>
          {!hideTabList ? (
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              {MCP_HUB_TABS.map((hubTab) => (
                <TabsTrigger
                  key={hubTab.id}
                  value={hubTab.id}
                  className="text-xs data-[state=active]:bg-muted"
                >
                  {hubTab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}

          <TabsContent value="overview" className="mt-0 space-y-4">
            <p className="text-xs text-muted-foreground">
              Status för varje MCP-leverantör. Åtgärda saknade API-nycklar eller utgången OAuth under Kopplingar innan du kör frågor i andra flikar.
            </p>
            <McpProviderStatusList businessProfileId={businessProfileId} />
            <McpDataCatalog businessProfileId={businessProfileId} />
          </TabsContent>

          <TabsContent value="compare" className="mt-0">
            <McpMultiSourceCompare businessProfileId={businessProfileId} />
          </TabsContent>

          <TabsContent value="catalog" className="mt-0">
            <McpDataCatalog businessProfileId={businessProfileId} />
          </TabsContent>

          <TabsContent value="tools" className="mt-0">
            <McpToolsExplorer businessProfileId={businessProfileId} />
          </TabsContent>

          {tabContent.map((hubTab) => (
            <TabsContent key={hubTab.id} value={hubTab.id} className="mt-0 space-y-4">
              <p className="text-xs text-muted-foreground">{hubTab.description}</p>
              {hubTab.features.map((feature) => (
                <McpQueryBox
                  key={feature.id}
                  businessProfileId={businessProfileId}
                  platforms={feature.platforms}
                  title={`${feature.title} (${feature.providerLabels})`}
                  description={feature.description}
                  placeholder={feature.placeholder}
                  buttonLabel={feature.buttonLabel}
                  multiline={feature.multiline}
                  onQuery={(input) => feature.run(businessProfileId, input)}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
