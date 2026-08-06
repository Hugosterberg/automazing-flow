import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Mail, MessageSquare, ShoppingCart, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfileDocument } from "@/features/profile-documents";
import { formatDateTimeShort } from "@/lib/format";
import {
  OUTREACH_QUEUE_DOC_KEY,
  pendingOutreachItems,
  type OutreachQueueItem,
} from "@/features/outreach/outreachQueueTypes";
import {
  REVIEW_REPLY_QUEUE_DOC_KEY,
  type ReviewReplyQueueItem,
} from "@/features/reviews/ReviewReplyQueueSection";

type CartRecoverySentDoc = {
  checkoutIds?: string[];
  lastRunAt?: string;
};

type SocialWorkflowsDoc = {
  enabled?: Record<string, boolean>;
  lastPipelineRunAt?: string;
};

type ContentPipelineItem = {
  id: string;
  status: "queued" | "scheduled" | "failed";
};

function formatWhen(iso?: string): string {
  return formatDateTimeShort(iso) || "—";
}

export function FlowAutomationStatusCard({ businessProfileId }: { businessProfileId: string | null }) {
  const { t } = useTranslation("automations");
  const outreachDoc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  const reviewDoc = useProfileDocument<ReviewReplyQueueItem[]>(REVIEW_REPLY_QUEUE_DOC_KEY, []);
  const cartDoc = useProfileDocument<CartRecoverySentDoc>("cart-recovery-sent", {});
  const workflowsDoc = useProfileDocument<SocialWorkflowsDoc>("social-workflows", { enabled: {} });
  const pipelineDoc = useProfileDocument<ContentPipelineItem[]>("content-pipeline-queue", []);

  const stats = useMemo(() => {
    const outreachPending = pendingOutreachItems(outreachDoc.data).length;
    const reviewPending = reviewDoc.data.filter((r) => r.status === "draft" || !r.status).length;
    const cartSent = Array.isArray(cartDoc.data.checkoutIds) ? cartDoc.data.checkoutIds.length : 0;
    const activeWorkflows = Object.values(workflowsDoc.data.enabled ?? {}).filter(Boolean).length;
    const pipelineQueued = pipelineDoc.data.filter((i) => i.status === "queued").length;
    return { outreachPending, reviewPending, cartSent, activeWorkflows, pipelineQueued };
  }, [outreachDoc.data, reviewDoc.data, cartDoc.data, workflowsDoc.data, pipelineDoc.data]);

  if (!businessProfileId) return null;

  const rows = [
    {
      icon: Users,
      label: t("flowStatus.outreach"),
      value: t("flowStatus.drafts", { count: stats.outreachPending }),
      href: "/sales?view=outreach-queue",
    },
    {
      icon: MessageSquare,
      label: t("flowStatus.reviews"),
      value: t("flowStatus.drafts", { count: stats.reviewPending }),
      href: "/reviews?filter=needs_reply",
    },
    {
      icon: ShoppingCart,
      label: t("flowStatus.cart"),
      value: t("flowStatus.emailsSent", { count: stats.cartSent }),
      detail: cartDoc.data.lastRunAt
        ? t("flowStatus.lastRun", { when: formatWhen(cartDoc.data.lastRunAt) })
        : undefined,
      href: "/ecommerce",
    },
    {
      icon: Sparkles,
      label: t("flowStatus.pipeline"),
      value: t("flowStatus.pipelineValue", {
        queued: stats.pipelineQueued,
        active: stats.activeWorkflows,
      }),
      detail: workflowsDoc.data.lastPipelineRunAt
        ? t("flowStatus.lastRun", { when: formatWhen(workflowsDoc.data.lastPipelineRunAt) })
        : undefined,
      href: "/social-media",
    },
  ];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          {t("flowStatus.title")}
        </CardTitle>
        <CardDescription>{t("flowStatus.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.href}
              to={row.href}
              className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.value}</p>
                {row.detail ? <p className="text-[10px] text-muted-foreground mt-0.5">{row.detail}</p> : null}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
