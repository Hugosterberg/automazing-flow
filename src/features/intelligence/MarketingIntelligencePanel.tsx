import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { McpQueryBox } from "./McpQueryBox";
import {
  fetchSeoOverview,
  runCompetitiveResearch,
  runMarketingQuery,
} from "./intelligenceService";

export function MarketingIntelligencePanel({ businessProfileId }: { businessProfileId: string | null }) {
  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">MCP intelligence</CardTitle>
        <CardDescription className="text-xs">
          SEO, marketing data, and competitive research via connected MCP providers. Missing API keys show before you run a query.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <McpQueryBox
          businessProfileId={businessProfileId}
          platforms={["ahrefs"]}
          title="SEO overview (Ahrefs)"
          placeholder="e.g. automazing.life"
          buttonLabel="Analyze"
          onQuery={(target) =>
            fetchSeoOverview({ businessProfileId, target }).then((r) => ({
              provider: r.provider,
              tool: r.tool,
              query: target,
              text: r.text,
            }))
          }
        />
        <McpQueryBox
          businessProfileId={businessProfileId}
          platforms={["supermetrics_mcp", "windsor"]}
          title="Marketing data (Supermetrics or Windsor)"
          placeholder="e.g. Meta ad spend last 7 days"
          buttonLabel="Query"
          onQuery={(q) => runMarketingQuery({ businessProfileId, query: q })}
        />
        <McpQueryBox
          businessProfileId={businessProfileId}
          platforms={["peec"]}
          title="Competitive research (Peec AI)"
          placeholder="e.g. Acme Corp positioning"
          buttonLabel="Research"
          onQuery={(q) => runCompetitiveResearch({ businessProfileId, query: q })}
        />
      </CardContent>
    </Card>
  );
}
