import { Clock, Inbox, Play, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MessageInboxStatsProps = {
  openCount: number;
  oldestWait: string | null;
  aiReadyCount: number;
  loading?: boolean;
  onShowOpen?: () => void;
  onJumpToOldest?: () => void;
  onShowAiReady?: () => void;
  onStartTriage?: () => void;
};

export function MessageInboxStats({
  openCount,
  oldestWait,
  aiReadyCount,
  loading,
  onShowOpen,
  onJumpToOldest,
  onShowAiReady,
  onStartTriage,
}: MessageInboxStatsProps) {
  if (loading) {
    return (
      <div className="flex gap-2 border-b border-border/40 bg-muted/10 px-3 py-2 sm:px-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 flex-1 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }

  if (openCount === 0 && aiReadyCount === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-border/40 bg-success/5 px-3 py-2 text-xs text-success sm:px-4">
        <Inbox className="h-3.5 w-3.5 shrink-0" />
        <span>Inkorgen är tom — bra jobbat.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border/40 bg-gradient-to-r from-muted/15 via-background/40 to-muted/15 px-3 py-2 sm:flex-row sm:items-center sm:px-4">
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        <StatPill
          icon={Zap}
          label="Öppna"
          value={String(openCount)}
          highlight={openCount > 0}
          onClick={openCount > 0 ? onShowOpen : undefined}
          title={openCount > 0 ? "Visa bara öppna meddelanden" : undefined}
        />
        <StatPill
          icon={Clock}
          label="Äldsta väntan"
          value={oldestWait ?? "—"}
          highlight={Boolean(oldestWait)}
          urgent={Boolean(oldestWait?.includes("d"))}
          onClick={oldestWait ? onJumpToOldest : undefined}
          title={oldestWait ? "Hoppa till äldsta obesvarade" : undefined}
        />
        <StatPill
          icon={Sparkles}
          label="AI redo"
          value={String(aiReadyCount)}
          highlight={aiReadyCount > 0}
          onClick={aiReadyCount > 0 ? onShowAiReady : undefined}
          title={aiReadyCount > 0 ? "Visa meddelanden med AI-sammanfattning" : undefined}
        />
      </div>
      {onStartTriage && openCount > 0 ? (
        <Button type="button" size="sm" className="h-8 shrink-0 gap-1.5 text-xs glow-sm" onClick={onStartTriage}>
          <Play className="h-3.5 w-3.5" />
          Börja triage
        </Button>
      ) : null}
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  highlight,
  urgent,
  onClick,
  title,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  highlight?: boolean;
  urgent?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all duration-150",
        highlight ? "border-primary/25 bg-primary/[0.06] shadow-sm" : "border-border/50 bg-background/40",
        interactive &&
          "cursor-pointer hover:-translate-y-px hover:border-primary/35 hover:bg-primary/10 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", highlight ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0">
        <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={cn(
            "truncate text-xs font-semibold tabular-nums",
            urgent ? "text-destructive" : highlight ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {value}
        </p>
      </div>
    </Tag>
  );
}
