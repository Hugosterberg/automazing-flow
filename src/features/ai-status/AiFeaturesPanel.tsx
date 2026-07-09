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
    label: "Aktiv",
    icon: CheckCircle2,
    badgeClass: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    iconClass: "text-emerald-500",
  },
  limited: {
    label: "Begränsat",
    icon: CircleAlert,
    badgeClass: "border-warning/50 text-warning",
    iconClass: "text-warning",
  },
  inactive: {
    label: "Inaktiv",
    icon: CircleOff,
    badgeClass: "border-destructive/50 text-destructive",
    iconClass: "text-destructive",
  },
};

export function AiFeaturesPanel({
  businessProfileId,
  onOpenIntegrations,
}: {
  businessProfileId: string | null;
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
        if (!ignore) setError(e instanceof Error ? e.message : "Kunde inte ladda AI-status.");
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
    <Card className="bg-card border-border h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI-funktioner
          </span>
          {onOpenIntegrations ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onOpenIntegrations}
            >
              Hantera nycklar
              <ArrowRight className="h-3 w-3" />
            </Button>
          ) : null}
        </CardTitle>
        <CardDescription className="text-xs">
          {features.length > 0
            ? `${activeCount} av ${features.length} funktioner är fullt aktiva. Begränsat = mallar utan riktig AI.`
            : "Status för varje AI-funktion och vad som aktiverar den."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {!businessProfileId ? (
          <p className="text-sm text-muted-foreground">Välj en bolagsprofil.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Kontrollerar AI-funktioner…
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
                      <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
                        {feature.area}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px]", meta.badgeClass)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.detail}</p>
                    {feature.activation ? (
                      <p className="text-[11px] text-muted-foreground/90">
                        <span className="font-medium text-foreground/80">Aktivera:</span>{" "}
                        {feature.activation}
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
