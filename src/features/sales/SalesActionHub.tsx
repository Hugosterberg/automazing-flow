import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookmarkCheck,
  Compass,
  Mail,
  ShoppingBag,
  Sparkles,
  Target,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SalesActionHub({
  followUpCount,
  activeLeads,
  pipelineCount,
  shopifyConnected,
  shopifyOrders,
  shopifyRevenueLabel,
  onFollowUps,
  onAddLead,
  onDraftDueLeads,
  onDiscover,
  onSuggestLeads,
  onOpenContent,
  onSyncGoals,
}: {
  followUpCount: number;
  activeLeads: number;
  pipelineCount: number;
  shopifyConnected: boolean;
  shopifyOrders: number | null;
  shopifyRevenueLabel: string | null;
  onFollowUps: () => void;
  onAddLead: () => void;
  onDraftDueLeads: () => void;
  onDiscover: () => void;
  onSuggestLeads: () => void;
  onOpenContent: () => void;
  onSyncGoals?: () => void;
}) {
  const actions = [
    followUpCount > 0
      ? {
          id: "followups",
          label: `Follow up (${followUpCount})`,
          hint: "Leads due today or overdue",
          icon: Mail,
          onClick: onDraftDueLeads,
          variant: "default" as const,
        }
      : null,
    {
      id: "lead",
      label: "Add lead",
      hint: "Register a new prospect",
      icon: UserPlus,
      onClick: onAddLead,
      variant: "outline" as const,
    },
    {
      id: "discover",
      label: "Find prospects",
      hint: "AI brand discovery",
      icon: Sparkles,
      onClick: onDiscover,
      variant: "outline" as const,
    },
    {
      id: "suggest-leads",
      label: "Suggest leads",
      hint: "From your company profile",
      icon: Target,
      onClick: onSuggestLeads,
      variant: "outline" as const,
    },
    {
      id: "content",
      label: "Create content",
      hint: "Post or outreach copy",
      icon: BookmarkCheck,
      onClick: onOpenContent,
      variant: "outline" as const,
    },
  ].filter(Boolean) as Array<{
    id: string;
    label: string;
    hint: string;
    icon: typeof UserPlus;
    onClick: () => void;
    variant: "default" | "outline";
  }>;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              What to do next
            </CardTitle>
            <CardDescription>
              Clear choices for selling today — leads, outreach, pipeline, and store data in one place.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {followUpCount > 0 ? (
              <Button type="button" size="sm" variant="secondary" onClick={onFollowUps}>
                View due follow-ups
              </Button>
            ) : null}
            {shopifyConnected && onSyncGoals ? (
              <Button type="button" size="sm" variant="ghost" onClick={onSyncGoals}>
                Sync goals from Shopify
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{action.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{action.hint}</p>
              </button>
            );
          })}
          <Link
            to="/marketing"
            className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2 mb-1">
              <Compass className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Marketing</span>
              <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">Campaigns, ads & channels</p>
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{activeLeads} active leads</Badge>
          <Badge variant="outline">{pipelineCount} in pipeline</Badge>
          {shopifyConnected ? (
            <Badge variant="secondary" className="gap-1">
              <ShoppingBag className="h-3 w-3" />
              Shopify
              {shopifyOrders != null ? ` · ${shopifyOrders} orders (7d)` : ""}
              {shopifyRevenueLabel ? ` · ${shopifyRevenueLabel}` : ""}
            </Badge>
          ) : (
            <Button asChild variant="link" className="h-auto p-0 text-xs">
              <Link to="/ecommerce">Connect Shopify for revenue goals →</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
