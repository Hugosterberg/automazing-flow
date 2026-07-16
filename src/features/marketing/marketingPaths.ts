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
  kind: MarketingPathKind;
  icon: LucideIcon;
  /** In-app route (may include query, e.g. /marketing?tab=ads). */
  href: string;
  /** Locale keys under `paths.{id}.actions.*` */
  actionKeys: readonly string[];
};

export const MARKETING_PATH_KINDS: MarketingPathKind[] = ["paid", "organic", "owned", "partnership"];

export const MARKETING_PATHS: MarketingPath[] = [
  {
    id: "paid-ads",
    kind: "paid",
    icon: Megaphone,
    href: "/marketing?tab=ads",
    actionKeys: ["connectAccounts", "trackRoas", "planTasks"],
  },
  {
    id: "social",
    kind: "organic",
    icon: Share2,
    href: "/social-media",
    actionKeys: ["publish", "calendar", "engage"],
  },
  {
    id: "content",
    kind: "owned",
    icon: Sparkles,
    href: "/content",
    actionKeys: ["write", "generateImages", "repurpose"],
  },
  {
    id: "seo-brand",
    kind: "organic",
    icon: Globe2,
    href: "/digital-brand",
    actionKeys: ["runAudit", "fixSeo", "monitorReputation"],
  },
  {
    id: "email-crm",
    kind: "owned",
    icon: Mail,
    href: "/messages",
    actionKeys: ["sendCampaigns", "replyFaster", "segment"],
  },
  {
    id: "sales-outreach",
    kind: "owned",
    icon: Target,
    href: "/sales",
    actionKeys: ["findLeads", "outreachCopy", "drivePipeline"],
  },
  {
    id: "ecommerce",
    kind: "paid",
    icon: ShoppingBag,
    href: "/ecommerce",
    actionKeys: ["productPages", "campaigns", "storeAnalytics"],
  },
  {
    id: "reviews-local",
    kind: "organic",
    icon: Star,
    href: "/reviews",
    actionKeys: ["collectReviews", "replyPublicly", "boostLocalSeo"],
  },
  {
    id: "partners",
    kind: "partnership",
    icon: Users,
    href: "/sales",
    actionKeys: ["partnerOutreach", "referralOffers", "jointCampaigns"],
  },
];

export const MARKETING_PATH_GROUPS: { kind: MarketingPathKind }[] = MARKETING_PATH_KINDS.map((kind) => ({
  kind,
}));
