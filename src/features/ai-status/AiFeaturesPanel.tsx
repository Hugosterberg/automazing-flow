import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, CircleOff, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchAiFeatures, type AiFeatureState, type AiFeatureStatus } from "./aiFeaturesClient";

const STATE_META: Record<
  AiFeatureState,
  { label: string; icon: typeof CheckCircle2; badgeClass: string; iconClass: string }
> = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    badgeClass: "border-emerald-500/40 text-emerald-500",
    iconClass: "text-emerald-500",
  },
  limited: {
    label: "Basic mode",
    icon: CircleAlert,
    badgeClass: "border-warning/50 text-warning",
    iconClass: "text-warning",
  },
  inactive: {
    label: "Inactive",
    icon: CircleOff,
    badgeClass: "border-destructive/50 text-destructive",
    iconClass: "text-destructive",
  },
};

/**
 * The single answer to "which AI features are on?" — every AI feature in
 * the app with its live status for the active profile, and exactly what to
 * configure to unlock the ones that aren't fully active.
 */
export function AiFeaturesPanel({
  businessProfileId,
  onOpenIntegrations,
}: {
  businessProfileId: string | null;
  /** Jumps to where the keys are actually entered (Preferences → Integrations). */
  onOpenIntegrations?: () => void;
}) {
  const [features, setFeatures] = useState<AiFeatureStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessProfileId) {
      setFeatures([]);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    fetchAiFeatures(businessProfileId)
      .then((list) => {
        if (!ignore) setFeatures(list);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : "Could not load AI feature status.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [businessProfileId]);

  const activeCount = features.filter((f) => f.state === "active").length;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI features
          </span>
          {onOpenIntegrations ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onOpenIntegrations}
            >
              Manage keys
              <ArrowRight className="h-3 w-3" />
            </Button>
          ) : null}
        </CardTitle>
        <CardDescription>
          {features.length > 0
            ? `${activeCount} of ${features.length} AI features are fully active for this profile. ` +
              "Basic mode means the feature works but without real AI until a key is added."
            : "Live status for every AI feature in Automazing and what activates it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!businessProfileId ? (
          <p className="text-sm text-muted-foreground">
            Select a business profile to see its AI feature status.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking AI features…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {features.map((feature) => {
              const meta = STATE_META[feature.state];
              const Icon = meta.icon;
              return (
                <li key={feature.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClass)} aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium">{feature.name}</p>
                      <Badge variant="outline" className="border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                        {feature.area}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", meta.badgeClass)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                    <p className="text-xs text-muted-foreground">{feature.detail}</p>
                    {feature.activation ? (
                      <p className="text-xs">
                        <span className="font-medium">To activate:</span>{" "}
                        <span className="text-muted-foreground">{feature.activation}</span>
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
