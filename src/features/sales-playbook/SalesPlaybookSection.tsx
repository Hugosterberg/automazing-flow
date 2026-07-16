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
    description: "Värdeerbjudanden och hisspitchar som säljer ditt erbjudande.",
    icon: Target,
  },
  {
    id: "cold-outreach",
    label: "Outreach",
    description: "Mail- och LinkedIn-öppningar som startar samtal.",
    icon: MessageSquareQuote,
  },
  {
    id: "objections",
    label: "Invändningar",
    description: "Svar när köpare tvekar på pris, timing eller passform.",
    icon: Zap,
  },
  {
    id: "campaigns",
    label: "Kampanjer",
    description: "Marknadskampanjer på 30–90 dagar som driver försäljning.",
    icon: Megaphone,
  },
  {
    id: "channels",
    label: "Kanaler",
    description: "Var du bör marknadsföra och sälja dina produkter.",
    icon: TrendingUp,
  },
  {
    id: "promotions",
    label: "Erbjudanden",
    description: "Erbjudanden, paket och krokar som konverterar.",
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
  onUseForOutreach?: (item: SalesPlaybookItem) => void;
  onUseForCampaign?: (item: SalesPlaybookItem) => void;
  onUseForContent?: (item: SalesPlaybookItem) => void;
  onOpenEcommerce?: () => void;
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
  title = "Sälj- & marknadsföringsplaybook",
  description = "AI-idéer för pitch, outreach, invändningar, kampanjer, kanalval och erbjudanden.",
  onUseForOutreach,
  onUseForCampaign,
  onUseForContent,
  onOpenEcommerce,
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
      if (result.items.length === 0) toast.message("Inga idéer kom tillbaka — försök igen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte ladda idéer.");
    } finally {
      setLoading(false);
    }
  }

  function copyItem(item: SalesPlaybookItem) {
    void navigator.clipboard.writeText(itemText(item));
    toast.success("Kopierat");
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
            Generera idéer
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
                mode={tab.id}
                emptyText={`Klicka på "Generera idéer" för ${tab.label.toLowerCase()} anpassade till din verksamhet.`}
                onCopy={copyItem}
                onUseForOutreach={onUseForOutreach}
                onUseForCampaign={onUseForCampaign}
                onUseForContent={onUseForContent}
                onOpenEcommerce={onOpenEcommerce}
              />
            </TabsContent>
          ))}
        </Tabs>

        {source && activeItems.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Källa: {source === "ai" ? "AI" : "generella idéer"}
            {activeMeta ? ` · ${activeMeta.label}` : ""}
            {` · ${activeItems.length} idéer`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PlaybookList({
  items,
  mode,
  emptyText,
  onCopy,
  onUseForOutreach,
  onUseForCampaign,
  onUseForContent,
  onOpenEcommerce,
}: {
  items: SalesPlaybookItem[];
  mode: SalesPlaybookMode;
  emptyText: string;
  onCopy: (item: SalesPlaybookItem) => void;
  onUseForOutreach?: (item: SalesPlaybookItem) => void;
  onUseForCampaign?: (item: SalesPlaybookItem) => void;
  onUseForContent?: (item: SalesPlaybookItem) => void;
  onOpenEcommerce?: () => void;
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
            <div className="flex flex-wrap gap-1 shrink-0">
              {mode === "cold-outreach" && onUseForOutreach ? (
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onUseForOutreach(item)}>
                  Skriv outreach-utkast
                </Button>
              ) : null}
              {mode === "campaigns" && onUseForCampaign ? (
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onUseForCampaign(item)}>
                  Planera kampanj
                </Button>
              ) : null}
              {(mode === "pitch-angles" || mode === "channels") && onUseForContent ? (
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onUseForContent(item)}>
                  Använd i Innehåll
                </Button>
              ) : null}
              {mode === "promotions" && onOpenEcommerce ? (
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onOpenEcommerce}>
                  Butikserbjudanden
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={() => onCopy(item)}>
                <Copy className="h-3.5 w-3.5" />
                <span className="sr-only">Kopiera</span>
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
