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
  if (focusedReading) return null;

  const hasTriageWork = triageCounts.today + triageCounts.week > 0;
  const showMailEmpty = activeTabIsMail && !hasAnyMailConnected && !demoInboxActive;

  return (
    <>
      <PageHeader
        icon={MessageSquare}
        title="Meddelanden"
        description={
          isMobile
            ? "Välj ett meddelande — AI hjälper dig sammanfatta och svara."
            : "Mail, DM och WhatsApp · J/K bläddra · H Klar · E arkivera · R svara"
        }
      />

      {openCount === 0 || triageCounts.today > 0 || triageCounts.week > 0 ? (
        <PageSmartBar
          title={
            hasTriageWork
              ? "Triage först — svara Idag, parkera Brus."
              : isMobile
                ? "Inkorgen är ikapp — koppla fler kanaler eller vänta på nya meddelanden."
                : "Meddelanden är din triage-inkorg — när något dyker upp: läs, svara och markera Klar."
          }
          steps={
            hasTriageWork
              ? undefined
              : isMobile
                ? ["Välj kanal (Mail, IG, FB, WA)", "Tryck ett meddelande för att läsa", "Skicka svar eller markera klar"]
                : [
                    "Välj kanal och triage-hink (Idag / Vecka / FYI / Brus)",
                    "J/K bläddra · H Klar · E arkivera · R svara",
                    "AI sammanfattar och skriver utkast — du godkänner innan du skickar",
                  ]
          }
          tip={hasTriageWork ? undefined : "Öppna meddelanden stannar i kön tills du trycker Klar (H)."}
          liveHintOverride={inboxLiveHint}
          extraActions={
            triageCounts.today > 0 ? [{ label: "Visa Idag", onClick: onShowToday }] : []
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
