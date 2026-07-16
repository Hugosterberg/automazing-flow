import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkApiaiHealth, fetchApiaiBalance, type ApiaiHealth } from "./apiaiClient";

export function ApiaiStatusBar({ businessProfileId }: { businessProfileId: string | null }) {
  const { t } = useTranslation("content");
  const [health, setHealth] = useState<ApiaiHealth | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!businessProfileId) return;
    setLoading(true);
    try {
      const [nextHealth, nextBalance] = await Promise.all([
        checkApiaiHealth(businessProfileId),
        fetchApiaiBalance(businessProfileId).catch(() => null),
      ]);
      setHealth(nextHealth);
      setBalance(nextBalance);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfileId]);

  if (!businessProfileId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
      {loading && !health ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      {health?.ok ? (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {t("apiaiStatus.ready", { count: health.toolCount })}
        </Badge>
      ) : health ? (
        <Badge variant="outline" className="gap-1 text-destructive border-destructive/40">
          <AlertCircle className="h-3 w-3" />
          {health.error || t("apiaiStatus.notReady")}
        </Badge>
      ) : null}
      {!health?.ok ? (
        <Link to="/preferences" className="text-[11px] text-primary hover:underline">
          {t("apiaiStatus.addApiKey")}
        </Link>
      ) : null}
      {balance != null ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Wallet className="h-3 w-3" />
          {t("apiaiStatus.balance", { balance: balance.toFixed(2) })}
        </span>
      ) : null}
      {health?.latencyMs != null ? (
        <span className="text-muted-foreground">{health.latencyMs}ms</span>
      ) : null}
      <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto" onClick={() => void refresh()} disabled={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        <span className="sr-only">{t("apiaiStatus.refreshAria")}</span>
      </Button>
    </div>
  );
}
