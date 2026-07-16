import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { runContentSafetyCheck } from "./contentSafetyCheck";
import type { PublishReadiness } from "./apiaiResultInsights";
import { assetFingerprint } from "./contentAutomationPrefs";

export function PublishSafetyPanel({
  businessProfileId,
  imageAssets,
  readiness,
  onReadinessChange,
  onBeforeRequest,
  autoRunModeration = false,
}: {
  businessProfileId: string | null;
  imageAssets: SelectedContentAsset[];
  readiness: PublishReadiness | null;
  onReadinessChange: (readiness: PublishReadiness | null) => void;
  onBeforeRequest?: () => Promise<void>;
  autoRunModeration?: boolean;
}) {
  const { t } = useTranslation("content");
  const [busy, setBusy] = useState<"moderation" | "quality-gate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAutoFingerprintRef = useRef("");

  const runCheck = useCallback(
    async (kind: "moderation" | "quality-gate") => {
      if (!businessProfileId) return;
      setBusy(kind);
      setError(null);
      try {
        await onBeforeRequest?.();
        const result = await runContentSafetyCheck({
          businessProfileId,
          assets: imageAssets,
          kind,
        });
        onReadinessChange(result.readiness);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("safety.checkFailed"));
      } finally {
        setBusy(null);
      }
    },
    [businessProfileId, imageAssets, onBeforeRequest, onReadinessChange, t]
  );

  useEffect(() => {
    if (!autoRunModeration || !businessProfileId || imageAssets.length === 0) return;
    const fingerprint = assetFingerprint(imageAssets);
    if (!fingerprint || fingerprint === lastAutoFingerprintRef.current) return;
    lastAutoFingerprintRef.current = fingerprint;
    void runCheck("moderation");
  }, [autoRunModeration, businessProfileId, imageAssets, runCheck]);

  return (
    <Card className="border-border bg-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("safety.title")}
          {autoRunModeration ? (
            <span className="text-[10px] font-normal text-muted-foreground">{t("safety.autoModeration")}</span>
          ) : null}
        </CardTitle>
        <CardDescription>{t("safety.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!businessProfileId || imageAssets.length === 0 || busy !== null}
            onClick={() => void runCheck("moderation")}
          >
            {busy === "moderation" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {t("safety.rerunModeration")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!businessProfileId || imageAssets.length === 0 || busy !== null}
            onClick={() => void runCheck("quality-gate")}
          >
            {busy === "quality-gate" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {t("safety.qualityCheck")}
          </Button>
          {readiness ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onReadinessChange(null)}>
              {t("safety.clear")}
            </Button>
          ) : null}
        </div>

        {busy && autoRunModeration ? (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("safety.checking")}
          </p>
        ) : null}

        {readiness ? (
          <Alert variant={readiness.severity === "block" ? "destructive" : "default"}>
            {readiness.ok ? <Sparkles className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{readiness.label}</AlertTitle>
            {readiness.detail ? <AlertDescription>{readiness.detail}</AlertDescription> : null}
          </Alert>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
