import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMcpProvidersStatus } from "./useMcpProvidersStatus";
import { fetchMcpTools, callMcpTool, type McpToolDescriptor } from "./mcpClientService";

function defaultArgsForTool(tool: McpToolDescriptor): string {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object") return "{}";
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return "{}";
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const sample: Record<string, unknown> = {};
  for (const key of required.length > 0 ? required : Object.keys(props).slice(0, 1)) {
    sample[key] = "";
  }
  return JSON.stringify(sample, null, 2);
}

/**
 * Browse and call raw MCP tools from connected accounts (tools/list + tools/call).
 */
export function McpToolsExplorer({ businessProfileId }: { businessProfileId: string | null }) {
  const { providers, isLoading: statusLoading } = useMcpProvidersStatus(businessProfileId, {
    probe: true,
  });

  const readyAccounts = useMemo(
    () => providers.filter((p) => p.status === "ready" && p.accountId),
    [providers]
  );

  const [platform, setPlatform] = useState<string>("");
  const [tools, setTools] = useState<McpToolDescriptor[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [argsJson, setArgsJson] = useState("{}");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const active = readyAccounts.find((p) => p.platform === platform);

  useEffect(() => {
    if (!platform && readyAccounts[0]) {
      setPlatform(readyAccounts[0].platform);
    }
  }, [platform, readyAccounts]);

  useEffect(() => {
    if (!active?.accountId) {
      setTools([]);
      setSelectedTool("");
      return;
    }
    let ignore = false;
    setToolsLoading(true);
    setToolsError(null);
    void fetchMcpTools(active.accountId)
      .then((res) => {
        if (ignore) return;
        setTools(res.tools);
        setSelectedTool(res.tools[0]?.name ?? "");
        setArgsJson(res.tools[0] ? defaultArgsForTool(res.tools[0]) : "{}");
      })
      .catch((err) => {
        if (!ignore) {
          setTools([]);
          setToolsError(err instanceof Error ? err.message : "Could not load tools.");
        }
      })
      .finally(() => {
        if (!ignore) setToolsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [active?.accountId]);

  useEffect(() => {
    const tool = tools.find((t) => t.name === selectedTool);
    if (tool) setArgsJson(defaultArgsForTool(tool));
  }, [selectedTool, tools]);

  async function runTool() {
    if (!active?.accountId || !selectedTool) return;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      setCallError("Arguments must be valid JSON.");
      return;
    }
    setCallLoading(true);
    setCallError(null);
    setResult(null);
    try {
      const res = await callMcpTool({
        accountId: active.accountId,
        name: selectedTool,
        arguments: args,
      });
      setResult(res.text);
      if (res.isError) setCallError("Tool returned an error response.");
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Tool call failed.");
    } finally {
      setCallLoading(false);
    }
  }

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden />
          MCP tools explorer
        </CardTitle>
        <CardDescription className="text-xs">
          List every tool exposed by a connected server and call any tool with custom JSON arguments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {statusLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Laddar konton…
          </p>
        ) : readyAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga MCP-konton redo. Koppla leverantörer under Kopplingar → MCP med giltiga API-nycklar eller OAuth.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-[220px] h-8 text-xs">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {readyAccounts.map((p) => (
                    <SelectItem key={p.platform} value={p.platform}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedTool}
                onValueChange={setSelectedTool}
                disabled={toolsLoading || tools.length === 0}
              >
                <SelectTrigger className="w-[260px] h-8 text-xs">
                  <SelectValue placeholder="Tool" />
                </SelectTrigger>
                <SelectContent>
                  {tools.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {toolsLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tools…
              </p>
            ) : null}
            {toolsError ? <p className="text-xs text-destructive">{toolsError}</p> : null}

            {selectedTool ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {tools.find((t) => t.name === selectedTool)?.description || "No description from provider."}
                </p>
                <Textarea
                  value={argsJson}
                  onChange={(e) => setArgsJson(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                  spellCheck={false}
                />
                <Button type="button" size="sm" disabled={callLoading} onClick={() => void runTool()}>
                  {callLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                      Call tool
                    </>
                  )}
                </Button>
              </>
            ) : null}

            {callError ? <p className="text-xs text-destructive">{callError}</p> : null}
            {result ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs font-sans">
                {result}
              </pre>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
