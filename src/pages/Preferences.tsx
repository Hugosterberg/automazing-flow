import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Palette,
  Plus,
  Save,
  Shield,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type ApiEntryRow = {
  key: string;
  value: string;
  description?: string;
  custom?: boolean;
  aliases?: string[];
  inputType?: "password" | "text";
};

type FeatureRequirement = {
  name: string;
  required?: string[];
  requiredAny?: string[][];
  testTarget?: string;
};

type ConfigTestResult = {
  ok: boolean;
  missing: string[];
  missingAny: string[][];
  message: string;
  authPath?: string | null;
  label?: string;
};

const presetEntries: ApiEntryRow[] = [
  { key: "OPENAI_API_KEY", value: "", description: "Used by AI routes and content generation." },
  { key: "ZERNIO_API_KEY", value: "", description: "Used for Zernio-connected channels and integrations." },
  { key: "LATE_API_KEY", value: "", description: "Legacy alias for the Zernio key that the backend still accepts.", aliases: ["ZERNIO_API_KEY"] },
  { key: "GOOGLE_CLIENT_ID", value: "", description: "Used by Google OAuth flows like Gmail, Drive, Calendar, and Reviews." },
  { key: "GOOGLE_CLIENT_SECRET", value: "", description: "Secret for Google OAuth flows." },
  { key: "MICROSOFT_CLIENT_ID", value: "", description: "Used by Outlook and Outlook Calendar OAuth." },
  { key: "MICROSOFT_CLIENT_SECRET", value: "", description: "Secret for Microsoft OAuth." },
  { key: "NOTION_CLIENT_ID", value: "", description: "Used by Notion OAuth." },
  { key: "NOTION_CLIENT_SECRET", value: "", description: "Secret for Notion OAuth." },
  { key: "SHOPIFY_API_KEY", value: "", description: "Used by Shopify OAuth." },
  { key: "SHOPIFY_API_SECRET", value: "", description: "Secret for Shopify OAuth." },
  { key: "INSTAGRAM_CLIENT_ID", value: "", description: "Used by the direct Instagram OAuth fallback." },
  { key: "INSTAGRAM_CLIENT_SECRET", value: "", description: "Secret for direct Instagram OAuth fallback." },
  { key: "TIKTOK_CLIENT_KEY", value: "", description: "Used by TikTok official OAuth." },
  { key: "TIKTOK_CLIENT_SECRET", value: "", description: "Secret for TikTok official OAuth." },
  { key: "X_CLIENT_ID", value: "", description: "Used by X/Twitter OAuth." },
  { key: "X_CLIENT_SECRET", value: "", description: "Secret for X/Twitter OAuth." },
  { key: "TRIPADVISOR_API_KEY", value: "", description: "Used by Tripadvisor official API." },
  { key: "TRIPADVISOR_LOCATION_ID", value: "", description: "Default location for Tripadvisor official API." },
  { key: "SHOPIFY_APP_URL", value: "", inputType: "text", description: "Public app URL used by Shopify callbacks and redirects." },
  { key: "NOTION_APP_URL", value: "", inputType: "text", description: "Public app URL used by Notion OAuth callbacks." },
];

const overviewFeatures = [
  { icon: Bell, title: "Notifications", desc: "Manage reminders and alerts" },
  { icon: Palette, title: "Appearance", desc: "Theme and visual settings" },
  { icon: Globe, title: "Language", desc: "Language and region" },
  { icon: Shield, title: "Security", desc: "Password and two-factor authentication" },
];

const featureRequirements: FeatureRequirement[] = [
  { name: "AI analysis", required: ["OPENAI_API_KEY"], testTarget: "openai" },
  { name: "Zernio social / reviews integrations", requiredAny: [["ZERNIO_API_KEY", "LATE_API_KEY"]], testTarget: "zernio" },
  { name: "Google Drive / Gmail / Calendar / Reviews OAuth", required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], testTarget: "google_drive" },
  { name: "Outlook / Outlook Calendar OAuth", required: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"], testTarget: "microsoft" },
  { name: "Notion OAuth", required: ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET", "NOTION_APP_URL"], testTarget: "notion" },
  { name: "Shopify OAuth", required: ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"], testTarget: "shopify" },
  { name: "Instagram direct fallback", required: ["INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"], testTarget: "instagram_direct" },
  { name: "TikTok official OAuth", required: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], testTarget: "tiktok" },
  { name: "X / Twitter OAuth", required: ["X_CLIENT_ID", "X_CLIENT_SECRET"], testTarget: "x" },
  { name: "Tripadvisor official API", required: ["TRIPADVISOR_API_KEY", "TRIPADVISOR_LOCATION_ID"], testTarget: "tripadvisor" },
];

function mergeRows(serverEntries: Record<string, string>): ApiEntryRow[] {
  const presetMap = new Map(
    presetEntries.map((row) => [row.key, { ...row, value: serverEntries[row.key] || "" }])
  );
  const customRows = Object.entries(serverEntries)
    .filter(([key]) => !presetMap.has(key))
    .map(([key, value]) => ({ key, value, custom: true as const }));
  return [...presetMap.values(), ...customRows];
}

export default function PreferencesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApiEntryRow[]>(presetEntries);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningTests, setRunningTests] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConfigTestResult>>({});

  const envMap = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.key.trim().toUpperCase(), row.value])),
    [rows]
  );

  const missingFeatures = useMemo(() => {
    return featureRequirements
      .map((feature) => {
        const missing = (feature.required || []).filter((key) => !String(envMap[key] || "").trim());
        const missingAny = (feature.requiredAny || []).filter(
          (group) => !group.some((key) => String(envMap[key] || "").trim())
        );
        return {
          ...feature,
          missing,
          missingAny,
          ok: missing.length === 0 && missingAny.length === 0,
        };
      })
      .filter((feature) => !feature.ok);
  }, [envMap]);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/settings/api-keys", { credentials: "include" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || "Could not load API keys.");
        }
        if (!ignore) {
          setRows(mergeRows(payload.entries || {}));
        }
      } catch (error) {
        if (!ignore) {
          toast({
            title: "Could not load API keys",
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [toast]);

  const visibleRows = useMemo(() => rows.filter((row) => row.key.trim().length > 0 || row.custom), [rows]);

  function updateRow(index: number, patch: Partial<ApiEntryRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addCustomRow() {
    setRows((current) => [...current, { key: "", value: "", custom: true, inputType: "password" }]);
  }

  function removeCustomRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function handleSave() {
    const entries = rows
      .map((row) => ({ key: row.key.trim().toUpperCase(), value: row.value }))
      .filter((row) => row.key.length > 0);

    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Could not save API keys.");
      }
      setRows(mergeRows(payload.entries || {}));
      setTestResults({});
      toast({
        title: "API keys saved",
        description: "The .env file was updated and the values are now available to the running server.",
      });
    } catch (error) {
      toast({
        title: "Could not save API keys",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runConfigTest(target: string) {
    setRunningTests((current) => ({ ...current, [target]: true }));
    try {
      const res = await fetch("/api/settings/api-keys/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Could not test ${target}.`);
      }
      setTestResults((current) => ({ ...current, [target]: payload }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTestResults((current) => ({
        ...current,
        [target]: { ok: false, missing: [], missingAny: [], message },
      }));
    } finally {
      setRunningTests((current) => ({ ...current, [target]: false }));
    }
  }

  return (
    <div className="space-y-6 max-w-5xl w-full mx-auto">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Preferences</h1>
        <p className="text-muted-foreground mt-1">
          Manage app settings and the integration values used by the server.
        </p>
      </motion.div>

      <Tabs defaultValue="api-keys" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {overviewFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.06 }}
              >
                <Card className="bg-card border-border glow-border">
                  <CardContent className="p-5 space-y-2">
                    <feature.icon className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="api-keys">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                API keys and required settings
              </CardTitle>
              <CardDescription>
                Stored in the project `.env` file and used by backend routes, OAuth flows, and integrations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading keys...</p>
              ) : (
                <>
                  <div className="space-y-4">
                    {visibleRows.map((row, index) => {
                      const normalizedKey = row.key.trim().toUpperCase();
                      const hasValue = String(envMap[normalizedKey] || "").trim().length > 0;
                      const isSecret = (row.inputType || "password") !== "text";

                      return (
                        <div key={`${row.key || "custom"}-${index}`} className="rounded-lg border border-border p-4 space-y-3">
                          <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_auto] gap-3 items-start">
                            <div className="space-y-1.5">
                              <Label htmlFor={`api-key-name-${index}`}>Key</Label>
                              <Input
                                id={`api-key-name-${index}`}
                                value={row.key}
                                onChange={(e) => updateRow(index, { key: e.target.value.toUpperCase() })}
                                placeholder="EXAMPLE_API_KEY"
                                disabled={!row.custom}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`api-key-value-${index}`}>{isSecret ? "Value" : "Setting"}</Label>
                              <Input
                                id={`api-key-value-${index}`}
                                type={isSecret ? "password" : "text"}
                                value={row.value}
                                onChange={(e) => updateRow(index, { value: e.target.value })}
                                placeholder={isSecret ? "Paste the secret value" : "https://example.com"}
                              />
                            </div>
                            <div className="pt-7">
                              {row.custom && (
                                <Button variant="ghost" size="icon" onClick={() => removeCustomRow(index)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {hasValue ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Connected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                                <XCircle className="h-3.5 w-3.5" />
                                Missing
                              </span>
                            )}
                            {row.aliases && row.aliases.length > 0 && (
                              <span className="text-muted-foreground">Alias for: {row.aliases.join(", ")}</span>
                            )}
                            {!isSecret && (
                              <span className="text-muted-foreground">Callback / app URL setting</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Card className="bg-muted/30 border-border">
                    <CardHeader>
                      <CardTitle className="text-base">Missing values by feature</CardTitle>
                      <CardDescription>
                        These functions still cannot work fully with the current `.env`.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {missingFeatures.length === 0 ? (
                        <p className="text-sm text-emerald-700">All tracked integrations have the required values.</p>
                      ) : (
                        missingFeatures.map((feature) => (
                          <div key={feature.name} className="rounded-lg border border-border bg-background p-3 space-y-2">
                            <p className="text-sm font-medium">{feature.name}</p>
                            {feature.missing.length > 0 && (
                              <p className="text-xs text-muted-foreground">Missing: {feature.missing.join(", ")}</p>
                            )}
                            {feature.missingAny.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Missing one of: {feature.missingAny.map((group) => group.join(" or ")).join(" · ")}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30 border-border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Wrench className="h-4 w-4" />
                        Integration tests
                      </CardTitle>
                      <CardDescription>
                        These tests validate whether each integration has the required `.env` values and callback settings.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {featureRequirements.map((feature) => {
                        const target = feature.testTarget;
                        const result = target ? testResults[target] : null;
                        const testing = target ? runningTests[target] : false;

                        return (
                          <div key={feature.name} className="rounded-lg border border-border bg-background p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{feature.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Run a config check before trying the live OAuth or API flow.
                                </p>
                              </div>
                              {target && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void runConfigTest(target)}
                                  disabled={testing}
                                >
                                  {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
                                  Test
                                </Button>
                              )}
                            </div>

                            {result && (
                              <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  {result.ok ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-700">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Ready
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                                      <XCircle className="h-3.5 w-3.5" />
                                      Missing config
                                    </span>
                                  )}
                                  {result.authPath && (
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" asChild>
                                      <a href={result.authPath} target="_blank" rel="noopener noreferrer">
                                        Open auth
                                        <ExternalLink className="h-3.5 w-3.5 ml-1" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{result.message}</p>
                                {result.missing.length > 0 && (
                                  <p className="text-xs text-muted-foreground">Missing: {result.missing.join(", ")}</p>
                                )}
                                {result.missingAny.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Missing one of: {result.missingAny.map((group) => group.join(" or ")).join(" · ")}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={addCustomRow}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add custom key
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "Saving..." : "Save API keys"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
