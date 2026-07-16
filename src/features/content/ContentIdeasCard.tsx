import { useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Loader2, Copy, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchContentIdeas, type ContentIdea } from "./contentIdeasClient";

interface Props {
  businessProfileId: string | null;
  context?: { businessName?: string; description?: string; audience?: string; platform?: string };
  onUseIdea?: (text: string) => void;
}

/**
 * AI content ideas — proposes ready-to-shoot post concepts (hook + format +
 * CTA) from the business context, with a heuristic fallback when no OpenAI key
 * is set. Self-contained: collapsed until the user asks for ideas.
 */
export function ContentIdeasCard({ businessProfileId, context, onUseIdea }: Props) {
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("");

  async function generate() {
    setLoading(true);
    try {
      const result = await fetchContentIdeas({
        business_profile_id: businessProfileId,
        businessName: context?.businessName,
        description: context?.description,
        audience: context?.audience,
        platform: context?.platform,
      });
      setIdeas(result.ideas);
      setSource(result.source);
      if (result.ideas.length === 0) toast.message("Inga idéer kom tillbaka — försök igen.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte ladda innehållsidéer.");
    } finally {
      setLoading(false);
    }
  }

  function ideaText(idea: ContentIdea) {
    return `${idea.title}\n\nHook: ${idea.hook}\nFormat: ${idea.format}\nCTA: ${idea.cta}`;
  }

  async function copyIdea(idea: ContentIdea) {
    const text = ideaText(idea);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Kopierat");
    } catch {
      toast.error("Kunde inte kopiera");
    }
  }

  function handleUseIdea(idea: ContentIdea) {
    onUseIdea?.(ideaText(idea));
    toast.success("Tillagd i utkastet");
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Content ideas
            </CardTitle>
            <CardDescription>AI post ideas tailored to your business.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void generate()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {ideas.length > 0 ? "Regenerate" : "Get ideas"}
          </Button>
        </div>
      </CardHeader>
      {ideas.length > 0 ? (
        <CardContent className="space-y-2">
          {source === "heuristic" ? (
            <p className="text-[11px] text-muted-foreground">General starters — set an OpenAI key for tailored ideas.</p>
          ) : null}
          {ideas.map((idea, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{idea.title}</p>
                {idea.hook ? <p className="text-xs text-muted-foreground mt-0.5">“{idea.hook}”</p> : null}
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  {[idea.format, idea.cta].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {onUseIdea ? (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleUseIdea(idea)}>
                    Use
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void copyIdea(idea)}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy idea</span>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
