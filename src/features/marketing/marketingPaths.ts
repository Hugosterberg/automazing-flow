import type { LucideIcon } from "lucide-react";
import {
  Globe2,
  Mail,
  Megaphone,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
  Users,
} from "lucide-react";

export type MarketingPathKind = "paid" | "organic" | "owned" | "partnership";

export type MarketingPath = {
  id: string;
  title: string;
  description: string;
  kind: MarketingPathKind;
  icon: LucideIcon;
  /** In-app route (may include query, e.g. /marketing?tab=ads). */
  href: string;
  actions: string[];
};

export const MARKETING_PATH_KIND_LABELS: Record<MarketingPathKind, string> = {
  paid: "Betald",
  organic: "Organisk",
  owned: "Egna kanaler",
  partnership: "Partnerskap",
};

export const MARKETING_PATHS: MarketingPath[] = [
  {
    id: "paid-ads",
    title: "Betald annonsering",
    description: "Google Ads- och Meta-kampanjer för trafik, leads och produktförsäljning.",
    kind: "paid",
    icon: Megaphone,
    href: "/marketing?tab=ads",
    actions: ["Koppla annonskonton", "Följ ROAS", "Planera kampanjuppgifter"],
  },
  {
    id: "social",
    title: "Sociala medier",
    description: "Organiska inlägg, schemaläggning och community på Instagram, Facebook och LinkedIn.",
    kind: "organic",
    icon: Share2,
    href: "/social-media",
    actions: ["Publicera inlägg", "Innehållskalender", "Engagera följare"],
  },
  {
    id: "content",
    title: "Innehållsstudio",
    description: "Längre innehåll, bilder och videoutkast för ditt varumärke och dina produkter.",
    kind: "owned",
    icon: Sparkles,
    href: "/content",
    actions: ["Skriv artiklar", "Generera bilder", "Återanvänd för sociala medier"],
  },
  {
    id: "seo-brand",
    title: "SEO & digitalt varumärke",
    description: "Webbplatsgranskning, söksynlighet och en konsekvent varumärkesnärvaro online.",
    kind: "organic",
    icon: Globe2,
    href: "/digital-brand",
    actions: ["Kör webbplatsgranskning", "Åtgärda SEO-luckor", "Bevaka ryktet"],
  },
  {
    id: "email-crm",
    title: "E-post & kunder",
    description: "Nyhetsbrev, uppföljningar och kundrelationer som driver återkommande försäljning.",
    kind: "owned",
    icon: Mail,
    href: "/messages",
    actions: ["Skicka utskick", "Svara snabbare", "Segmentera kunder"],
  },
  {
    id: "sales-outreach",
    title: "Försäljning & outreach",
    description: "Leads, kall outreach, prospektering och pipeline hela vägen till avslut.",
    kind: "owned",
    icon: Target,
    href: "/sales",
    actions: ["Hitta leads", "Outreach-texter", "Driv pipelinen framåt"],
  },
  {
    id: "ecommerce",
    title: "E-handel & butiker",
    description: "Shopify och produktlistningar — sortiment, erbjudanden och butikens resultat.",
    kind: "paid",
    icon: ShoppingBag,
    href: "/ecommerce",
    actions: ["Produktsidor", "Kampanjer", "Butiksanalys"],
  },
  {
    id: "reviews-local",
    title: "Recensioner & lokalt",
    description: "Google-recensioner, lokala listningar och förtroendesignaler som konverterar besökare.",
    kind: "organic",
    icon: Star,
    href: "/reviews",
    actions: ["Samla recensioner", "Svara offentligt", "Stärk lokal SEO"],
  },
  {
    id: "partners",
    title: "Partners & community",
    description: "Rekommendationer, sam-marknadsföring, influencers och B2B-partnerskap.",
    kind: "partnership",
    icon: Users,
    href: "/sales",
    actions: ["Partner-outreach", "Referral-erbjudanden", "Gemensamma kampanjer"],
  },
];

export const MARKETING_PATH_GROUPS: { kind: MarketingPathKind; title: string; description: string }[] = [
  {
    kind: "paid",
    title: "Betald tillväxt",
    description: "Använd budget för att snabbt nå köpare via annonser och marknadsplatser.",
  },
  {
    kind: "organic",
    title: "Organisk räckvidd",
    description: "Förtjäna uppmärksamhet genom innehåll, SEO, sociala medier och lokal närvaro.",
  },
  {
    kind: "owned",
    title: "Egna kanaler",
    description: "Kanaler du kontrollerar — e-post, webbplats, CRM och direktförsäljning.",
  },
  {
    kind: "partnership",
    title: "Partnerskap",
    description: "Väx genom andras publik, rekommendationer och sam-marknadsföring.",
  },
];
