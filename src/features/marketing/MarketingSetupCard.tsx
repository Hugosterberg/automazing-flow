import { Link } from "react-router-dom";
import { Gauge, Megaphone, Plug, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketingCampaigns } from "./useMarketingCampaigns";

export function MarketingSetupCard() {
  const { connected, performance, isLoading } = useMarketingCampaigns();
  const hasAds = connected.meta_business || connected.google_ads;
  const hasShopify = connected.shopify;
  const hasMetrics = performance?.adSpend != null || performance?.revenue != null;

  if (isLoading) return null;
  if (hasMetrics) return null;

  const steps = [
    {
      done: hasShopify,
      label: "Shopify",
      hint: "Revenue & ROAS from your store",
      href: "/ecommerce",
      icon: ShoppingBag,
    },
    {
      done: hasAds,
      label: "Google Ads or Meta",
      hint: "Track spend and campaign performance",
      href: "/connections",
      icon: Megaphone,
    },
    {
      done: hasMetrics,
      label: "View results",
      hint: "ROAS appears when store + ads are linked",
      href: "#paid-ads",
      icon: Gauge,
    },
  ];

  return (
    <Card className="border-dashed border-border bg-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          Connect your marketing stack
        </CardTitle>
        <CardDescription>
          Choose what to connect first — you can run organic content without ads, but ROAS needs Shopify plus at least one ad platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.label}
              className={`rounded-lg border p-3 ${step.done ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{step.label}</span>
                {step.done ? <span className="text-[10px] text-primary ml-auto">✓</span> : null}
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">{step.hint}</p>
              {!step.done ? (
                <Button asChild size="sm" variant="outline" className="h-7 text-xs w-full">
                  <Link to={step.href.startsWith("#") ? `/marketing${step.href}` : step.href}>Connect</Link>
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
