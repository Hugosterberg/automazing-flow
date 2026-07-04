import { useState } from "react";
import { Copy, ExternalLink, Globe2, Loader2, Mail, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchBrandDiscoverySuggestions,
  type BrandDiscoveryMode,
  type BrandDiscoverySuggestion,
} from "./brandDiscoveryClient";

type BrandDiscoverySectionProps = {
  businessProfileId: string | null;
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  onAddAsLead?: (item: BrandDiscoverySuggestion) => void | Promise<void>;
};

function openSuggestion(item: BrandDiscoverySuggestion) {
  if (item.kind === "email") {
    window.location.href = `mailto:${item.value}`;
    return;
  }
  window.open(item.value, "_blank", "noopener,noreferrer");
}

export function BrandDiscoverySection({
  businessProfileId,
  businessName,
  company,
  website,
  email,
  location,
  notes,
  onAddAsLead,
}: BrandDiscoverySectionProps) {
  const [mode, setMode] = useState<BrandDiscoveryMode>("websites");
  const [websites, setWebsites] = useState<BrandDiscoverySuggestion[]>([]);
  const [emails, setEmails] = useState<BrandDiscoverySuggestion[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);

  const activeList = mode === "websites" ? websites : emails;

  async function loadSuggestions(nextMode: BrandDiscoveryMode) {
    setLoading(true);
    try {
      const result = await fetchBrandDiscoverySuggestions({
        business_profile_id: businessProfileId,
        mode: nextMode,
        businessName,
        company,
        website,
        email,
        location,
        notes,
      });
      if (nextMode === "websites") setWebsites(result.suggestions);
      else setEmails(result.suggestions);
      setSource(result.source);
      if (result.suggestions.length === 0) {
        toast.message("No suggestions came back — try again.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load suggestions.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    await loadSuggestions(mode);
  }

  function copyValue(value: string) {
    void navigator.clipboard.writeText(value);
    toast.success("Copied");
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              Outreach discovery
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Get 20 websites or email addresses to check for outreach — tied to your brand, market, and online presence.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => void handleGenerate()} disabled={loading || !businessProfileId}>
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate 20 suggestions
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={mode}
          onValueChange={(value) => {
            const next = value === "emails" ? "emails" : "websites";
            setMode(next);
            if ((next === "websites" ? websites : emails).length === 0) {
              void loadSuggestions(next);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="websites" className="gap-1.5">
              <Globe2 className="h-3.5 w-3.5" />
              Websites
            </TabsTrigger>
            <TabsTrigger value="emails" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="websites" className="mt-4 space-y-3">
            <SuggestionList
              items={websites}
              emptyText='Click "Generate 20 suggestions" for sites to visit or research.'
              onOpen={openSuggestion}
              onCopy={copyValue}
              onAddAsLead={onAddAsLead}
            />
          </TabsContent>

          <TabsContent value="emails" className="mt-4 space-y-3">
            <SuggestionList
              items={emails}
              emptyText='Click "Generate 20 suggestions" for email addresses and contact paths to verify.'
              onOpen={openSuggestion}
              onCopy={copyValue}
              onAddAsLead={onAddAsLead}
            />
          </TabsContent>
        </Tabs>

        {source ? (
          <p className="text-[11px] text-muted-foreground">
            Source: {source === "ai" ? "AI" : "general ideas"}
            {activeList.length > 0 ? ` · ${activeList.length} suggestions` : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SuggestionList({
  items,
  emptyText,
  onOpen,
  onCopy,
  onAddAsLead,
}: {
  items: BrandDiscoverySuggestion[];
  emptyText: string;
  onOpen: (item: BrandDiscoverySuggestion) => void;
  onCopy: (value: string) => void;
  onAddAsLead?: (item: BrandDiscoverySuggestion) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.kind}:${item.value}`}
          className="rounded-xl border border-border/80 bg-muted/20 p-3 transition-colors hover:bg-muted/35"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{item.label}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {item.category}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {item.kind === "email" ? "Email" : "Web"}
                </Badge>
              </div>
              <p className="break-all font-mono text-xs text-primary">{item.value}</p>
              {item.reason ? <p className="text-xs leading-relaxed text-muted-foreground">{item.reason}</p> : null}
            </div>
            <div className="flex shrink-0 gap-1">
              {onAddAsLead ? (
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => void onAddAsLead(item)}>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="sr-only">Add as lead</span>
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => onCopy(item.value)}>
                <Copy className="h-3.5 w-3.5" />
                <span className="sr-only">Copy</span>
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => onOpen(item)}>
                {item.kind === "email" ? <Mail className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                <span className="sr-only">Open</span>
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
