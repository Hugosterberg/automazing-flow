import { useState } from "react";
import { AlertCircle, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { runContentSafetyCheck } from "./contentSafetyCheck";
import type { PublishReadiness } from "./apiaiResultInsights";

export function PublishSafetyPanel({
  businessProfileId,
  imageAssets,
  readiness,
  onReadinessChange,
  onBeforeRequest,
}: {
  businessProfileId: string | null;
  imageAssets: SelectedContentAsset[];
  readiness: PublishReadiness | null;
  onReadinessChange: (readiness: PublishReadiness | null) => void;
  onBeforeRequest?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"moderation" | "quality-gate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck(kind: "moderation" | "quality-gate") {
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
      setError(e instanceof Error ? e.message : "Safety check failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-border bg-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Pre-publish checks
        </CardTitle>
        <CardDescription>
          Run apiai.me moderation or quality checks on your first selected image before you publish.
        </CardDescription>
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
            Moderation check
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!businessProfileId || imageAssets.length === 0 || busy !== null}
            onClick={() => void runCheck("quality-gate")}
          >
            {busy === "quality-gate" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Quality check
          </Button>
          {readiness ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onReadinessChange(null)}>
              Clear
            </Button>
          ) : null}
        </div>

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
