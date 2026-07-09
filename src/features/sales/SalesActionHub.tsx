import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookmarkCheck,
  Compass,
  Kanban,
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
  onAddDeal,
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
  /** Opens the CRM lead dialog (Leads section). */
  onAddLead: () => void;
  /** Opens the pipeline / deal dialog. */
  onAddDeal: () => void;
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
          label: `Följ upp (${followUpCount})`,
          hint: "Leads med datum idag eller försenade",
          icon: Mail,
          onClick: onDraftDueLeads,
          variant: "default" as const,
        }
      : null,
    {
      id: "lead",
      label: "Ny lead",
      hint: "Registrera ett prospekt i CRM",
      icon: UserPlus,
      onClick: onAddLead,
      variant: "outline" as const,
    },
    {
      id: "deal",
      label: "Ny affär",
      hint: "Lägg till i säljpipelinen",
      icon: Kanban,
      onClick: onAddDeal,
      variant: "outline" as const,
    },
    {
      id: "suggest-leads",
      label: "Lead-förslag",
      hint: "Från er bolagsprofil",
      icon: Target,
      onClick: onSuggestLeads,
      variant: "outline" as const,
    },
    {
      id: "discover",
      label: "Hitta prospects",
      hint: "AI varumärkesdiscovery",
      icon: Sparkles,
      onClick: onDiscover,
      variant: "outline" as const,
    },
    {
      id: "content",
      label: "Skapa innehåll",
      hint: "Post eller outreach-text",
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
              Nästa steg i Sales
            </CardTitle>
            <CardDescription>
              Leads, affärer och outreach — tydliga genvägar till det du gör oftast.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {followUpCount > 0 ? (
              <Button type="button" size="sm" variant="secondary" onClick={onFollowUps}>
                Visa förfallna
              </Button>
            ) : null}
            {shopifyConnected && onSyncGoals ? (
              <Button type="button" size="sm" variant="ghost" onClick={onSyncGoals}>
                Synka mål från Shopify
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
              <span className="text-sm font-medium">Marknadsföring</span>
              <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">Kampanjer, annonser och kanaler</p>
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{activeLeads} aktiva leads</Badge>
          <Badge variant="outline">{pipelineCount} i pipeline</Badge>
          {shopifyConnected ? (
            <Badge variant="secondary" className="gap-1">
              <ShoppingBag className="h-3 w-3" />
              Shopify
              {shopifyOrders != null ? ` · ${shopifyOrders} ordrar (7d)` : ""}
              {shopifyRevenueLabel ? ` · ${shopifyRevenueLabel}` : ""}
            </Badge>
          ) : (
            <Button asChild variant="link" className="h-auto p-0 text-xs">
              <Link to="/ecommerce">Koppla Shopify för intäktsmål →</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
