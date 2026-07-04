import { Loader2, MapPin, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleBusinessIcon } from "@/components/platform-icons";
import type { GoogleBusinessPanelData } from "./socialApiTypes";

/** Google Business Profile details + recent reviews for the selected account. */
export function GoogleBusinessCard({
  panel,
  loading,
}: {
  panel: GoogleBusinessPanelData | undefined;
  loading: boolean;
}) {
  return (
    <Card className="bg-card border-border glow-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GoogleBusinessIcon className="h-5 w-5" />
          Google Business Profile
        </CardTitle>
        <CardDescription>
          {panel?.source === "official"
            ? "Data from Google Business Profile APIs."
            : "Data from your linked Zernio account (location + reviews when available)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Loading profile…
          </div>
        ) : panel ? (
          <>
            <div className="space-y-2 text-sm">
              {panel.title ? <p className="font-medium text-foreground">{panel.title}</p> : null}
              {panel.primaryCategory ? <p className="text-muted-foreground">{panel.primaryCategory}</p> : null}
              {panel.addressLines.length > 0 ? (
                <p className="flex gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{panel.addressLines.join(", ")}</span>
                </p>
              ) : null}
              {panel.phone ? <p className="text-muted-foreground">{panel.phone}</p> : null}
              {panel.website ? (
                <a
                  href={panel.website.startsWith("http") ? panel.website : `https://${panel.website}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {panel.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
            {panel.reviews.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recent reviews
                </p>
                <ul className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {panel.reviews.map((r) => (
                    <li key={r.id} className="rounded-md border border-border/80 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium">{r.author}</span>
                        {r.rating != null && r.rating > 0 ? (
                          <span className="text-xs text-muted-foreground">{r.rating.toFixed(1)} ★</span>
                        ) : null}
                      </div>
                      {r.text ? <p className="text-muted-foreground leading-relaxed">{r.text}</p> : null}
                      {r.createdAt ? (
                        <p className="text-[11px] text-muted-foreground/80 mt-1">{r.createdAt}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No location or review details returned yet. For Zernio, confirm GBP add-ons; for the official API,
            reconnect under Connect more → Google Business via Official API.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
