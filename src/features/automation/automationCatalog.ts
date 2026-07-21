import type { ComponentType } from "react";
import { BarChart3, Banknote, Bot, CalendarClock, ClipboardList, Mail, MessageSquare, Sparkles, TrendingUp, Users } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Catalog of everything the app runs automatically, grouped by topic.
 *
 * Single source of truth for the Automations page: each entry mirrors a
 * server-side job (see `server/routes/cronRoutes.js` and the schedules in
 * `vercel.json`) or an on-demand automation, so users can see WHAT runs,
 * WHEN it runs and WHERE the result lands — even for jobs that have no
 * settings of their own (e.g. the marketing snapshot).
 *
 * Keep cadence labels in sync with `vercel.json` when schedules change.
 */

export type AutomationTopic = "messages" | "content" | "reports" | "insights";

export interface AutomationTopicInfo {
  id: AutomationTopic;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const AUTOMATION_TOPIC_ORDER: AutomationTopic[] = [
  "messages",
  "content",
  "reports",
  "insights",
];

export const AUTOMATION_TOPICS: Record<AutomationTopic, AutomationTopicInfo> = {
  messages: {
    id: "messages",
    title: "Meddelanden & inbox",
    description:
      "Automatik som hanterar inkommande konversationer så du slipper svara på allt manuellt.",
    icon: MessageSquare,
  },
  content: {
    id: "content",
    title: "Innehåll & publicering",
    description:
      "Automatik som publicerar schemalagt innehåll på rätt tid utan att du behöver trycka på knappen.",
    icon: CalendarClock,
  },
  reports: {
    id: "reports",
    title: "Rapporter & utskick",
    description:
      "Sammanställningar och larm som mejlas automatiskt istället för att du ska komma ihåg att kolla.",
    icon: Mail,
  },
  insights: {
    id: "insights",
    title: "AI & insikter",
    description:
      "Bakgrundsjobb som håller rekommendationer och nyckeltal färska utan manuell uppdatering.",
    icon: Sparkles,
  },
};

export interface AutomationCatalogEntry {
  id: string;
  topic: AutomationTopic;
  title: string;
  description: string;
  /** Human-readable schedule, mirroring the cron in vercel.json. */
  cadence: string;
  icon: ComponentType<{ className?: string }>;
  /** In-app route where the automation's output shows up. */
  outputHref?: string;
  /** Hidden in the private workspace (company-oriented automations). */
  businessOnly?: boolean;
  /**
   * Cron identifier this entry maps to (the `/api/cron/<key>` path segment and
   * `automation_runs.automation_key`). Present only for scheduled jobs, so the
   * Automations page can show their last/next run. Omit for on-demand-only
   * automations.
   */
  cronKey?: string;
  /** Plain-language “what happens if I turn this on?” (shown before enable). */
  explainer?: string;
  /** Sample draft text so users see quality before activating. */
  exampleDraft?: string;
  /** Trust line — usually draft-before-send. */
  trustNote?: string;
}

export const automationCatalog: AutomationCatalogEntry[] = [
  {
    id: "dm-auto-reply",
    topic: "messages",
    title: "Auto-svar på DM:s",
    description:
      "Läser olästa konversationer och skriver svar — som utkast eller skickar direkt.",
    cadence: "Konfigurerbart schema",
    icon: Bot,
    outputHref: "/messages",
    cronKey: "auto-reply",
    explainer:
      "Jobbet läser nya DM:s, skriver ett svarsförslag och lägger det i kön under Meddelanden. I standardläge skickas inget förrän du trycker skicka. Auto-skick kräver en extra bekräftelse.",
    exampleDraft:
      "Hej! Tack för att du hör av dig — absolut intresserade. Skicka gärna mer om upplägg så återkommer vi snart.",
    trustNote: "Utkast före sändning som standard — du godkänner innan något går ut.",
  },
  {
    id: "publish-scheduled-posts",
    topic: "content",
    title: "Publicera schemalagda inlägg",
    description:
      "Sveper var 15:e minut, försöker om misslyckade inlägg en gång, och publicerar det som är due.",
    cadence: "Konfigurerbart schema",
    icon: CalendarClock,
    outputHref: "/social-media",
    cronKey: "publish-scheduled-posts",
  },
  {
    id: "sales-outreach-auto",
    topic: "messages",
    title: "Automatisk outreach",
    description:
      "Skapar utkast till uppföljningsmejl för due leads och tysta leads (10+ dagar utan kontakt).",
    cadence: "Konfigurerbart schema",
    icon: Users,
    outputHref: "/sales",
    businessOnly: true,
    cronKey: "sales-outreach-auto",
    explainer:
      "När en lead är due eller tyst för länge skapas ett uppföljningsutkast i Sales-kön. Du granskar, redigerar och skickar — automationen skickar inte själv.",
    exampleDraft:
      "Hej! Ville bara följa upp vårt tidigare samtal — har ni hunnit titta på förslaget?",
    trustNote: "Bara utkast i kön — ingen outreach skickas utan dig.",
  },
  {
    id: "content-pipeline",
    topic: "content",
    title: "Innehållspipeline",
    description:
      "Seedar repurpose/gap/evergreen-idéer och flyttar köade inlägg till schemalagd publicering.",
    cadence: "Konfigurerbart schema",
    icon: Sparkles,
    outputHref: "/social-media",
    cronKey: "content-pipeline",
  },
  {
    id: "cart-recovery",
    topic: "reports",
    title: "Kundvagnsåtervinning",
    description:
      "Skickar återvinningsmejl till kunder som lämnat varukorgen i Shopify (deduplicerat).",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    outputHref: "/ecommerce",
    businessOnly: true,
    cronKey: "cart-recovery",
  },
  {
    id: "review-reply-auto",
    topic: "messages",
    title: "Automatiska review-svar",
    description:
      "Skapar utkast till svar på nya recensioner och skickar brådskande mejl vid ≤2★ — du godkänner på Reviews.",
    cadence: "Konfigurerbart schema",
    icon: MessageSquare,
    outputHref: "/reviews",
    businessOnly: true,
    cronKey: "review-reply-auto",
    explainer:
      "Nya recensioner får ett svarsutkast under Recensioner. Vid ≤2★ kan du få ett brådskande mejl — själva svaret publiceras först när du godkänner.",
    exampleDraft: "Tack för din feedback — vi tar det vidare internt och återkommer gärna.",
    trustNote: "Utkast först — publicering kräver ditt godkännande.",
  },
  {
    id: "mail-reply-auto",
    topic: "messages",
    title: "Automatiska mail-utkast",
    description:
      "Skapar svarsutkast till olästa Gmail/Outlook-mail — inget skickas förrän du godkänner under Meddelanden.",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    outputHref: "/messages",
    cronKey: "mail-reply-auto",
    explainer:
      "Jobbet plockar olästa mail, skriver ett svarsutkast och lägger det i Meddelanden. Du kan skicka, redigera eller kasta — automationen skickar aldrig själv.",
    exampleDraft:
      "Hej Anna! Tack för din förfrågan — absolut, vi har tid. Föreslår tisdag eller torsdag 10:00.",
    trustNote: "Utkast före sändning — inget mail går ut utan dig.",
  },
  {
    id: "marketing-actions",
    topic: "insights",
    title: "Marknadsförings-åtgärder",
    description:
      "Pausar automatiskt Meta-kampanjer med betyg F/poor enligt analytics (Google flaggas för manuell review).",
    cadence: "Konfigurerbart schema",
    icon: BarChart3,
    outputHref: "/marketing",
    businessOnly: true,
    cronKey: "marketing-actions",
  },
  {
    id: "weekly-insight-digest",
    topic: "reports",
    title: "Veckovis insiktsrapport",
    description:
      "Måndagsmejl med ROAS-trend, publicerade inlägg och content-tips när social-flödet är aktivt.",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    outputHref: "/social-media",
    cronKey: "weekly-insight-digest",
  },
  {
    id: "engagement-followup",
    topic: "messages",
    title: "Engagement-följdflöde",
    description:
      "Mejlar när olästa DM:s hopar sig så du inte missar köpintention eller frågor.",
    cadence: "Konfigurerbart schema",
    icon: MessageSquare,
    outputHref: "/messages",
    cronKey: "engagement-followup",
  },
  {
    id: "daily-digest",
    topic: "reports",
    title: "Daglig översikt",
    description: "Morgonmejl varje vardag med det som behöver göras.",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    cronKey: "daily-digest",
  },
  {
    id: "weekly-report",
    topic: "reports",
    title: "Veckorapport",
    description: "Måndagsmejl som summerar förra veckan.",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    cronKey: "weekly-report",
  },
  {
    id: "lead-reminder",
    topic: "reports",
    title: "Lead-påminnelse",
    description: "Mejl när leads behöver uppföljning idag eller är försenade.",
    cadence: "Konfigurerbart schema",
    icon: Users,
    outputHref: "/sales",
    cronKey: "lead-reminder",
  },
  {
    id: "task-reminder",
    topic: "reports",
    title: "Uppgiftspåminnelse",
    description: "Mejl med försenade och dagens uppgifter.",
    cadence: "Konfigurerbart schema",
    icon: ClipboardList,
    outputHref: "/tasks",
    cronKey: "task-reminder",
  },
  {
    id: "marketing-alerts",
    topic: "reports",
    title: "Marknadsförings-larm",
    description:
      "Mejl när ROAS går under 1× eller annonser körs mot tomma hyllor.",
    cadence: "Konfigurerbart schema",
    icon: BarChart3,
    outputHref: "/marketing",
    businessOnly: true,
    cronKey: "marketing-alerts",
  },
  {
    id: "ai-recommendations-refresh",
    topic: "insights",
    title: "AI-rekommendationer",
    description:
      "Uppdaterar rekommendationerna utifrån connections, tasks och innehåll.",
    cadence: "Konfigurerbart schema",
    icon: Sparkles,
    outputHref: "/ai-recommendations",
    cronKey: "refresh-ai-recommendations",
  },
  {
    id: "marketing-snapshot",
    topic: "insights",
    title: "Marknadsförings-snapshot",
    description:
      "Sparar dagens annons-KPI:er så veckotrenden på Marketing-sidan alltid är komplett.",
    cadence: "Konfigurerbart schema",
    icon: BarChart3,
    outputHref: "/marketing",
    businessOnly: true,
    cronKey: "marketing-snapshot",
  },
  {
    id: "social-stats-snapshot",
    topic: "insights",
    title: "Social statistik-snapshot",
    description:
      "Sparar dagliga följar- och engagemangssiffror per konto så Social-sidan kan visa trender, inte bara ögonblicksbilder.",
    cadence: "Konfigurerbart schema",
    icon: BarChart3,
    outputHref: "/social-media",
    cronKey: "social-stats-snapshot",
  },
  {
    id: "market-pulse-snapshot",
    topic: "insights",
    title: "Market pulse-snapshot",
    description:
      "Hämtar LunarCrush-sentiment varje natt så startsidan laddar direkt utan live MCP-anrop.",
    cadence: "Konfigurerbart schema",
    icon: TrendingUp,
    businessOnly: true,
    cronKey: "market-pulse-snapshot",
  },
  {
    id: "post-purchase-review-request",
    topic: "reports",
    title: "Recensionsförfrågan efter köp",
    description:
      "Mejlar kunder ~1,5 vecka efter en levererad Shopify-order och ber om ett omdöme (deduplicerat per order).",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    outputHref: "/ecommerce",
    businessOnly: true,
    cronKey: "post-purchase-review-request",
    explainer:
      "Jobbet letar upp betalda, levererade ordrar 10–24 dagar gamla och skickar ett kort tack-mejl med en förfrågan om omdöme. Mejlet går direkt — ingen granskning, ingen rabatt.",
    trustNote: "Skickas direkt (deduplicerat per order) — inget kostar pengar eller kräver godkännande.",
  },
  {
    id: "customer-winback",
    topic: "reports",
    title: "Vinn-tillbaka-mejl",
    description:
      "Mejlar kunder som inte handlat på 60–180 dagar en enkel 'vi saknar dig'-hälsning (max var 90:e dag per kund).",
    cadence: "Konfigurerbart schema",
    icon: Users,
    outputHref: "/ecommerce",
    businessOnly: true,
    cronKey: "customer-winback",
    explainer:
      "Jobbet hittar Shopify-kunder som gått tysta och skickar en kort, rabattfri hälsning för att påminna om butiken. Samma kund kontaktas inte igen inom 90 dagar.",
    trustNote: "Skickas direkt — ingen rabatt, ingen kostnad, bara en påminnelse.",
  },
  {
    id: "product-content-automation",
    topic: "content",
    title: "Produkttext-automation",
    description:
      "Föreslår AI-förbättrad beskrivning och taggar för Shopify-produkter med tunn text — du godkänner innan något publiceras.",
    cadence: "Konfigurerbart schema",
    icon: Sparkles,
    outputHref: "/ecommerce",
    businessOnly: true,
    cronKey: "product-content-automation",
    explainer:
      "Jobbet skannar synkade Shopify-produkter med kort/saknad beskrivning eller taggar och lägger ett förslag under Produkter. Godkänner du det uppdateras både katalogen här och (om möjligt) produkten i Shopify.",
    exampleDraft: "En hållbar favorit för vardagsbruk — skön passform, robust material och snabb leverans.",
    trustNote: "Bara förslag — du väljer vilka som publiceras.",
  },
  {
    id: "fortnox-invoice-suggest",
    topic: "reports",
    title: "Fakturaförslag till Fortnox",
    description:
      "Föreslår fakturor i Fortnox för betalda, levererade Shopify-ordrar som inte fakturerats än — du väljer vilka som skapas.",
    cadence: "Konfigurerbart schema",
    icon: Banknote,
    outputHref: "/company",
    businessOnly: true,
    cronKey: "fortnox-invoice-suggest",
    explainer:
      "Jobbet jämför betalda, levererade Shopify-ordrar mot Fortnox och lägger förslag under Företag → Ekonomi. Ingen faktura skapas i Fortnox förrän du klickar 'Skapa faktura' på en rad.",
    trustNote: "Bara förslag — ingen faktura skapas i Fortnox utan ditt godkännande.",
  },
  {
    id: "fortnox-payment-sync",
    topic: "insights",
    title: "Fortnox-betalningssynk",
    description:
      "Bokför automatiskt betalningen i Fortnox för fakturor appen skapat, så fort Shopify-ordern visar betald.",
    cadence: "Konfigurerbart schema",
    icon: Banknote,
    outputHref: "/company",
    businessOnly: true,
    cronKey: "fortnox-payment-sync",
    explainer:
      "Jobbet matchar obetalda Fortnox-fakturor (som appen skapat) mot Shopify-ordrar. Är ordern redan betald i Shopify bokförs betalningen direkt i Fortnox — det är bara en statussynk av något som redan hänt, inte ett nytt finansiellt beslut.",
    trustNote: "Körs automatiskt — bokför bara betalningar för fakturor appen själv skapat.",
  },
  {
    id: "fortnox-refund-credit-suggest",
    topic: "reports",
    title: "Kreditfakturaförslag till Fortnox",
    description:
      "Föreslår en kreditfaktura i Fortnox när en Shopify-order med en befintlig Fortnox-faktura återbetalas.",
    cadence: "Konfigurerbart schema",
    icon: Banknote,
    outputHref: "/company",
    businessOnly: true,
    cronKey: "fortnox-refund-credit-suggest",
    explainer:
      "Jobbet letar upp Shopify-återbetalningar på ordrar som redan har en Fortnox-faktura och lägger ett kreditfaktura-förslag under Företag → Ekonomi. Ingen kreditfaktura skapas förrän du godkänner den.",
    trustNote: "Bara förslag — ingen kreditfaktura skapas i Fortnox utan ditt godkännande.",
  },
];

export function catalogEntriesForTopic(
  topic: AutomationTopic,
  options: { includeBusinessOnly?: boolean } = {}
): AutomationCatalogEntry[] {
  const includeBusinessOnly = options.includeBusinessOnly ?? true;
  return automationCatalog.filter(
    (entry) =>
      entry.topic === topic && (includeBusinessOnly || !entry.businessOnly)
  );
}

/** Localized topic chrome (icon stays from the catalog). */
export function localizeAutomationTopic(topic: AutomationTopic): AutomationTopicInfo {
  const base = AUTOMATION_TOPICS[topic];
  return {
    ...base,
    title: t(`automations:topics.${topic}.title`),
    description: t(`automations:topics.${topic}.description`),
  };
}

/** Localized entry strings for UI (ids/icons/cron keys stay stable). */
export function localizeAutomationEntry(entry: AutomationCatalogEntry): AutomationCatalogEntry {
  const base = `automations:entries.${entry.id}`;
  return {
    ...entry,
    title: t(`${base}.title`),
    description: t(`${base}.description`),
    cadence: t("automations:shared.configurableCadence"),
    explainer: entry.explainer ? t(`${base}.explainer`) : undefined,
    exampleDraft: entry.exampleDraft ? t(`${base}.exampleDraft`) : undefined,
    trustNote: entry.trustNote ? t(`${base}.trustNote`) : undefined,
  };
}

/** Display title for a scheduled job's cron key, falling back to the raw key. */
export function automationTitleForCronKey(cronKey: string): string {
  const entry = automationCatalog.find((item) => item.cronKey === cronKey);
  return entry ? t(`automations:entries.${entry.id}.title`) : cronKey;
}
