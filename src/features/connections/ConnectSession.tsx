import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  PlugZap,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONNECTION_CATALOG } from "@/lib/connectionCatalog";
import type { AccountPlatform, IntelligencePlatform } from "@/types/accounts";
import type { Connection } from "@/types/connection";
import { useAccounts } from "@/context/AccountsContext";
import { apiJson } from "@/lib/apiJson";
import { normalizeShopifyShopDomain, SHOPIFY_DOMAIN_EXAMPLE } from "@/features/ecommerce/shopifyConnect";
import { ConnectGuide } from "./ConnectGuide";
import { getConnectGuide } from "./connectGuides";
import { markConnectGuideComplete } from "./connectGuideProgress";
import { getConnectConfig, getConnectionPathOptions } from "./connectAuthPath";
import {
  buildMcpOAuthConnectUrl,
  getMcpProviderMeta,
  isMcpPlatform,
  mcpManualConnectPath,
} from "./mcpProviders";
import { JudgemeConnectDialog } from "./JudgemeConnectDialog";
import { buildConnectUrl } from "./zernioClient";
import type { ConnectionTestResult } from "./useConnections";
import { isResyncSuccess } from "./connectionVerified";
import {
  clearPendingConnectSession,
  type ConnectSessionStep,
  type PendingConnectSession,
  valueSurfaceForPlatform,
  writePendingConnectSession,
} from "./connectSessionState";
import { priorityConnectsForKind } from "@/features/onboarding/firstWin";
import type { ProfileKind } from "@/types/businessProfile";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: AccountPlatform | null;
  businessProfileId: string;
  connections: Connection[];
  resync: (connectionId: string) => Promise<ConnectionTestResult>;
  /** Profile kind for "next recommended" after success. */
  profileKind?: ProfileKind | null;
  /** Healthy platforms (for next recommendation). */
  healthyPlatforms?: Iterable<string>;
  /** Called when user picks another platform from the done step. */
  onStartPlatform?: (platform: AccountPlatform) => void;
  /** Seed step / account after OAuth resume. */
  resume?: Pick<PendingConnectSession, "step" | "accountId" | "errorMessage" | "errorFix"> | null;
};

/**
 * Guided connect → verify → done loop for one platform.
 * OAuth uses full-page redirect; pending state lives in sessionStorage.
 */
export function ConnectSession({
  open,
  onOpenChange,
  platform,
  businessProfileId,
  connections,
  resync,
  profileKind,
  healthyPlatforms,
  onStartPlatform,
  resume,
}: Props) {
  const { t } = useTranslation("connections");
  const { addAccountFromOAuth } = useAccounts();
  const [step, setStep] = useState<ConnectSessionStep>("why");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorFix, setErrorFix] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [provider, setProvider] = useState<"zernio" | "official" | undefined>();
  const [shopifyShop, setShopifyShop] = useState("");
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [mcpCredential, setMcpCredential] = useState("");
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpConnecting, setMcpConnecting] = useState(false);
  const [judgemeOpen, setJudgemeOpen] = useState(false);
  const verifyStarted = useRef<string | null>(null);

  const entry = useMemo(
    () => CONNECTION_CATALOG.find((e) => e.platform === platform) ?? null,
    [platform]
  );
  const label = entry?.label ?? platform ?? "";
  const connectConfig = platform ? getConnectConfig(platform) : null;
  const pathOptions = platform ? getConnectionPathOptions(platform) : [];
  const defaultPath = pathOptions.find((o) => o.isDefault) ?? pathOptions[0];
  const mcpMeta = platform && isMcpPlatform(platform) ? getMcpProviderMeta(platform) : null;
  const guide = platform ? getConnectGuide(platform, label) : null;
  const whyText = useMemo(() => {
    if (!platform) return "";
    const priority = priorityConnectsForKind(profileKind).find((p) => p.platform === platform);
    return priority?.why ?? t("session.whyFallback", { label });
  }, [platform, profileKind, label, t]);

  const platformRows = useMemo(
    () => (platform ? connections.filter((c) => c.platform === platform) : []),
    [connections, platform]
  );

  const nextPlatform = useMemo(() => {
    if (!platform) return null;
    const healthy = new Set(
      [...(healthyPlatforms ?? [])].map((p) => String(p).toLowerCase())
    );
    healthy.add(String(platform).toLowerCase());
    const remaining = priorityConnectsForKind(profileKind).filter(
      (p) => !healthy.has(String(p.platform).toLowerCase())
    );
    return remaining[0]?.platform ?? null;
  }, [platform, healthyPlatforms, profileKind]);

  const valueSurface = platform ? valueSurfaceForPlatform(platform) : null;

  const persist = useCallback(
    (next: ConnectSessionStep, extra?: Partial<PendingConnectSession>) => {
      if (!platform) return;
      writePendingConnectSession({
        platform,
        step: next,
        returnTo: valueSurface?.to ?? null,
        accountId: extra?.accountId ?? null,
        errorMessage: extra?.errorMessage ?? null,
        errorFix: extra?.errorFix ?? null,
      });
    },
    [platform, valueSurface?.to]
  );

  const finishSuccess = useCallback(
    (plat: AccountPlatform) => {
      const g = getConnectGuide(plat, label);
      if (g?.steps?.length) markConnectGuideComplete(plat, g.steps.length);
      setStep("done");
      persist("done");
      window.dispatchEvent(
        new CustomEvent("automazing:connect-session-done", { detail: { platform: plat } })
      );
    },
    [label, persist]
  );

  // Reset / resume when opening for a platform.
  useEffect(() => {
    if (!open || !platform) return;
    verifyStarted.current = null;
    if (resume?.step === "verify" || resume?.step === "error" || resume?.step === "done") {
      setStep(resume.step);
      setErrorMessage(resume.errorMessage ?? null);
      setErrorFix(resume.errorFix ?? null);
      persist(resume.step, {
        accountId: resume.accountId,
        errorMessage: resume.errorMessage,
        errorFix: resume.errorFix,
      });
      return;
    }
    const alreadyHealthy = platformRows.some((c) => c.health === "healthy");
    if (alreadyHealthy) {
      setStep("done");
      persist("done");
      return;
    }
    setStep("why");
    setErrorMessage(null);
    setErrorFix(null);
    setShopifyShop("");
    setShopifyError(null);
    setMcpCredential("");
    setMcpError(null);
    setProvider(
      defaultPath?.id === "zernio" || defaultPath?.id === "official"
        ? defaultPath.id
        : connectConfig?.provider
    );
    persist("why");
  }, [open, platform]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional open/platform gate

  const runVerify = useCallback(
    async (accountId?: string | null) => {
      if (!platform) return;
      setStep("verify");
      setVerifying(true);
      setErrorMessage(null);
      setErrorFix(null);
      persist("verify", { accountId });

      try {
        // Wait briefly for AccountsContext upsert + query invalidate to land.
        await new Promise((r) => window.setTimeout(r, 600));

        let targetId = accountId ?? null;
        if (!targetId) {
          const match = platformRows.find((c) => c.platform === platform);
          targetId = match?.id ?? null;
        }
        // Re-read from latest connections if still missing — parent may have refreshed.
        if (!targetId) {
          const fresh = connections.find(
            (c) => c.platform === platform && c.health !== "disconnected"
          );
          targetId = fresh?.id ?? null;
        }

        if (!targetId) {
          const healthy = connections.find(
            (c) => c.platform === platform && c.health === "healthy"
          );
          if (healthy) {
            finishSuccess(platform);
            return;
          }
          setStep("error");
          setErrorMessage(t("session.verifyNoAccount"));
          persist("error", { errorMessage: t("session.verifyNoAccount") });
          return;
        }

        const result = await resync(targetId);
        if (isResyncSuccess(result)) {
          finishSuccess(platform);
        } else {
          const msg = result.message || t("session.verifyFailed");
          const fix = result.fix ?? null;
          setStep("error");
          setErrorMessage(msg);
          setErrorFix(fix);
          persist("error", { accountId: targetId, errorMessage: msg, errorFix: fix });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("session.verifyFailed");
        setStep("error");
        setErrorMessage(msg);
        persist("error", { accountId, errorMessage: msg });
      } finally {
        setVerifying(false);
      }
    },
    [platform, platformRows, connections, resync, persist, finishSuccess, t]
  )

  // Auto-verify when resumed on verify step.
  useEffect(() => {
    if (!open || !platform || step !== "verify") return;
    const key = `${platform}:${resume?.accountId ?? "latest"}`;
    if (verifyStarted.current === key) return;
    verifyStarted.current = key;
    void runVerify(resume?.accountId);
  }, [open, platform, step, resume?.accountId, runVerify]);

  function startOAuth(params?: Record<string, string | null | undefined>) {
    if (!platform || !connectConfig) return;
    persist("verify");
    window.location.href = buildConnectUrl(connectConfig.authPath, businessProfileId, {
      provider: provider ?? connectConfig.provider,
      params,
    });
  }

  function handlePrimaryConnect() {
    if (!platform) return;
    if (isMcpPlatform(platform)) {
      void startMcp();
      return;
    }
    if (platform === "shopify") {
      const shop = normalizeShopifyShopDomain(shopifyShop);
      if (!shop) {
        setShopifyError(
          t("session.shopifyDomainError", { example: SHOPIFY_DOMAIN_EXAMPLE })
        );
        return;
      }
      setShopifyError(null);
      startOAuth({ shop });
      return;
    }
    if (platform === "judgeme") {
      setJudgemeOpen(true);
      return;
    }
    startOAuth();
  }

  async function startMcp() {
    if (!platform || !mcpMeta) return;
    if (mcpMeta.auth === "oauth") {
      persist("verify");
      window.location.href = buildMcpOAuthConnectUrl(
        platform as IntelligencePlatform,
        businessProfileId
      );
      return;
    }
    if (mcpMeta.auth === "keyless") {
      await submitMcp({ keyless: true });
      return;
    }
    await submitMcp();
  }

  async function submitMcp(options?: { keyless?: boolean }) {
    if (!platform || !mcpMeta) return;
    const trimmed = mcpCredential.trim();
    if (mcpMeta.auth === "shop_domain") {
      const shop = normalizeShopifyShopDomain(trimmed);
      if (!shop) {
        setMcpError(t("session.shopifyDomainError", { example: SHOPIFY_DOMAIN_EXAMPLE }));
        return;
      }
    } else if (!options?.keyless && !trimmed && platform !== "sprouts") {
      setMcpError(t("session.credentialRequired"));
      return;
    }
    setMcpConnecting(true);
    setMcpError(null);
    try {
      const body =
        mcpMeta.auth === "shop_domain"
          ? { shopDomain: normalizeShopifyShopDomain(trimmed), profileId: businessProfileId }
          : { apiKey: trimmed, profileId: businessProfileId };
      const payload = await apiJson<Record<string, unknown>>(
        mcpManualConnectPath(platform as IntelligencePlatform),
        t("session.mcpConnectFailed", { label }),
        { body }
      );
      if (payload.account_id && payload.platform) {
        addAccountFromOAuth(
          String(payload.account_id),
          payload.platform as IntelligencePlatform,
          String(payload.username || label),
          payload.profile_id ? String(payload.profile_id) : businessProfileId,
          { displayName: label }
        );
        window.dispatchEvent(new CustomEvent("automazing:connections-changed"));
        await runVerify(String(payload.account_id));
      } else {
        // Keyless / no row — treat as saved if API succeeded.
        finishSuccess(platform);
      }
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : t("session.mcpConnectFailed", { label }));
    } finally {
      setMcpConnecting(false);
    }
  }

  function handleClose(next: boolean) {
    if (!next) {
      if (step === "done" || step === "error") clearPendingConnectSession();
      // Keep pending on mid-flow close so OAuth return can resume; clear if still on why.
      if (step === "why" || step === "prerequisites" || step === "connect") {
        clearPendingConnectSession();
      }
    }
    onOpenChange(next);
  }

  function goConnect() {
    setStep("connect");
    persist("connect");
  }

  if (!platform || !entry) return null;

  const dualPath =
    platform === "google_ads" || platform === "google_business" || platform === "tripadvisor";

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-primary" aria-hidden />
              {t("session.title", { label })}
            </DialogTitle>
            <DialogDescription>{t(`session.step.${step}`)}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Progress dots */}
            <ol className="flex flex-wrap gap-1.5" aria-hidden>
              {(["why", "prerequisites", "connect", "verify", "done"] as const).map((s) => {
                const active =
                  step === s ||
                  (step === "error" && s === "verify") ||
                  (["prerequisites", "connect", "verify", "done"].includes(step) && s === "why") ||
                  (["connect", "verify", "done"].includes(step) && s === "prerequisites") ||
                  (["verify", "done"].includes(step) && s === "connect") ||
                  (step === "done" && s === "verify");
                const current = step === s || (step === "error" && s === "verify");
                return (
                  <li
                    key={s}
                    className={cn(
                      "h-1.5 flex-1 min-w-[2rem] rounded-full",
                      current ? "bg-primary" : active ? "bg-primary/40" : "bg-muted"
                    )}
                  />
                );
              })}
            </ol>

            {step === "why" ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground leading-relaxed">{whyText}</p>
                <p className="text-xs text-muted-foreground">{t("session.whyTrust")}</p>
              </div>
            ) : null}

            {step === "prerequisites" ? (
              <div className="space-y-3">
                {guide ? (
                  <ConnectGuide platform={platform} label={label} serverNeeds={entry.serverNeeds} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("session.noGuide")}</p>
                )}
                {defaultPath ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("session.recommendedPath")}{" "}
                    <span className="font-medium text-foreground">{defaultPath.label}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === "connect" ? (
              <div className="space-y-3">
                {dualPath || pathOptions.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {pathOptions
                      .filter((o) => o.id === "zernio" || o.id === "official")
                      .map((o) => (
                        <Button
                          key={o.id}
                          type="button"
                          size="sm"
                          variant={provider === o.id ? "default" : "outline"}
                          className="h-8 text-xs"
                          onClick={() => setProvider(o.id as "zernio" | "official")}
                        >
                          {o.label}
                        </Button>
                      ))}
                  </div>
                ) : null}

                {platform === "shopify" ? (
                  <div className="space-y-2">
                    <Label htmlFor="session-shopify">{t("session.shopifyLabel")}</Label>
                    <Input
                      id="session-shopify"
                      value={shopifyShop}
                      onChange={(e) => setShopifyShop(e.target.value)}
                      placeholder={SHOPIFY_DOMAIN_EXAMPLE}
                    />
                    {shopifyError ? (
                      <p className="text-xs text-destructive">{shopifyError}</p>
                    ) : null}
                  </div>
                ) : null}

                {mcpMeta && mcpMeta.auth !== "oauth" && mcpMeta.auth !== "keyless" ? (
                  <div className="space-y-2">
                    <Label htmlFor="session-mcp">{mcpMeta.credentialLabel}</Label>
                    <Input
                      id="session-mcp"
                      value={mcpCredential}
                      onChange={(e) => setMcpCredential(e.target.value)}
                      placeholder={mcpMeta.credentialPlaceholder}
                      type={mcpMeta.auth === "api_key" ? "password" : "text"}
                    />
                    {mcpError ? <p className="text-xs text-destructive">{mcpError}</p> : null}
                  </div>
                ) : null}

                {mcpMeta?.auth === "keyless" ? (
                  <p className="text-xs text-muted-foreground">{t("session.keylessHint")}</p>
                ) : null}

                {platform === "judgeme" ? (
                  <p className="text-xs text-muted-foreground">{t("session.judgemeHint")}</p>
                ) : null}
              </div>
            ) : null}

            {step === "verify" ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                <p className="text-sm font-medium">{t("session.verifying")}</p>
                <p className="text-xs text-muted-foreground">{t("session.verifyingHint")}</p>
              </div>
            ) : null}

            {step === "error" ? (
              <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground">{t("session.errorTitle")}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {errorMessage || t("session.verifyFailed")}
                    </p>
                    {errorFix ? (
                      <p className="text-xs text-foreground/90 leading-relaxed">{errorFix}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {step === "done" ? (
              <div className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{t("session.doneTitle", { label })}</p>
                    <p className="text-xs text-muted-foreground">{t("session.doneHint")}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {step === "why" ? (
              <Button type="button" className="w-full gap-1" onClick={() => {
                setStep("prerequisites");
                persist("prerequisites");
              }}>
                {t("session.continue")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}

            {step === "prerequisites" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="flex-1" onClick={() => {
                  setStep("why");
                  persist("why");
                }}>
                  {t("session.back")}
                </Button>
                <Button type="button" className="flex-1 gap-1" onClick={goConnect}>
                  {t("session.continueToConnect")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : null}

            {step === "connect" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep("prerequisites");
                    persist("prerequisites");
                  }}
                >
                  {t("session.back")}
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-1"
                  onClick={() => void handlePrimaryConnect()}
                  disabled={mcpConnecting || verifying}
                >
                  {mcpConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {t("session.connectCta", { label })}
                </Button>
              </div>
            ) : null}

            {step === "error" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleClose(false)}
                >
                  {t("session.close")}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => {
                    setStep("connect");
                    persist("connect");
                  }}
                >
                  {t("session.retry")}
                </Button>
              </div>
            ) : null}

            {step === "done" ? (
              <div className="flex w-full flex-col gap-2">
                {valueSurface ? (
                  <Button asChild type="button" className="w-full gap-1">
                    <Link
                      to={valueSurface.to}
                      onClick={() => {
                        clearPendingConnectSession();
                        onOpenChange(false);
                      }}
                    >
                      {t(valueSurface.labelKey)}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                ) : null}
                {nextPlatform && onStartPlatform ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      clearPendingConnectSession();
                      onStartPlatform(nextPlatform);
                    }}
                  >
                    {t("session.nextPlatform", {
                      label:
                        CONNECTION_CATALOG.find((e) => e.platform === nextPlatform)?.label ??
                        nextPlatform,
                    })}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    clearPendingConnectSession();
                    onOpenChange(false);
                  }}
                >
                  {t("session.doneClose")}
                </Button>
              </div>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JudgemeConnectDialog
        open={judgemeOpen}
        onOpenChange={setJudgemeOpen}
        businessProfileId={businessProfileId}
        onConnected={(result) => {
          addAccountFromOAuth(
            result.accountId,
            "judgeme",
            result.username,
            result.profileId ?? businessProfileId
          );
          window.dispatchEvent(new CustomEvent("automazing:connections-changed"));
          setJudgemeOpen(false);
          void runVerify(result.accountId);
        }}
      />
    </>
  );
}
