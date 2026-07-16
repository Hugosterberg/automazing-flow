import { Link } from "react-router-dom";
import { CheckSquare, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfileDocument } from "@/features/profile-documents";
import { usePendingDmDrafts } from "./usePendingDmDrafts";

type Props = {
  businessProfileId: string | null | undefined;
};

/**
 * Single attention surface for pending AI drafts across DM / mail / outreach / reviews.
 */
export function ApproveDraftsCard({ businessProfileId }: Props) {
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

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckSquare className="h-4 w-4" aria-hidden />
          Godkänn utkast
        </CardTitle>
        <CardDescription>
          {total === 1 ? "1 AI-utkast väntar på dig" : `${total} AI-utkast väntar på dig`} — granska innan något skickas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((row) => (
          <Link
            key={row.to + row.label}
            to={row.to}
            className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
          >
            <span>
              <span className="font-medium tabular-nums">{row.count}</span>
              <span className="ml-2 text-muted-foreground">{row.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
