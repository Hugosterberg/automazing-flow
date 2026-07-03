import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchMultiSourceAssessment,
  type McpSourceAssessment,
  type MultiSourceAssessmentResponse,
} from "./intelligenceService";

function SourceStatusBadge({ source }: { source: McpSourceAssessment }) {
  if (source.status === "success") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Response
      </Badge>
    );
  }
  if (source.status === "skipped" && (source.skipReason === "missing_credential" || source.skipReason === "auth_expired")) {
    return (
      <Badge variant="destructive" className="gap-1">
        <KeyRound className="h-3 w-3" aria-hidden />
        Key / OAuth
      </Badge>
    );
  }
  if (source.status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" aria-hidden />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      Not connected
    </Badge>
  );
}

function SourceAssessmentCard({ source }: { source: McpSourceAssessment }) {
  return (
    <Card className="border-border/70 h-full flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">{source.providerLabel}</CardTitle>
            <CardDescription className="text-[11px] mt-0.5">{source.lens}</CardDescription>
          </div>
          <SourceStatusBadge source={source} />
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">source: {source.platform}</p>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 flex-1 flex flex-col">
        {source.status === "success" && source.text ? (
          <>
            <pre className="flex-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-foreground font-sans">
              {source.text}
            </pre>
            {source.tool ? (
              <p className="text-[10px] text-muted-foreground mt-2">Tool: {source.tool}</p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground rounded-md bg-muted/20 p-3 flex-1">
            {source.message ||
              (source.status === "skipped"
                ? "Connect this provider under Connections → Intelligence & MCP to include its view."
                : "No response from this source.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Paste a domain or company name — fetches all connected MCP lenses in parallel
 * and shows each provider's judgment side by side with clear source labels.
 */
export function McpMultiSourceCompare({
  businessProfileId,
  initialSubject = "",
}: {
  businessProfileId: string | null;
  initialSubject?: string;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MultiSourceAssessmentResponse | null>(null);

  useEffect(() => {
    if (initialSubject) setSubject(initialSubject);
  }, [initialSubject]);

  async function runCompare() {
    const value = subject.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fetchMultiSourceAssessment({ businessProfileId, subject: value }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }

  const successSources = result?.sources.filter((s) => s.status === "success") ?? [];
  const skippedSources = result?.sources.filter((s) => s.status === "skipped") ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Scale className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Compare sources</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter a domain or company — each connected MCP evaluates from its own angle (SEO, DNS, competitive, web intel, marketing, context).
              Skipped sources show why (missing key, not connected).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. automazing.life or Acme Corp"
            className="max-w-md text-sm"
            onKeyDown={(e) => e.key === "Enter" && void runCompare()}
          />
          <Button type="button" size="sm" disabled={loading || !subject.trim()} onClick={() => void runCompare()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compare all sources"}
          </Button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{result.subject}</span>
            <Badge variant="secondary">{result.kind === "domain" ? "Domain" : "Company"}</Badge>
            <span>
              {result.summary.success} of {result.summary.total} sources responded
              {skippedSources.length > 0 ? ` · ${skippedSources.length} skipped` : ""}
            </span>
          </div>

          {successSources.length >= 2 ? (
            <p className="text-xs text-muted-foreground">
              Compare judgments below — each card is an independent MCP source with a different lens.
            </p>
          ) : successSources.length === 1 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Only one source responded. Connect more providers to compare different assessments.
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              No sources responded. Connect MCP providers under Connections and add API keys where required.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {result.sources.map((source) => (
              <SourceAssessmentCard key={source.sourceId} source={source} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
