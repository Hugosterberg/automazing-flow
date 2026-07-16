import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  History,
  ListChecks,
  MessageSquare,
  PlugZap,
  Sparkles,
  Sun,
  UserPlus,
  X,
  Star,
  Bot,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { getRecentPages } from "@/lib/keyboardShortcuts";
import { softFade } from "@/lib/motion";
import { type BriefItem, type BriefItemKind, type BriefSeverity } from "./buildDailyBrief";
import { getBriefDayState, markBriefItemDone, snoozeBriefItem } from "./dailyBriefDismiss";
import { useDailyBriefSummary } from "./useDailyBriefSummary";

const KIND_ICON: Record<BriefItemKind, React.ComponentType<{ className?: string }>> = {
  connection: PlugZap,
  message: MessageSquare,
  marketing: Gauge,
  lead: UserPlus,
  task: ListChecks,
  recommendation: Sparkles,
  review: Star,
  automation: Zap,
  agent: Bot,
};

const SEVERITY_STYLES: Record<BriefSeverity, { icon: string; chip: string }> = {
  critical: { icon: "text-destructive", chip: "bg-destructive/10 text-destructive" },
  warning: { icon: "text-warning", chip: "bg-warning/10 text-warning" },
  info: { icon: "text-info", chip: "bg-info/10 text-info" },
};

function BriefRow({
  item,
  onPrefetch,
  onDone,
  onSnooze,
}: {
  item: BriefItem;
  onPrefetch?: (to: string) => void;
  onDone?: (id: string) => void;
  onSnooze?: (id: string) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const styles = SEVERITY_STYLES[item.severity];
  return (
    <div className="group pressable relative flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-3.5 py-3.5 sm:rounded-lg sm:border-border/70 sm:bg-card sm:py-3 sm:hover:border-primary/40 sm:hover:bg-accent/40">
      <Link
        to={item.to}
        onPointerEnter={() => onPrefetch?.(item.to)}
        onFocus={() => onPrefetch?.(item.to)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className={cn("rounded-xl p-2.5 shrink-0 sm:rounded-md sm:p-2", styles.chip)}>
          <Icon className={cn("h-4 w-4", styles.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70 transition-all sm:opacity-0 sm:group-hover:translate-x-0.5 sm:group-hover:opacity-100" />
      </Link>
      {onDone ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-success opacity-100 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Markera klar"
          title="Markera klar"
          onClick={() => onDone(item.id)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {onSnooze ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground opacity-100 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Skjut upp till imorgon"
          title="Skjut upp till imorgon"
          onClick={() => onSnooze(item.id)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Smart Daily Brief — a single prioritised "what to do now" list that ranks
 * actions across connections, tasks and AI recommendations. Complements the
 * stat tiles on the home page (which show counts) by telling the user exactly
 * where to start. Self-contained: it reads the same React Query caches the
 * rest of the home page uses, so it adds no extra network cost.
 */
export function SmartDailyBrief({
  businessProfileId,
}: {
  businessProfileId: string | null | undefined;
}) {
  const prefetchFor = useRoutePrefetch();
  const [dayState, setDayState] = useState(() => getBriefDayState());
  const dismissedIds = useMemo(
    () => new Set([...dayState.done, ...dayState.snoozed]),
    [dayState]
  );
  const { brief, isLoading: isInitialLoading } = useDailyBriefSummary(businessProfileId);

  const visibleItems = useMemo(
    () => brief.items.filter((item) => !dismissedIds.has(item.id)),
    [brief.items, dismissedIds]
  );

  /** Boost items whose destination matches a recently visited page. */
  const sortedItems = useMemo(() => {
    const recent = getRecentPages();
    if (recent.length === 0) return visibleItems;
    const recentPaths = new Set(recent.map((p) => p.pathname.split("?")[0]));
    return [...visibleItems].sort((a, b) => {
      const aPath = a.to.split("?")[0];
      const bPath = b.to.split("?")[0];
      const aRecent = recentPaths.has(aPath) ? 1 : 0;
      const bRecent = recentPaths.has(bPath) ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      return 0;
    });
  }, [visibleItems]);

  const continueItem = useMemo(() => {
    const recent = getRecentPages().filter((p) => p.pathname !== "/");
    if (recent.length === 0) return null;
    const lastPath = recent[0].pathname.split("?")[0];
    return sortedItems.find((item) => item.to.split("?")[0] === lastPath) ?? null;
  }, [sortedItems]);

  const visibleActionCount = visibleItems.reduce((sum, item) => sum + item.count, 0);
  const visibleAllClear = visibleItems.length === 0;

  // Progress: how many of today's brief items were marked done. Only ids that
  // exist in today's brief count, so stale localStorage ids don't inflate it.
  const briefIds = useMemo(() => new Set(brief.items.map((i) => i.id)), [brief.items]);
  const doneCount = dayState.done.filter((id) => briefIds.has(id)).length;
  const progressTotal = visibleItems.length + doneCount;
  const progressPercent =
    progressTotal > 0 ? Math.round((doneCount / progressTotal) * 100) : 0;

  function handleDone(id: string) {
    markBriefItemDone(id);
    setDayState(getBriefDayState());
  }

  function handleSnooze(id: string) {
    snoozeBriefItem(id);
    setDayState(getBriefDayState());
  }

  const listItems = sortedItems.filter((item) => item.id !== continueItem?.id);

  return (
    <section
      aria-label="Dagens brief"
      className="mobile-brief-shell p-4 sm:rounded-2xl sm:border sm:border-border sm:bg-gradient-to-br sm:from-card sm:to-card/60 sm:p-5 sm:shadow-none sm:[backdrop-filter:none]"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-lg p-2 shrink-0",
            visibleAllClear ? "bg-success/10" : "bg-primary/10"
          )}
        >
          {visibleAllClear ? (
            <Sun className="h-5 w-5 text-success" aria-hidden />
          ) : (
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Dagens brief</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isInitialLoading
              ? "Samlar dagens fokus…"
              : visibleAllClear
              ? doneCount > 0
                ? `Alla ${progressTotal} hanterade — bra jobbat.`
                : "Du är ikapp för tillfället."
              : brief.subline}
          </p>
        </div>
        {!isInitialLoading && doneCount > 0 && !visibleAllClear ? (
          <span
            className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success tabular-nums shrink-0"
            title={`${doneCount} av ${progressTotal} klara idag`}
          >
            {doneCount}/{progressTotal}
            <CheckCircle2 className="inline h-3 w-3 ml-1 align-[-1.5px]" aria-hidden />
          </span>
        ) : null}
        {!visibleAllClear && !isInitialLoading ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums shrink-0">
            {visibleActionCount}
          </span>
        ) : null}
      </div>

      {!isInitialLoading && progressTotal > 0 && doneCount > 0 ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <m.div
            className="h-full rounded-full bg-success"
            initial={false}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-14 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      ) : visibleAllClear ? (
        <m.div
          {...softFade}
          transition={{ duration: 0.3 }}
          className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3.5 py-3 text-sm text-muted-foreground"
        >
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
          <span>Kopplingarna är friska, uppgifterna är under kontroll och inget nytt att granska.</span>
        </m.div>
      ) : (
        <>
          {continueItem ? (
            <div className="mt-4 space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <History className="h-3 w-3" />
                Fortsätt där du slutade
              </p>
              <AnimatePresence mode="popLayout" initial={false}>
                <m.div
                  key={continueItem.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <BriefRow
                    item={continueItem}
                    onPrefetch={prefetchFor}
                    onDone={handleDone}
                    onSnooze={handleSnooze}
                  />
                </m.div>
              </AnimatePresence>
            </div>
          ) : null}
          <ul className={cn("space-y-2", continueItem ? "mt-3" : "mt-4")}>
            <AnimatePresence mode="popLayout" initial={false}>
              {listItems.map((item) => (
                <m.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <BriefRow
                    item={item}
                    onPrefetch={prefetchFor}
                    onDone={handleDone}
                    onSnooze={handleSnooze}
                  />
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </section>
  );
}
