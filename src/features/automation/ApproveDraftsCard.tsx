import { Link } from "react-router-dom";
import { CheckSquare, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileDocument } from "@/features/profile-documents";
import { usePendingDmDrafts } from "./usePendingDmDrafts";

type Props = {
  businessProfileId: string | null | undefined;
  className?: string;
  /** Denser strip for Home → Idag (default card stays available). */
  compact?: boolean;
};

/**
 * Single attention surface for pending AI drafts across DM / mail / outreach / reviews.
 * Primary approve hub — surface on Home Idag, not buried under Mer.
 */
export function ApproveDraftsCard({ businessProfileId, className, compact }: Props) {
  const { count: dmDrafts } = usePendingDmDrafts(businessProfileId);
  const mailDoc = useProfileDocument<Array<{ status?: string }>>("mail-reply-queue", []);
  const outreachDoc = useProfileDocument<Array<{ status?: string }>>("outreach-queue", []);
  const reviewDoc = useProfileDocument<Array<{ status?: string }>>("review-reply-queue", []);

  const mailDrafts = (Array.isArray(mailDoc.data) ? mailDoc.data : []).filter(
    (i) => i?.status === "draft" || !i?.status
  ).length;
  const outreachDrafts = (Array.isArray(outreachDoc.data) ? outreachDoc.data : []).filter(
    (i) => i?.status === "draft" || !i?.status
  ).length;
  const reviewDrafts = (Array.isArray(reviewDoc.data) ? reviewDoc.data : []).filter(
    (i) => i?.status === "draft" || !i?.status
  ).length;

  const rows = [
    { label: "DM-svar", count: dmDrafts, to: "/messages?tab=instagram" },
    { label: "Mail-svar", count: mailDrafts, to: "/messages" },
    { label: "Outreach", count: outreachDrafts, to: "/sales?view=outreach-queue" },
    { label: "Recensioner", count: reviewDrafts, to: "/reviews?filter=needs_reply" },
  ].filter((r) => r.count > 0);

  if (!businessProfileId || rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  if (compact) {
    return (
      <section
        className={cn(
          "rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 sm:px-4",
          className
        )}
        aria-label="Godkänn utkast"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {total === 1 ? "1 AI-utkast att godkänna" : `${total} AI-utkast att godkänna`}
              </p>
              <p className="text-xs text-muted-foreground">
                Draft-before-send — granska innan något går ut.
              </p>
            </div>
          </div>
          <Button asChild type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs">
            <Link to={rows[0]?.to ?? "/messages"}>Öppna första</Link>
          </Button>
        </div>
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li key={row.to + row.label}>
              <Link
                to={row.to}
                className="flex items-center justify-between rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="font-medium tabular-nums">{row.count}</span>
                  <span className="ml-2 text-muted-foreground">{row.label}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      className={cn("rounded-lg border border-border bg-card px-3 py-3 sm:px-4", className)}
      aria-label="Godkänn utkast"
    >
      <div className="flex items-start gap-2 pb-2">
        <CheckSquare className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">Godkänn utkast</p>
          <p className="text-xs text-muted-foreground">
            {total === 1 ? "1 AI-utkast väntar på dig" : `${total} AI-utkast väntar på dig`} — granska
            innan något skickas.
          </p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.to + row.label}>
            <Link
              to={row.to}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              <span>
                <span className="font-medium tabular-nums">{row.count}</span>
                <span className="ml-2 text-muted-foreground">{row.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
