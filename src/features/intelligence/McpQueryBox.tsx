import { useMemo, useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { McpReadinessHint } from "./McpReadinessHint";
import { useMcpProvidersStatus } from "./useMcpProvidersStatus";
import type { McpProviderReadiness } from "./intelligenceService";

export interface McpQueryResult {
  provider: string;
  tool: string;
  query: string;
  text: string;
}

interface McpQueryBoxProps {
  businessProfileId: string | null;
  /** MCP platform ids — first ready provider wins on the server. */
  platforms: string[];
  title: string;
  description?: string;
  placeholder: string;
  buttonLabel?: string;
  onQuery: (query: string) => Promise<McpQueryResult>;
  multiline?: boolean;
}

function pickReadiness(
  providers: McpProviderReadiness[],
  platforms: string[]
): McpProviderReadiness | null {
  for (const platform of platforms) {
    const hit = providers.find((p) => p.platform === platform);
    if (hit) return hit;
  }
  return null;
}

/**
 * Small query UI for a feature backed by one or more MCP providers.
 * Surfaces missing-key / reconnect state before the user runs a search.
 */
export function McpQueryBox({
  businessProfileId,
  platforms,
  title,
  description,
  placeholder,
  buttonLabel = "Run",
  onQuery,
  multiline = false,
}: McpQueryBoxProps) {
  const { providers } = useMcpProvidersStatus(businessProfileId);
  const readiness = useMemo(() => pickReadiness(providers, platforms), [providers, platforms]);
  const canRun = readiness?.status === "ready";

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<McpQueryResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyResult() {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function run() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await onQuery(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-border/80 p-3 space-y-2">
      <div>
        <p className="text-xs font-medium">{title}</p>
        {description ? <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      <McpReadinessHint readiness={readiness} />
      <div className="flex flex-wrap gap-2">
        {multiline ? (
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex min-h-[72px] w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
            }}
          />
        ) : (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="max-w-md text-sm"
            onKeyDown={(e) => e.key === "Enter" && void run()}
          />
        )}
        <Button
          type="button"
          size="sm"
          disabled={loading || !query.trim() || !canRun}
          onClick={() => void run()}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonLabel}
        </Button>
      </div>
      {!canRun && readiness?.status === "not_connected" ? (
        <p className="text-[11px] text-muted-foreground">
          Connect the provider under Connections → Intelligence &amp; MCP.
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {result ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void copyResult()}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs text-muted-foreground font-sans">
            {result.text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
