import { useEffect, useState } from "react";
import { Loader2, Tag } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { fetchFortnoxArticles, type FortnoxArticle } from "./economyClient";

/**
 * Browse the Fortnox article register. Articles are otherwise created
 * implicitly the first time a product is invoiced (see fortnoxInvoiceJobs.ts)
 * — this card is read-only.
 */
export function FortnoxArticlesCard({ businessProfileId }: { businessProfileId: string | null }) {
  const [articles, setArticles] = useState<FortnoxArticle[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessProfileId) {
      setArticles([]);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    fetchFortnoxArticles(businessProfileId)
      .then((result) => {
        if (ignore) return;
        setConnected(result.connected);
        setArticles(result.articles);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [businessProfileId]);

  if (!businessProfileId || !connected || (!loading && articles.length === 0)) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4 text-primary" />
          Artikelregister
        </CardTitle>
        <CardDescription>Produkter i Fortnox — nya artiklar skapas automatiskt när en produkt faktureras första gången.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar artiklar…
          </div>
        ) : (
          <ul className="space-y-1 max-h-60 overflow-y-auto">
            {articles.map((article) => (
              <li
                key={article.articleNumber}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate">
                  {article.articleNumber} · {article.description}
                </span>
                {article.salesPrice > 0 ? (
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {formatCurrency(article.salesPrice, "SEK")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
