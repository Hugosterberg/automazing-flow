import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { AutoReplyDraftsStrip } from "@/features/automation";
import { DemoModeBanner } from "@/features/demo";
import { MailConnectEmptyCards } from "@/features/messages/MailConnectEmptyCards";
import { MailReplyDraftsStrip } from "@/features/messages/MailReplyDraftsStrip";

type TriageCounts = { today: number; week: number };

type Props = {
  focusedReading: boolean;
  isMobile: boolean;
  triageCounts: TriageCounts;
  inboxLiveHint: string | null;
  openCount: number;
  hasAnyMailConnected: boolean;
  /** When demoläge fills the mail tab, skip connect-empty cards. */
  demoInboxActive?: boolean;
  activeTabIsMail: boolean;
  businessProfileId: string | null;
  onShowToday: () => void;
  onUseMailDraft: (draft: string) => void;
};

/**
 * Page-level chrome above the messages workspace: header, smart bar, connect empty, draft strips.
 */
export function MessagePageChrome({
  focusedReading,
  isMobile,
  triageCounts,
  inboxLiveHint,
  openCount,
  hasAnyMailConnected,
  demoInboxActive = false,
  activeTabIsMail,
  businessProfileId,
  onShowToday,
  onUseMailDraft,
}: Props) {
  const { t } = useTranslation("messages");
  if (focusedReading) return null;

  const hasTriageWork = triageCounts.today + triageCounts.week > 0;
  const showMailEmpty = activeTabIsMail && !hasAnyMailConnected && !demoInboxActive;

  return (
    <>
      <PageHeader
        icon={MessageSquare}
        title={t("page.title")}
        description={isMobile ? t("page.descriptionMobile") : t("page.descriptionDesktop")}
      />

      {openCount === 0 || triageCounts.today > 0 || triageCounts.week > 0 ? (
        <PageSmartBar
          title={
            hasTriageWork
              ? t("page.smartTriage")
              : isMobile
                ? t("page.smartCaughtUpMobile")
                : t("page.smartCaughtUpDesktop")
          }
          steps={
            hasTriageWork
              ? undefined
              : isMobile
                ? [t("page.stepMobile1"), t("page.stepMobile2"), t("page.stepMobile3")]
                : [t("page.stepDesktop1"), t("page.stepDesktop2"), t("page.stepDesktop3")]
          }
          tip={hasTriageWork ? undefined : t("page.tip")}
          liveHintOverride={inboxLiveHint}
          extraActions={
            triageCounts.today > 0 ? [{ label: t("page.showToday"), onClick: onShowToday }] : []
          }
        />
      ) : null}

      <DemoModeBanner offerEnable={showMailEmpty} />

      {showMailEmpty ? <MailConnectEmptyCards /> : null}

      <div className="space-y-2">
        <AutoReplyDraftsStrip businessProfileId={businessProfileId} compact />
        <MailReplyDraftsStrip businessProfileId={businessProfileId} onUseDraft={onUseMailDraft} />
      </div>
    </>
  );
}
