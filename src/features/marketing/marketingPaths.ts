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
  /** In-app route, or null when the path is handled on this page. */
  href: string | null;
  /** Anchor on /marketing, e.g. #paid-ads */
  anchor?: string;
  actions: string[];
};

export const MARKETING_PATH_KIND_LABELS: Record<MarketingPathKind, string> = {
  paid: "Paid",
  organic: "Organic",
  owned: "Owned channels",
  partnership: "Partnerships",
};

export const MARKETING_PATHS: MarketingPath[] = [
  {
    id: "paid-ads",
    title: "Paid ads",
    description: "Google Ads and Meta campaigns for traffic, leads and product sales.",
    kind: "paid",
    icon: Megaphone,
    href: null,
    anchor: "#paid-ads",
    actions: ["Connect ad accounts", "Track ROAS", "Plan campaign tasks"],
  },
  {
    id: "social",
    title: "Social media",
    description: "Organic posts, scheduling and community on Instagram, Facebook and LinkedIn.",
    kind: "organic",
    icon: Share2,
    href: "/social-media",
    actions: ["Publish posts", "Content calendar", "Engage followers"],
  },
  {
    id: "content",
    title: "Content studio",
    description: "Long-form content, images and video drafts for your brand and products.",
    kind: "owned",
    icon: Sparkles,
    href: "/content",
    actions: ["Write articles", "Generate visuals", "Repurpose for social"],
  },
  {
    id: "seo-brand",
    title: "SEO & digital brand",
    description: "Site audit, search visibility and consistent brand presence online.",
    kind: "organic",
    icon: Globe2,
    href: "/digital-brand",
    actions: ["Run site audit", "Fix SEO gaps", "Monitor reputation"],
  },
  {
    id: "email-crm",
    title: "Email & customers",
    description: "Newsletters, follow-ups and customer relationships that drive repeat sales.",
    kind: "owned",
    icon: Mail,
    href: "/messages",
    actions: ["Send campaigns", "Reply faster", "Segment customers"],
  },
  {
    id: "sales-outreach",
    title: "Sales & outreach",
    description: "Leads, cold outreach, discovery and pipeline toward closed deals.",
    kind: "owned",
    icon: Target,
    href: "/sales",
    actions: ["Find leads", "Outreach copy", "Move pipeline"],
  },
  {
    id: "ecommerce",
    title: "E-commerce & stores",
    description: "Shopify and product listings — merchandising, offers and store performance.",
    kind: "paid",
    icon: ShoppingBag,
    href: "/ecommerce",
    actions: ["Product pages", "Promotions", "Store analytics"],
  },
  {
    id: "reviews-local",
    title: "Reviews & local",
    description: "Google reviews, local listings and trust signals that convert browsers.",
    kind: "organic",
    icon: Star,
    href: "/reviews",
    actions: ["Collect reviews", "Respond publicly", "Boost local SEO"],
  },
  {
    id: "partners",
    title: "Partners & community",
    description: "Referrals, co-marketing, influencers and B2B partnerships.",
    kind: "partnership",
    icon: Users,
    href: "/sales",
    actions: ["Partner outreach", "Referral offers", "Joint campaigns"],
  },
];

export const MARKETING_PATH_GROUPS: { kind: MarketingPathKind; title: string; description: string }[] = [
  {
    kind: "paid",
    title: "Paid growth",
    description: "Spend budget to reach buyers quickly through ads and marketplaces.",
  },
  {
    kind: "organic",
    title: "Organic reach",
    description: "Earn attention through content, SEO, social and local presence.",
  },
  {
    kind: "owned",
    title: "Owned channels",
    description: "Channels you control — email, site, CRM and direct sales.",
  },
  {
    kind: "partnership",
    title: "Partnerships",
    description: "Grow through others' audiences, referrals and co-marketing.",
  },
];
