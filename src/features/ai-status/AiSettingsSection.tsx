import { Sparkles } from "lucide-react";
import { AiFeaturesPanel } from "./AiFeaturesPanel";
import { AiUsagePanel } from "./AiUsagePanel";

/** Preferences → AI tab: status + cost transparency in one section. */
export function AiSettingsSection({
  businessProfileId,
  onOpenIntegrations,
}: {
  businessProfileId: string | null;
  onOpenIntegrations?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] via-transparent to-amber-500/[0.04] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2 shrink-0">
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">AI & MCP</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              Se vilka AI-funktioner som är aktiva, vilka nycklar som saknas, och hur mycket varje
              körning kostar. MCP-verktyg väljs automatiskt utifrån funktion och fråga — du ser
              alltid vad som valdes och varför.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AiFeaturesPanel businessProfileId={businessProfileId} onOpenIntegrations={onOpenIntegrations} />
        <AiUsagePanel businessProfileId={businessProfileId} />
      </div>
    </div>
  );
}
