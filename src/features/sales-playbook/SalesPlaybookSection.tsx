import { useState } from "react";
import {
  Copy,
  Loader2,
  Megaphone,
  MessageSquareQuote,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchSalesPlaybookItems,
  type SalesPlaybookItem,
  type SalesPlaybookMode,
} from "./salesPlaybookClient";

const ALL_PLAYBOOK_MODES: {
  id: SalesPlaybookMode;
  label: string;
  description: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: "pitch-angles",
    label: "Pitch",
    description: "Value props and elevator pitches to sell your offer.",
    icon: Target,
  },
  {
    id: "cold-outreach",
    label: "Outreach",
    description: "Email and LinkedIn openers to start conversations.",
    icon: MessageSquareQuote,
  },
  {
    id: "objections",
    label: "Objections",
    description: "Responses when buyers push back on price, timing or fit.",
    icon: Zap,
  },
  {
    id: "campaigns",
    label: "Campaigns",
    description: "30–90 day marketing campaigns to drive sales.",
    icon: Megaphone,
  },
  {
    id: "channels",
    label: "Channels",
    description: "Where to promote and sell your products.",
    icon: TrendingUp,
  },
  {
    id: "promotions",
    label: "Promos",
    description: "Offers, bundles and hooks that convert.",
    icon: Tag,
  },
];

type SalesPlaybookSectionProps = {
  businessProfileId: string | null;
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  /** Limit visible tabs — defaults to all six modes. */
  modes?: SalesPlaybookMode[];
  defaultMode?: SalesPlaybookMode;
  title?: string;
  description?: string;
};

function itemText(item: SalesPlaybookItem): string {
  return [item.title, item.body, item.detail].filter(Boolean).join("\n\n");
}

export function SalesPlaybookSection({
  businessProfileId,
  businessName,
  company,
  website,
  email,
  location,
  notes,
  modes,
  defaultMode,
  title = "Sales & marketing playbook",
  description = "AI ideas to pitch, outreach, handle objections, run campaigns, pick channels and launch promotions.",
}: SalesPlaybookSectionProps) {
  const visibleModes = modes?.length
    ? ALL_PLAYBOOK_MODES.filter((m) => modes.includes(m.id))
    : ALL_PLAYBOOK_MODES;
  const initialMode = defaultMode && visibleModes.some((m) => m.id === defaultMode)
    ? defaultMode
    : visibleModes[0]?.id ?? "pitch-angles";

  const [mode, setMode] = useState<SalesPlaybookMode>(initialMode);
  const [cache, setCache] = useState<Partial<Record<SalesPlaybookMode, SalesPlaybookItem[]>>>({});
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);

  const activeItems = cache[mode] ?? [];

  async function loadItems(nextMode: SalesPlaybookMode) {
    setLoading(true);
    try {
      const result = await fetchSalesPlaybookItems({
        business_profile_id: businessProfileId,
        mode: nextMode,
        businessName,
        company,
        website,
        email,
        location,
        notes,
      });
      setCache((prev) => ({ ...prev, [nextMode]: result.items }));
      setSource(result.source);
      if (result.items.length === 0) toast.message("No ideas came back — try again.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load ideas.");
    } finally {
      setLoading(false);
    }
  }

  function copyItem(item: SalesPlaybookItem) {
    void navigator.clipboard.writeText(itemText(item));
    toast.success("Copied");
  }

  const activeMeta = visibleModes.find((m) => m.id === mode);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="max-w-2xl">{description}</CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => void loadItems(mode)} disabled={loading || !businessProfileId}>
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate ideas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={mode}
          onValueChange={(value) => {
            const next = (visibleModes.find((m) => m.id === value)?.id ?? initialMode) as SalesPlaybookMode;
            setMode(next);
          }}
        >
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {visibleModes.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="gap-1.5 data-[state=active]:bg-muted"
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleModes.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">{tab.description}</p>
              <PlaybookList
                items={cache[tab.id] ?? []}
                emptyText={`Click "Generate ideas" for ${tab.label.toLowerCase()} tailored to your business.`}
                onCopy={copyItem}
              />
            </TabsContent>
          ))}
        </Tabs>

        {source && activeItems.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Source: {source === "ai" ? "AI" : "general ideas"}
            {activeMeta ? ` · ${activeMeta.label}` : ""}
            {` · ${activeItems.length} ideas`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PlaybookList({
  items,
  emptyText,
  onCopy,
}: {
  items: SalesPlaybookItem[];
  emptyText: string;
  onCopy: (item: SalesPlaybookItem) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.category}:${item.title}`}
          className="rounded-xl border border-border/80 bg-muted/20 p-3 transition-colors hover:bg-muted/35"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{item.title}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {item.category}
                </Badge>
              </div>
              {item.body ? <p className="text-sm leading-relaxed text-foreground/90">{item.body}</p> : null}
              {item.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p> : null}
            </div>
            <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={() => onCopy(item)}>
              <Copy className="h-3.5 w-3.5" />
              <span className="sr-only">Copy</span>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
