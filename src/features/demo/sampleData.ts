import type { UnifiedMessage } from "@/features/messages/types";
import type { MailReplyQueueItem } from "@/features/messages/MailReplyDraftsStrip";
import type { OutreachQueueItem } from "@/features/outreach/outreachQueueTypes";
import type { ReviewReplyQueueItem } from "@/features/reviews/ReviewReplyQueueSection";
import type { DailyBriefInput } from "@/features/daily-brief/buildDailyBrief";
import { DEMO_ID_PREFIX, hoursAgoIso, type DemoDmDraft } from "./demoMode";

/** ~5 sample inbox rows so Meddelanden feels alive before OAuth. */
export function buildDemoMessages(): UnifiedMessage[] {
  return [
    {
      id: `${DEMO_ID_PREFIX}mail-1`,
      kind: "email",
      channel: "gmail",
      accountId: `${DEMO_ID_PREFIX}gmail`,
      accountLabel: "Demo Gmail",
      subject: "Offertförfrågan — kickoff nästa vecka?",
      from: { name: "Anna Lind", email: "anna@exempelkund.se" },
      date: hoursAgoIso(2),
      snippet: "Hej! Vi är intresserade av ett upplägg för Q3 och undrar om ni har tid för ett kort möte.",
      body:
        "Hej!\n\nVi är intresserade av ett upplägg för Q3 och undrar om ni har tid för ett kort möte nästa vecka.\n\nMvh Anna",
      isUnread: true,
      isStarred: true,
      providerMessageId: `${DEMO_ID_PREFIX}mail-1`,
    },
    {
      id: `${DEMO_ID_PREFIX}mail-2`,
      kind: "email",
      channel: "gmail",
      accountId: `${DEMO_ID_PREFIX}gmail`,
      accountLabel: "Demo Gmail",
      subject: "Re: Faktura #1042",
      from: { name: "Erik Holm", email: "erik@leverantor.se" },
      date: hoursAgoIso(5),
      snippet: "Tack — bifogar uppdaterad faktura. Hör av dig om något saknas.",
      body: "Hej,\n\nTack — bifogar uppdaterad faktura. Hör av dig om något saknas.\n\n/Erik",
      isUnread: true,
      providerMessageId: `${DEMO_ID_PREFIX}mail-2`,
    },
    {
      id: `${DEMO_ID_PREFIX}mail-3`,
      kind: "email",
      channel: "gmail",
      accountId: `${DEMO_ID_PREFIX}gmail`,
      accountLabel: "Demo Gmail",
      subject: "Nyhetsbrev: 10 tips för e-handel",
      from: { name: "Growth Weekly", email: "noreply@growthweekly.example" },
      date: hoursAgoIso(10),
      snippet: "Den här veckan: retention, e-postflöden och tre verktyg värda att testa.",
      body: "Den här veckan: retention, e-postflöden och tre verktyg värda att testa.",
      isUnread: false,
      providerMessageId: `${DEMO_ID_PREFIX}mail-3`,
    },
    {
      id: `${DEMO_ID_PREFIX}dm-1`,
      kind: "dm",
      channel: "instagram",
      accountId: `${DEMO_ID_PREFIX}ig`,
      accountLabel: "Demo Instagram",
      subject: "DM från @mira.studio",
      from: { name: "mira.studio", email: "" },
      date: hoursAgoIso(1),
      snippet: "Hej! Har ni öppet för en kollab i september?",
      body: "Hej! Har ni öppet för en kollab i september?",
      isUnread: true,
      conversationId: `${DEMO_ID_PREFIX}conv-1`,
      providerMessageId: `${DEMO_ID_PREFIX}dm-1`,
    },
    {
      id: `${DEMO_ID_PREFIX}dm-2`,
      kind: "dm",
      channel: "instagram",
      accountId: `${DEMO_ID_PREFIX}ig`,
      accountLabel: "Demo Instagram",
      subject: "DM från @kund_lisa",
      from: { name: "kund_lisa", email: "" },
      date: hoursAgoIso(8),
      snippet: "När skickas ordern? Ordernr 88421.",
      body: "När skickas ordern? Ordernr 88421.",
      isUnread: true,
      conversationId: `${DEMO_ID_PREFIX}conv-2`,
      providerMessageId: `${DEMO_ID_PREFIX}dm-2`,
    },
  ];
}

export function buildDemoMailDrafts(): MailReplyQueueItem[] {
  return [
    {
      id: `${DEMO_ID_PREFIX}mail-draft-1`,
      messageKey: `${DEMO_ID_PREFIX}mail-1`,
      accountId: `${DEMO_ID_PREFIX}gmail`,
      platform: "gmail",
      providerMessageId: `${DEMO_ID_PREFIX}mail-1`,
      subject: "Offertförfrågan — kickoff nästa vecka?",
      fromName: "Anna Lind",
      fromEmail: "anna@exempelkund.se",
      snippet: "Vi är intresserade av ett upplägg för Q3…",
      draft:
        "Hej Anna!\n\nTack för din förfrågan — absolut, vi har tid. Föreslår tisdag eller torsdag 10:00. Vilken dag passar dig bäst?\n\nVänliga hälsningar",
      status: "draft",
      createdAt: hoursAgoIso(1),
    },
  ];
}

export function buildDemoOutreachDrafts(): OutreachQueueItem[] {
  return [
    {
      id: `${DEMO_ID_PREFIX}outreach-1`,
      leadId: `${DEMO_ID_PREFIX}lead-1`,
      leadName: "Nordic Retail AB",
      prospectEmail: "ceo@nordicretail.example",
      subject: "Snabb fråga om er kunddialog",
      body: "Hej!\n\nSåg att ni växer snabbt — vi hjälper liknande bolag att samla mail/DM och svara snabbare med AI-utkast (alltid med er godkännande).\n\nÖppen för ett 10-min samtal?\n\n/Hugo",
      status: "draft",
      createdAt: hoursAgoIso(3),
    },
  ];
}

export function buildDemoReviewDrafts(): ReviewReplyQueueItem[] {
  return [
    {
      id: `${DEMO_ID_PREFIX}review-1`,
      reviewId: `${DEMO_ID_PREFIX}rev-1`,
      accountId: `${DEMO_ID_PREFIX}google`,
      author: "Sofia M",
      rating: 5,
      reviewText: "Snabb service och trevligt bemötande!",
      draft: "Tack Sofia — så kul att höra! Vi ses gärna igen snart.",
      status: "draft",
      createdAt: hoursAgoIso(6),
    },
  ];
}

export function buildDemoDmDrafts(): DemoDmDraft[] {
  return [
    {
      id: `${DEMO_ID_PREFIX}dm-draft-1`,
      kind: "dm",
      conversation_id: `${DEMO_ID_PREFIX}conv-1`,
      platform: "instagram",
      author_name: "mira.studio",
      incoming_text: "Hej! Har ni öppet för en kollab i september?",
      draft_text:
        "Hej Mira! Tack för att du hör av dig — absolut intresserade. Skicka gärna mer om upplägg och tidplan så återkommer vi med förslag.",
      status: "drafted",
      error: null,
      created_at: hoursAgoIso(1),
    },
  ];
}

/** Signals fed into buildDailyBrief when sandbox is on and live brief is quiet. */
export function buildDemoBriefOverlay(): Pick<
  DailyBriefInput,
  "unreadDms" | "triageAttentionCount" | "pendingDmDrafts" | "outreachQueuePending" | "reviewsNeedingReply"
> {
  return {
    unreadDms: 3,
    triageAttentionCount: 4,
    pendingDmDrafts: 1,
    outreachQueuePending: 1,
    reviewsNeedingReply: 1,
  };
}

/**
 * Merge sandbox rows into a live inbox. Real messages win per kind —
 * demo rows only fill empty email/DM channels.
 */
export function mergeDemoInboxMessages(
  live: UnifiedMessage[],
  enabled: boolean
): UnifiedMessage[] {
  const withoutStaleDemo = live.filter((m) => !m.id.startsWith(DEMO_ID_PREFIX));
  if (!enabled) return withoutStaleDemo;

  const hasRealEmail = withoutStaleDemo.some((m) => m.kind === "email");
  const hasRealDm = withoutStaleDemo.some((m) => m.kind === "dm");
  const demos = buildDemoMessages().filter(
    (m) => (m.kind === "email" && !hasRealEmail) || (m.kind === "dm" && !hasRealDm)
  );
  return [...demos, ...withoutStaleDemo].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
