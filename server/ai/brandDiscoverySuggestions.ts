/**
 * Brand discovery suggestions for Digital Brand — concrete websites or email
 * addresses worth checking in relation to the tenant's own brand (presence,
 * competitors, partners, reputation). Unlike lead suggestions, these may
 * include specific URLs and role-based emails on the brand's own domain.
 */

export type BrandDiscoveryMode = "websites" | "emails";

export interface BrandDiscoveryContext {
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  industry?: string;
}

export interface BrandDiscoverySuggestion {
  value: string;
  kind: "website" | "email";
  label: string;
  reason: string;
  category: string;
}

export const MAX_BRAND_DISCOVERY_SUGGESTIONS = 20;

function brandLabel(ctx: BrandDiscoveryContext): string {
  return (ctx.company || ctx.businessName || "your brand").trim();
}

function extractHostname(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function googleSearch(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function buildBrandDiscoveryPrompt(
  ctx: BrandDiscoveryContext,
  mode: BrandDiscoveryMode,
  count = MAX_BRAND_DISCOVERY_SUGGESTIONS
): string {
  const lines = [
    `Brand / company: ${brandLabel(ctx)}`,
    ctx.website ? `Website: ${ctx.website}` : "",
    ctx.email ? `Known email: ${ctx.email}` : "",
    ctx.location ? `Market / location: ${ctx.location}` : "",
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.notes ? `Notes: ${ctx.notes}` : "",
  ].filter(Boolean);

  if (mode === "websites") {
    return (
      `You are a brand strategist. Suggest ${count} specific WEBSITES or URLs worth visiting to understand, ` +
      `monitor or improve this brand's digital presence and competitive landscape.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Include a mix of: review/reputation sites, social profile searches, competitor or peer sites, ` +
      `industry directories, local listings, press/news searches, SEO visibility checks, and partnership opportunities.\n` +
      `Use real, working URL patterns (https://...) or Google search URLs when a direct link varies.\n` +
      `Do NOT invent fake company homepages you are unsure exist.\n\n` +
      `Return ONLY JSON:\n` +
      `{"suggestions":[{"value":"https://...","kind":"website","label":"Short name","reason":"One sentence why visit","category":"reputation|social|competitor|directory|press|seo|partner|other"}]}`
    );
  }

  return (
    `You are a brand strategist. Suggest ${count} EMAIL-RELATED items to check for this brand.\n\n` +
    `${lines.join("\n")}\n\n` +
    `Include:\n` +
    `- Role-based addresses on the brand's OWN domain (info@, hello@, support@, etc.) when a domain is known\n` +
    `- Contact pages or mailto targets at relevant industry/media/partner sites (use full https URL as value with kind "website" if no public email is known)\n` +
    `- Generic inbox patterns only when tied to a real organization type (e.g. press@ for trade media — prefer linking to their contact page URL instead)\n\n` +
    `Do NOT invent personal emails at third-party companies. Mark uncertain items with category "verify".\n\n` +
    `Return ONLY JSON:\n` +
    `{"suggestions":[{"value":"email@domain.com or https://...","kind":"email|website","label":"Short name","reason":"One sentence","category":"own-domain|contact-page|partner|media|verify|other"}]}`
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.replace(/^www\./, "");
    if (!hostname.includes(".") && hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseBrandDiscoverySuggestions(
  content: string,
  mode: BrandDiscoveryMode
): BrandDiscoverySuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const arr = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(arr)) return [];

  const out: BrandDiscoverySuggestion[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const kindRaw = String(r.kind || "").trim();
    const kind: "website" | "email" =
      kindRaw === "email" ? "email" : kindRaw === "website" ? "website" : mode === "emails" && EMAIL_RE.test(String(r.value || "")) ? "email" : "website";

    let value = String(r.value || "").trim();
    if (!value) continue;

    if (kind === "email") {
      if (!EMAIL_RE.test(value)) continue;
      value = value.toLowerCase();
    } else {
      const url = normalizeUrl(value);
      if (!url) continue;
      value = url;
    }

    const label = String(r.label || value).trim().slice(0, 120);
    out.push({
      value: value.slice(0, 500),
      kind,
      label: label || value.slice(0, 80),
      reason: String(r.reason || "").trim().slice(0, 320),
      category: String(r.category || "other").trim().slice(0, 60),
    });
    if (out.length >= MAX_BRAND_DISCOVERY_SUGGESTIONS) break;
  }
  return out;
}

export function heuristicBrandDiscoverySuggestions(
  ctx: BrandDiscoveryContext,
  mode: BrandDiscoveryMode
): BrandDiscoverySuggestion[] {
  if (mode === "emails") return heuristicEmailSuggestions(ctx);
  return heuristicWebsiteSuggestions(ctx);
}

function heuristicWebsiteSuggestions(ctx: BrandDiscoveryContext): BrandDiscoverySuggestion[] {
  const brand = brandLabel(ctx);
  const host = extractHostname(ctx.website);
  const loc = ctx.location?.trim();
  const market = loc ? ` ${loc}` : "";
  const industry = ctx.industry?.trim();

  const items: BrandDiscoverySuggestion[] = [];

  if (host) {
    items.push(
      {
        value: `https://${host}`,
        kind: "website",
        label: "Your homepage",
        reason: "Baseline for messaging, CTAs and brand consistency.",
        category: "own-brand",
      },
      {
        value: googleSearch(`site:${host}`),
        kind: "website",
        label: "Indexed pages",
        reason: "See every public page Google has indexed for your domain.",
        category: "seo",
      },
      {
        value: `https://pagespeed.web.dev/analysis?url=https://${encodeURIComponent(host)}`,
        kind: "website",
        label: "PageSpeed Insights",
        reason: "Compare performance and Core Web Vitals for your site.",
        category: "seo",
      }
    );
  }

  items.push(
    {
      value: googleSearch(`"${brand}" reviews${market}`),
      kind: "website",
      label: "Review search",
      reason: "Find customer reviews and reputation signals across the web.",
      category: "reputation",
    },
    {
      value: googleSearch(`"${brand}"${market}`),
      kind: "website",
      label: "Brand mentions",
      reason: "Discover news, blogs and listings mentioning your brand.",
      category: "press",
    },
    {
      value: googleSearch(`${brand} LinkedIn company`),
      kind: "website",
      label: "LinkedIn presence",
      reason: "Check your company profile and who engages with your brand.",
      category: "social",
    },
    {
      value: googleSearch(`${brand} Instagram`),
      kind: "website",
      label: "Instagram presence",
      reason: "Find official and tagged social content for your brand.",
      category: "social",
    },
    {
      value: googleSearch(`${brand} Facebook`),
      kind: "website",
      label: "Facebook presence",
      reason: "Locate pages, groups and mentions on Facebook.",
      category: "social",
    },
    {
      value: googleSearch(`${brand} Trustpilot`),
      kind: "website",
      label: "Trustpilot check",
      reason: "See if a Trustpilot profile exists and what ratings say.",
      category: "reputation",
    },
    {
      value: googleSearch(`${brand} Google Business`),
      kind: "website",
      label: "Google Business Profile",
      reason: "Verify local listing accuracy and reviews on Google Maps.",
      category: "directory",
    }
  );

  if (industry) {
    items.push(
      {
        value: googleSearch(`${industry} companies${market}`),
        kind: "website",
        label: "Industry peers",
        reason: "Benchmark positioning against others in your category.",
        category: "competitor",
      },
      {
        value: googleSearch(`${industry} directory${market}`),
        kind: "website",
        label: "Industry directories",
        reason: "Find listings where your brand should appear.",
        category: "directory",
      },
      {
        value: googleSearch(`${industry} news${market}`),
        kind: "website",
        label: "Industry media",
        reason: "Spot publications that cover your space and may mention you.",
        category: "press",
      }
    );
  } else {
    items.push(
      {
        value: googleSearch(`competitors ${brand}${market}`),
        kind: "website",
        label: "Competitor landscape",
        reason: "Identify alternative brands customers compare you with.",
        category: "competitor",
      },
      {
        value: googleSearch(`${brand} alternatives`),
        kind: "website",
        label: "Alternative searches",
        reason: "See what shows up when buyers look for substitutes.",
        category: "competitor",
      },
      {
        value: googleSearch(`${brand} partnership`),
        kind: "website",
        label: "Partnership ideas",
        reason: "Find complementary brands and co-marketing opportunities.",
        category: "partner",
      }
    );
  }

  items.push(
    {
      value: googleSearch(`${brand} press release`),
      kind: "website",
      label: "Press coverage",
      reason: "Track official announcements and media pickup.",
      category: "press",
    },
    {
      value: googleSearch(`${brand} site:reddit.com`),
      kind: "website",
      label: "Reddit mentions",
      reason: "Uncover organic conversations about your brand.",
      category: "social",
    },
    {
      value: googleSearch(`${brand} site:youtube.com`),
      kind: "website",
      label: "YouTube content",
      reason: "Find reviews, demos and user-generated video content.",
      category: "social",
    },
    {
      value: googleSearch(`"${brand}" email contact`),
      kind: "website",
      label: "Public contact info",
      reason: "Locate published contact addresses and forms for your brand.",
      category: "verify",
    },
    {
      value: googleSearch(`${brand} B2B marketplace`),
      kind: "website",
      label: "Marketplace listings",
      reason: "Check third-party stores or marketplaces selling your products.",
      category: "directory",
    }
  );

  return dedupeSuggestions(items).slice(0, MAX_BRAND_DISCOVERY_SUGGESTIONS);
}

function heuristicEmailSuggestions(ctx: BrandDiscoveryContext): BrandDiscoverySuggestion[] {
  const brand = brandLabel(ctx);
  const host = extractHostname(ctx.website);
  const loc = ctx.location?.trim();
  const market = loc ? ` ${loc}` : "";
  const items: BrandDiscoverySuggestion[] = [];

  if (host) {
    for (const [local, label, reason] of [
      ["info", "General inbox", "Most common public-facing address — verify it exists and is monitored."],
      ["hello", "Hello inbox", "Friendly first contact address common on modern brands."],
      ["contact", "Contact inbox", "Standard address on contact pages and footers."],
      ["support", "Support inbox", "Post-purchase and customer service channel."],
      ["sales", "Sales inbox", "Inbound commercial enquiries and partnerships."],
      ["press", "Press inbox", "Media and PR requests."],
      ["partners", "Partnerships inbox", "Affiliate, reseller and collaboration enquiries."],
      ["team", "Team inbox", "Small teams often use a shared team@ address."],
    ] as const) {
      items.push({
        value: `${local}@${host}`,
        kind: "email",
        label,
        reason,
        category: "own-domain",
      });
    }
  }

  if (ctx.email && EMAIL_RE.test(ctx.email)) {
    items.unshift({
      value: ctx.email.trim().toLowerCase(),
      kind: "email",
      label: "Registered profile email",
      reason: "The address already saved on your Automazing profile.",
      category: "own-domain",
    });
  }

  items.push(
    {
      value: googleSearch(`${brand} contact email${market}`),
      kind: "website",
      label: "Published contact search",
      reason: "Find pages listing your brand's public email addresses.",
      category: "verify",
    },
    {
      value: googleSearch(`site:${host || brand} mailto`),
      kind: "website",
      label: "Mailto on your site",
      reason: host ? "Extract linked email addresses from your own website." : "Search for mailto links mentioning your brand.",
      category: "verify",
    },
    {
      value: googleSearch(`${brand} customer service email`),
      kind: "website",
      label: "Support email search",
      reason: "See which support addresses customers find online.",
      category: "verify",
    },
    {
      value: googleSearch(`${brand} press contact`),
      kind: "website",
      label: "Press contact search",
      reason: "Locate media contact details published about your brand.",
      category: "media",
    },
    {
      value: googleSearch(`${brand} LinkedIn contact`),
      kind: "website",
      label: "LinkedIn outreach",
      reason: "Find decision-makers and company contact options on LinkedIn.",
      category: "partner",
    },
    {
      value: googleSearch(`${brand} retailer contact${market}`),
      kind: "website",
      label: "Retail partner contacts",
      reason: "Identify stockists or resellers and their buyer inboxes.",
      category: "partner",
    },
    {
      value: googleSearch(`${brand} distributor contact${market}`),
      kind: "website",
      label: "Distributor contacts",
      reason: "Find wholesale or distribution partner contact pages.",
      category: "partner",
    },
    {
      value: googleSearch(`industry association ${ctx.industry || brand} contact${market}`),
      kind: "website",
      label: "Industry association",
      reason: "Trade bodies often list member contact paths and directories.",
      category: "partner",
    },
    {
      value: googleSearch(`${brand} podcast contact`),
      kind: "website",
      label: "Podcast outreach",
      reason: "Shows in your niche often publish guest or sponsor contact forms.",
      category: "media",
    },
    {
      value: googleSearch(`${brand} influencer collaboration email`),
      kind: "website",
      label: "Creator collaborations",
      reason: "Find creator partnership contact patterns in your category.",
      category: "partner",
    },
    {
      value: googleSearch(`${brand} WHOIS`),
      kind: "website",
      label: "Domain registrant",
      reason: "WHOIS may list administrative contact emails for your domain.",
      category: "verify",
    }
  );

  return dedupeSuggestions(items).slice(0, MAX_BRAND_DISCOVERY_SUGGESTIONS);
}

function dedupeSuggestions(items: BrandDiscoverySuggestion[]): BrandDiscoverySuggestion[] {
  const seen = new Set<string>();
  const out: BrandDiscoverySuggestion[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
