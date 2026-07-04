import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Loader2, Megaphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOutreachContentIdeas, type OutreachContentIdea, type OutreachContentInput } from "./outreachClient";

function ideaText(idea: OutreachContentIdea) {
  return `${idea.title}\n\nHook: ${idea.hook}\nFormat: ${idea.format}\nAudience: ${idea.audience}\nChannel: ${idea.channel}\nCTA: ${idea.cta}`;
}

export function OutreachContentCard({
  businessProfileId,
  context,
  onUseIdea,
}: {
  businessProfileId: string | null;
  context: Omit<OutreachContentInput, "business_profile_id">;
  onUseIdea?: (text: string) => void;
}) {
  const [ideas, setIdeas] = useState<OutreachContentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("");

  async function generate() {
    setLoading(true);
    try {
      const result = await fetchOutreachContentIdeas({
        business_profile_id: businessProfileId,
        ...context,
      });
      setIdeas(result.ideas);
      setSource(result.source);
      if (result.ideas.length === 0) toast.message("No ideas came back — try again.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load outreach content ideas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Content that attracts customers
            </CardTitle>
            <CardDescription>
              Post and asset ideas that warm up potential buyers — not just posts for existing followers.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void generate()} disabled={loading || !businessProfileId}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {ideas.length > 0 ? "Regenerate" : "Get ideas"}
          </Button>
        </div>
      </CardHeader>
      {ideas.length > 0 ? (
        <CardContent className="space-y-2">
          {source === "heuristic" ? (
            <p className="text-[11px] text-muted-foreground">General starters — set OpenAI key for ICP-tailored ideas.</p>
          ) : null}
          {ideas.map((idea, index) => (
            <div
              key={index}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card px-3.5 py-2.5"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{idea.title}</p>
                {idea.hook ? <p className="text-xs text-muted-foreground">“{idea.hook}”</p> : null}
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {idea.channel}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {idea.audience}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {onUseIdea ? (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onUseIdea(ideaText(idea))}>
                    Use
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                    <Link to="/content?tab=publish">Create →</Link>
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void navigator.clipboard.writeText(ideaText(idea)).then(() => toast.success("Copied"))}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy</span>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
