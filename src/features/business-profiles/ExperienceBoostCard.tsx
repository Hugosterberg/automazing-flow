import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Cable,
  CheckCircle2,
  Circle,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BusinessProfile } from "@/types/businessProfile";
import { getBusinessProfileCompleteness } from "./businessProfileCompleteness";

type SetupItem = {
  id: string;
  done: boolean;
  title: string;
  detail: string;
  to: string;
  cta: string;
};

type Props = {
  profile?: BusinessProfile | null;
  connectedCount: number;
  /** Connections that need reconnect/fix — setup is not "done" while > 0. */
  attentionCount?: number;
  className?: string;
  /** Compact variant for embedding under other home blocks. */
  compact?: boolean;
};

/**
 * Mobile-first checklist: what to fill in for better AI, plus what the app
 * can automate once basics are in place.
 */
export function ExperienceBoostCard({
  profile,
  connectedCount,
  attentionCount = 0,
  className,
  compact = false,
}: Props) {
  const completeness = getBusinessProfileCompleteness(profile);
  const topMissing = completeness.priorities.slice(0, 2);
  const connectionsHealthy = connectedCount > 0 && attentionCount === 0;

  const setupItems: SetupItem[] = [
    {
      id: "profile",
      done: completeness.isStrong,
      title: completeness.isStrong
        ? "Bolagsprofilen är stark"
        : completeness.percent < 40
          ? "Fyll i bolagsprofilen"
          : `Komplettera: ${topMissing[0]?.label?.toLowerCase() ?? "profilen"}`,
      detail: completeness.isStrong
        ? "AI kan ge träffsäkrare leads, utkast och förslag."
        : topMissing[0]?.why ||
          "Beskrivning, målgrupp och webb gör AI och automationer mer relevanta.",
      to: "/company",
      cta: completeness.isStrong ? "Öppna Företag" : "Fyll i Företag",
    },
    {
      id: "connections",
      done: connectionsHealthy,
      title: connectionsHealthy
        ? `${connectedCount} konton i gott skick`
        : attentionCount > 0
          ? `${attentionCount} koppling${attentionCount === 1 ? "" : "ar"} behöver åtgärd`
          : "Koppla dina kanaler",
      detail: connectionsHealthy
        ? "Mail, socialt och kalender synkas automatiskt när konton är kopplade."
        : attentionCount > 0
          ? "Koppla om felande konton så inkorg, recensioner och flöden fortsätter fungera."
          : "Utan kopplingar blir inkorg, recensioner och publicering tomma.",
      to: attentionCount > 0 ? "/connections?filter=attention" : "/connections",
      cta: connectionsHealthy
        ? "Hantera kopplingar"
        : attentionCount > 0
          ? "Fixa kopplingar"
          : "Koppla konton",
    },
  ];

  const automationTips = [
    {
      title: "Inkorg & AI-svar",
      detail: "Sammanfattningar och utkast till mail/DM — du godkänner innan sändning.",
      to: "/messages",
    },
    {
      title: "Recensionssvar",
      detail: "AI föreslår svar på omdömen; sparade mallar sparar tid.",
      to: "/reviews",
    },
    {
      title: "Schemalagd publicering",
      detail: "Under Innehåll → Publicera: köa inlägg så de går ut utan manuellt klick.",
      to: "/content?tab=publish",
    },
    {
      title: "Automatiska jobb",
      detail: "Snapshots, digests och synk körs enligt schema under Automationer.",
      to: "/automations",
    },
  ];

  const pendingSetup = setupItems.filter((item) => !item.done).length;
  const setupDone = setupItems.length - pendingSetup;
  const setupPercent = Math.round((setupDone / setupItems.length) * 100);
  const profilePercent = completeness.percent;
  // Blend profile + connections into one scannable progress signal.
  const overallPercent = Math.round(profilePercent * 0.7 + (connectedCount > 0 ? 30 : 0));

  return (
    <section
      aria-label="Förbättra upplevelsen"
      className={cn(
        "overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card/80 to-muted/20",
        className
      )}
    >
      <div className={cn("space-y-2 border-b border-border/50", compact ? "px-3.5 py-3" : "px-4 py-3.5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <h2 className="text-base font-semibold tracking-tight sm:text-sm">
                {pendingSetup > 0 ? "Gör appen smartare" : "Redo för mer automation"}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-xs">
              {pendingSetup > 0
                ? "Fyll i några saker — AI och automationer blir direkt mer användbara."
                : "Grunden är på plats. Titta igenom vad som redan kan köras automatiskt."}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              pendingSetup > 0 ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-700"
            )}
            title={`${overallPercent}% redo`}
          >
            {overallPercent}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              pendingSetup > 0 ? "bg-primary" : "bg-emerald-500"
            )}
            style={{ width: `${Math.max(6, overallPercent)}%` }}
          />
        </div>
      </div>

      <div className={cn("space-y-3", compact ? "p-3" : "p-3.5 sm:p-4")}>
        {pendingSetup > 0 ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Att fylla i · {setupDone}/{setupItems.length}
            </p>
            <ul className="space-y-2">
              {setupItems.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex gap-3 rounded-xl border px-3 py-3 transition-colors",
                      item.done
                        ? "border-border/50 bg-background/40"
                        : "border-primary/25 bg-primary/[0.04] hover:bg-primary/[0.07]"
                    )}
                  >
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                    ) : item.id === "profile" ? (
                      <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Cable className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        {item.cta}
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Profil och kopplingar är på plats ({setupPercent}%). Nästa steg: aktivera automation.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Kan automatiseras
          </p>
          <ul className="space-y-1.5">
            {automationTips.map((tip) => (
              <li key={tip.to}>
                <Link
                  to={tip.to}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
                >
                  <Circle className="mt-1.5 h-1.5 w-1.5 shrink-0 fill-primary text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{tip.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{tip.detail}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-2 h-10 w-full text-sm sm:h-8 sm:text-xs">
            <Link to="/automations">
              Se alla automationer
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
