import { McpQueryBox } from "./McpQueryBox";
import { mcpFeaturesByIds } from "./mcpPageWidgets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Renders a titled group of MCP query boxes for a product page.
 */
export function McpFeatureSection({
  businessProfileId,
  featureIds,
  title = "MCP data",
  description = "Fetch live data from connected MCP providers. Missing keys are shown before you run a query.",
}: {
  businessProfileId: string | null;
  featureIds: string[];
  title?: string;
  description?: string;
}) {
  const features = mcpFeaturesByIds(featureIds);
  if (features.length === 0) return null;

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {features.map((feature) => (
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
      </CardContent>
    </Card>
  );
}
