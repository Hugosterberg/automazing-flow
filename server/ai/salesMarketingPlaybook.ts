/**
 * Sales & marketing playbook — pitch angles, outreach copy, objections,
 * campaigns, channels and promotions tailored to the tenant's business profile.
 */

export type SalesPlaybookMode =
  | "pitch-angles"
  | "cold-outreach"
  | "objections"
  | "campaigns"
  | "channels"
  | "promotions";

export interface SalesPlaybookContext {
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  industry?: string;
}

export interface SalesPlaybookItem {
  title: string;
  body: string;
  detail: string;
  category: string;
}

export const MAX_PLAYBOOK_ITEMS = 12;

export const PLAYBOOK_MODE_LABELS: Record<SalesPlaybookMode, string> = {
  "pitch-angles": "Pitch angles",
  "cold-outreach": "Cold outreach",
  objections: "Objections",
  campaigns: "Campaigns",
  channels: "Channels",
  promotions: "Promotions",
};

function brandLabel(ctx: SalesPlaybookContext): string {
  return (ctx.company || ctx.businessName || "your business").trim();
}

function contextLines(ctx: SalesPlaybookContext): string[] {
  return [
    `Brand / company: ${brandLabel(ctx)}`,
    ctx.website ? `Website: ${ctx.website}` : "",
    ctx.email ? `Contact email: ${ctx.email}` : "",
    ctx.location ? `Market / location: ${ctx.location}` : "",
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.notes ? `Notes / offering: ${ctx.notes}` : "",
  ].filter(Boolean);
}

const JSON_CONTRACT =
  '{"items":[{"title":"...","body":"...","detail":"...","category":"..."}]}';

export function buildSalesPlaybookPrompt(
  ctx: SalesPlaybookContext,
  mode: SalesPlaybookMode,
  count = MAX_PLAYBOOK_ITEMS
): string {
  const lines = contextLines(ctx);

  const prompts: Record<SalesPlaybookMode, string> = {
    "pitch-angles":
      `You are a B2B/B2C sales strategist. Propose ${count} distinct PITCH ANGLES — short value propositions ` +
      `or elevator pitches for selling this brand's products or services.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Mix problem/solution, ROI, social proof, urgency, and niche positioning angles.\n` +
      `title = angle name, body = 1-2 sentence pitch, detail = when to use it, category = positioning|roi|proof|urgency|niche|other\n` +
      `Return ONLY JSON: ${JSON_CONTRACT}`,

    "cold-outreach":
      `You are an outbound sales copywriter. Propose ${count} COLD OUTREACH messages to start conversations ` +
      `about this business's products or services.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Include email subject lines, LinkedIn DMs, and short intro emails. Keep each body under 80 words.\n` +
      `title = subject or opener label, body = the message, detail = follow-up tip, category = email|linkedin|dm|other\n` +
      `Return ONLY JSON: ${JSON_CONTRACT}`,

    objections:
      `You are a sales coach. Propose ${count} common OBJECTIONS buyers might raise and strong RESPONSES ` +
      `when selling for this business.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Cover price, timing, trust, competition, and fit objections.\n` +
      `title = the objection (in quotes), body = recommended response, detail = proof point or question to ask back, category = price|timing|trust|competition|fit|other\n` +
      `Return ONLY JSON: ${JSON_CONTRACT}`,

    campaigns:
      `You are a growth marketer. Propose ${count} MARKETING CAMPAIGNS this business could run in the next 30-90 days ` +
      `to sell more products or services.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Mix launch, seasonal, referral, content, and partnership campaigns.\n` +
      `title = campaign name, body = concept in 1-2 sentences, detail = 3 concrete steps, category = launch|seasonal|referral|content|partner|other\n` +
      `Return ONLY JSON: ${JSON_CONTRACT}`,

    channels:
      `You are a marketing strategist. Propose ${count} MARKETING CHANNELS where this business should promote ` +
      `and sell its products or services.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Include paid, organic, local, marketplace, and partnership channels where relevant.\n` +
      `title = channel name, body = why it fits, detail = first step to test it, category = paid|organic|local|marketplace|partner|other\n` +
      `Return ONLY JSON: ${JSON_CONTRACT}`,

    promotions:
      `You are a promotions strategist. Propose ${count} PROMOTIONS, offers or hooks this business could use ` +
      `to drive product sales or sign-ups.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Mix discounts, bundles, trials, limited offers, and value-add promotions.\n` +
      `title = promotion name, body = the offer, detail = timing or audience, category = discount|bundle|trial|limited|value-add|other\n` +
      `Return ONLY JSON: ${JSON_CONTRACT}`,
  };

  return prompts[mode];
}

export function parseSalesPlaybookItems(content: string): SalesPlaybookItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const arr = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return [];

  const out: SalesPlaybookItem[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = String(r.title || "").trim();
    if (!title) continue;
    out.push({
      title: title.slice(0, 160),
      body: String(r.body || "").trim().slice(0, 600),
      detail: String(r.detail || "").trim().slice(0, 320),
      category: String(r.category || "other").trim().slice(0, 60),
    });
    if (out.length >= MAX_PLAYBOOK_ITEMS) break;
  }
  return out;
}

export function heuristicSalesPlaybookItems(
  ctx: SalesPlaybookContext,
  mode: SalesPlaybookMode
): SalesPlaybookItem[] {
  const brand = brandLabel(ctx);
  const loc = ctx.location?.trim();
  const market = loc ? ` in ${loc}` : "";
  const industry = ctx.industry?.trim() || "your category";

  const byMode: Record<SalesPlaybookMode, SalesPlaybookItem[]> = {
    "pitch-angles": [
      {
        title: "Problem → solution",
        body: `${brand} helps customers who struggle with ${industry} get a clear, reliable outcome without the usual hassle.`,
        detail: "Use in discovery calls when the prospect describes a pain point.",
        category: "positioning",
      },
      {
        title: "Time saved",
        body: `With ${brand}, teams spend less time on manual work and more on growth — measurable from week one.`,
        detail: "Strong for ops-heavy buyers and small business owners.",
        category: "roi",
      },
      {
        title: "Trusted by peers",
        body: `Businesses${market} choose ${brand} because it delivers consistent results they can show to stakeholders.`,
        detail: "Pair with a case study, review or logo when you have one.",
        category: "proof",
      },
      {
        title: "Low-risk start",
        body: `Try ${brand} with a small first step — no long commitment until you see value.`,
        detail: "Good for hesitant prospects or competitive bake-offs.",
        category: "urgency",
      },
      {
        title: "Premium specialist",
        body: `${brand} is built for ${industry} — not a generic tool that only covers half your workflow.`,
        detail: "Use when competing against broad platforms.",
        category: "niche",
      },
      {
        title: "Revenue impact",
        body: `${brand} turns attention into revenue with a clearer offer and faster follow-up.`,
        detail: "Lead with numbers if you have conversion or revenue data.",
        category: "roi",
      },
      {
        title: "Local relevance",
        body: `${brand} understands${market || " your market"} — messaging, timing and support that fits how you sell.`,
        detail: "Emphasize local proof, language and delivery.",
        category: "niche",
      },
      {
        title: "Before / after",
        body: `Before ${brand}: scattered tools and missed leads. After: one clear path from interest to sale.`,
        detail: "Works well in demos and landing page hero copy.",
        category: "positioning",
      },
      {
        title: "Customer success story",
        body: `"We switched to ${brand} and saw results within the first month" — let happy customers tell the story.`,
        detail: "Ask your best customer for a 2-sentence quote.",
        category: "proof",
      },
      {
        title: "Seasonal push",
        body: `${brand} is ready for your next busy period — stock, campaigns and follow-up aligned.`,
        detail: "Tie to an upcoming holiday, quarter end or industry peak.",
        category: "urgency",
      },
      {
        title: "Partnership angle",
        body: `${brand} complements tools you already use — faster to adopt, easier to justify internally.`,
        detail: "Name integrations or workflows they already run.",
        category: "positioning",
      },
      {
        title: "Outcome guarantee frame",
        body: `We focus on the outcome you care about — if ${brand} doesn't move the needle, we adjust until it does.`,
        detail: "Use carefully; only if you can back it with onboarding support.",
        category: "trust",
      },
    ],
    "cold-outreach": [
      {
        title: "Short intro email",
        body: `Hi {{name}} — I work with ${brand}. We help ${industry} teams${market} get more from every lead. Worth a 15-min chat next week?`,
        detail: "Follow up once after 4 business days with one new proof point.",
        category: "email",
      },
      {
        title: "Problem-led subject",
        body: `Subject: Quick question about {{pain}}\n\nHi {{name}}, noticed {{company}} is active in ${industry}. We help similar teams fix {{pain}} — open to a brief call?`,
        detail: "Personalize {{pain}} from their website or LinkedIn.",
        category: "email",
      },
      {
        title: "LinkedIn connect note",
        body: `Hi {{name}} — I follow ${industry}${market} and thought ${brand} might be relevant for {{company}}. Happy to share a 2-min overview if useful.`,
        detail: "Send connection request first; message only if they accept.",
        category: "linkedin",
      },
      {
        title: "Referral opener",
        body: `Hi {{name}} — {{mutual}} suggested I reach out. ${brand} helps teams like {{company}} with {{outcome}}. Do you handle this area?`,
        detail: "Always get permission before name-dropping.",
        category: "email",
      },
      {
        title: "Value-first DM",
        body: `Saw your post about {{topic}} — we published a short checklist for ${industry} teams. Want me to send it? (No pitch unless you ask.)`,
        detail: "Actually send a useful one-pager if they reply yes.",
        category: "dm",
      },
      {
        title: "Event follow-up",
        body: `Great meeting you at {{event}}. As discussed, ${brand} helps with {{outcome}}. Here's a link to book 15 min: {{link}}`,
        detail: "Send within 48 hours while memory is fresh.",
        category: "email",
      },
      {
        title: "Case study hook",
        body: `Hi {{name}} — a ${industry} company${market} similar to {{company}} improved {{metric}} with ${brand}. Worth sharing how?`,
        detail: "Replace {{metric}} with a real number from your best customer.",
        category: "email",
      },
      {
        title: "Soft bump",
        body: `Hi {{name}} — circling back in case my note got buried. Still happy to show how ${brand} helps with {{outcome}}.`,
        detail: "Second touch only; add one new line of value.",
        category: "email",
      },
      {
        title: "Partner intro",
        body: `Hi {{name}} — ${brand} often partners with {{type}} serving ${industry}. Could we explore a co-marketing or referral fit?`,
        detail: "Target agencies, resellers or complementary products.",
        category: "linkedin",
      },
      {
        title: "Local angle",
        body: `Hi {{name}} — we're working with several ${industry} businesses${market}. Would love to learn how {{company}} handles {{process}} today.`,
        detail: "Lead with curiosity, not a product dump.",
        category: "email",
      },
      {
        title: "Break-up email",
        body: `Hi {{name}} — I'll pause outreach for now. If {{outcome}} becomes a priority, reply anytime and I'll share how ${brand} helps.`,
        detail: "Surprisingly effective as a final touch.",
        category: "email",
      },
      {
        title: "Video intro offer",
        body: `Hi {{name}} — I can send a 90-second Loom showing how ${brand} handles {{use case}} for teams like yours. Interested?`,
        detail: "Record a generic Loom once and personalize the intro line.",
        category: "dm",
      },
    ],
    objections: [
      {
        title: `"It's too expensive"`,
        body: `I hear you on budget. Most customers compare cost to {{alternative cost}} — ${brand} usually pays back within {{timeframe}} through {{benefit}}.`,
        detail: 'Ask: "What would need to be true for this to feel worth it?"',
        category: "price",
      },
      {
        title: `"We need to think about it"`,
        body: `Of course. What specific questions would you need answered to feel confident? I can send a one-pager or loop in a customer reference.`,
        detail: "Book a concrete follow-up date before ending the call.",
        category: "timing",
      },
      {
        title: `"We're happy with our current solution"`,
        body: `That's great — many of our customers switched from {{incumbent}} when they needed {{gap}}. Worth a 15-min compare on that one gap?`,
        detail: "Focus on one capability gap, not a full rip-and-replace.",
        category: "competition",
      },
      {
        title: `"We don't have time to implement"`,
        body: `${brand} is designed for a fast start — most teams are live in {{days}} with hands-on onboarding from us.`,
        detail: "Offer a phased rollout or done-for-you setup.",
        category: "timing",
      },
      {
        title: `"I'm not the decision maker"`,
        body: `Understood. Who else should be in the room for a short overview? I can tailor a 10-min deck for your internal champion.`,
        detail: "Send materials they can forward upward.",
        category: "fit",
      },
      {
        title: `"We tried something similar before"`,
        body: `Sorry that didn't work out. What broke last time? We built ${brand} specifically to avoid {{common failure}}.`,
        detail: "Listen first; don't defend the category.",
        category: "trust",
      },
      {
        title: `"Send me more info"`,
        body: `Happy to — so I send the right material: is your priority {{A}} or {{B}}? I'll follow up {{day}} to see if questions came up.`,
        detail: "Qualify before sending a generic PDF.",
        category: "timing",
      },
      {
        title: `"We're too small"`,
        body: `Many of our best customers started small. ${brand} scales with you — you only pay for what you use today.`,
        detail: "Share a small-customer success story.",
        category: "fit",
      },
      {
        title: `"Security / compliance concerns"`,
        body: `Valid question. Here's how we handle data, access and compliance — and I can connect you with our security overview.`,
        detail: "Have a one-page security FAQ ready.",
        category: "trust",
      },
      {
        title: `"Your competitor is cheaper"`,
        body: `They may be on price. Customers choose ${brand} for {{reliability/support/outcomes}} — happy to walk through what you'd get day-to-day.`,
        detail: "Never trash-talk; compare total cost of ownership.",
        category: "competition",
      },
      {
        title: `"Not the right time of year"`,
        body: `Makes sense. When does your next planning cycle start? We can pilot now so you're ready when budget opens.`,
        detail: "Offer a low-commitment pilot before their peak season.",
        category: "timing",
      },
      {
        title: `"We build in-house"`,
        body: `Respect that. Teams usually keep ${brand} for {{speed/support}} while engineering focuses on core product. Worth comparing build vs buy on one workflow?`,
        detail: "Pick one workflow where build cost is highest.",
        category: "fit",
      },
    ],
    campaigns: [
      {
        title: "Launch week blitz",
        body: `Announce ${brand}'s key product with daily posts, email to your list and outreach to 20 warm contacts.`,
        detail: "Day 1 tease → Day 3 reveal → Day 5 offer → Day 7 last chance.",
        category: "launch",
      },
      {
        title: "Customer story series",
        body: `Publish one short case study per week showing real results from ${industry} customers${market}.`,
        detail: "Record 15-min interviews; repurpose into posts and emails.",
        category: "content",
      },
      {
        title: "Referral push",
        body: `Reward existing customers who refer a new buyer to ${brand} with a meaningful thank-you or credit.`,
        detail: "Make the ask personal — email your top 10 customers first.",
        category: "referral",
      },
      {
        title: "Local presence sprint",
        body: `Get ${brand} listed and active on Google Business, local directories and community groups${market}.`,
        detail: "Post weekly updates and respond to every review.",
        category: "local",
      },
      {
        title: "Partner co-marketing",
        body: `Run a joint webinar or bundle with a complementary ${industry} brand serving the same audience.`,
        detail: "Split leads 50/50 and promote to both email lists.",
        category: "partner",
      },
      {
        title: "Seasonal offer",
        body: `Tie ${brand} to an upcoming season, holiday or industry peak with a time-boxed offer.`,
        detail: "Start promoting 3 weeks before the peak.",
        category: "seasonal",
      },
      {
        title: "Educational email course",
        body: `5-day email series teaching one skill your buyers need — each email ends with how ${brand} helps.`,
        detail: "Promote via social and a simple landing page signup.",
        category: "content",
      },
      {
        title: "Retargeting warm traffic",
        body: `Run ads to site visitors and email engagers who didn't convert — highlight one proof point and a clear CTA.`,
        detail: "Need ~500+ monthly visitors for meaningful retargeting.",
        category: "paid",
      },
      {
        title: "Review generation",
        body: `Ask your 20 happiest ${brand} customers for a public review on Google, Trustpilot or industry sites.`,
        detail: "Send a personal link right after a win moment.",
        category: "proof",
      },
      {
        title: "Competitive comparison page",
        body: `Publish an honest "Why teams choose ${brand}" page addressing alternatives in ${industry}.`,
        detail: "Use for sales enablement and paid search on competitor terms.",
        category: "content",
      },
      {
        title: "Flash sale / bundle",
        body: `Bundle your top products or services from ${brand} at a limited-time package price.`,
        detail: "Cap quantity or time to create urgency.",
        category: "seasonal",
      },
      {
        title: "Community AMA",
        body: `Host a live Q&A about ${industry} trends — position ${brand} as the helpful expert, not a hard sell.`,
        detail: "Promote in LinkedIn groups and partner newsletters.",
        category: "organic",
      },
    ],
    channels: [
      {
        title: "Google Business Profile",
        body: `Local buyers${market} discover ${brand} when searching for ${industry} — reviews and posts drive calls.`,
        detail: "Complete every field; post weekly; ask for reviews after delivery.",
        category: "local",
      },
      {
        title: "LinkedIn organic",
        body: `Decision-makers in ${industry} scroll LinkedIn daily — thought leadership from ${brand} builds trust.`,
        detail: "Post 3x/week: tip, story, proof. Comment on target accounts.",
        category: "organic",
      },
      {
        title: "Email newsletter",
        body: `Your list is an owned channel — use it for launches, tips and offers from ${brand}.`,
        detail: "Send monthly minimum; segment by customer vs prospect.",
        category: "organic",
      },
      {
        title: "Meta / Instagram ads",
        body: `Visual products and lifestyle brands from ${brand} perform well with short video ads to lookalike audiences.`,
        detail: "Start with $20/day testing 3 creatives for 7 days.",
        category: "paid",
      },
      {
        title: "Google Search ads",
        body: `Capture high-intent searches for ${industry} solutions${market} when people are ready to buy.`,
        detail: "Bid on problem keywords first, not just brand terms.",
        category: "paid",
      },
      {
        title: "Industry directories",
        body: `Buyers comparing vendors in ${industry} use category directories — ${brand} should appear with strong copy.`,
        detail: "Audit top 5 directories your competitors use.",
        category: "marketplace",
      },
      {
        title: "Marketplaces (Amazon, Etsy, etc.)",
        body: `If ${brand} sells physical products, marketplaces add reach beyond your own site.`,
        detail: "Optimize titles, A+ content and review velocity.",
        category: "marketplace",
      },
      {
        title: "YouTube / short video",
        body: `Demo and how-to content for ${brand} products ranks for years and supports sales conversations.`,
        detail: "Film 3 short demos answering top customer questions.",
        category: "organic",
      },
      {
        title: "Partners & affiliates",
        body: `Resellers, agencies and creators can introduce ${brand} to audiences you can't reach alone.`,
        detail: "Define commission or referral terms; provide a one-page partner kit.",
        category: "partner",
      },
      {
        title: "Events & trade shows",
        body: `Face-to-face still works in ${industry} — ${brand} at the right event generates qualified leads.`,
        detail: "Book meetings before the event; follow up within 48 hours.",
        category: "local",
      },
      {
        title: "PR / industry media",
        body: `Trade publications covering ${industry} lend credibility when they mention ${brand}.`,
        detail: "Pitch data, trends or customer stories — not a product ad.",
        category: "organic",
      },
      {
        title: "Retargeting + CRM sync",
        body: `Reconnect with people who visited ${brand}'s site or opened emails but didn't buy.`,
        detail: "Install pixel/tag manager; sync segments to ad platforms.",
        category: "paid",
      },
    ],
    promotions: [
      {
        title: "New customer welcome offer",
        body: `First-time buyers get {{discount}} off their first order from ${brand} — lowers trial friction.`,
        detail: "Promote on homepage banner and checkout for 30 days.",
        category: "discount",
      },
      {
        title: "Bundle & save",
        body: `Combine your two best-selling ${brand} products at a package price — increases average order value.`,
        detail: "Name the bundle; show savings vs buying separately.",
        category: "bundle",
      },
      {
        title: "Free trial / sample",
        body: `Let prospects experience ${brand} risk-free before committing — especially for higher-ticket offers.`,
        detail: "Cap trial length; require email for follow-up sequence.",
        category: "trial",
      },
      {
        title: "Limited-time flash sale",
        body: `48-hour sale on ${brand}'s hero product — email + social countdown creates urgency.`,
        detail: "Use only 2-3 times per year to keep credibility.",
        category: "limited",
      },
      {
        title: "Refer-a-friend credit",
        body: `Give existing customers a credit when a friend buys from ${brand} for the first time.`,
        detail: "Double-sided rewards convert best.",
        category: "value-add",
      },
      {
        title: "Seasonal gift with purchase",
        body: `Free accessory or service add-on with every ${brand} order over {{threshold}} this month.`,
        detail: "Tie to a holiday or industry season.",
        category: "value-add",
      },
      {
        title: "Early-bird launch pricing",
        body: `Pre-order ${brand}'s new product at a locked-in lower price for the first 100 buyers.`,
        detail: "Show countdown and units remaining.",
        category: "limited",
      },
      {
        title: "Annual vs monthly incentive",
        body: `Save {{percent}} when paying annually for ${brand} instead of month-to-month.`,
        detail: "Highlight cash-flow benefit for B2B buyers.",
        category: "discount",
      },
      {
        title: "Cart abandonment offer",
        body: `Automated email: "Still thinking about {{product}}? Here's {{incentive}} if you complete checkout today."`,
        detail: "Send 1 hour and 24 hours after abandon.",
        category: "discount",
      },
      {
        title: "VIP loyalty tier",
        body: `Repeat ${brand} customers unlock early access, exclusive bundles or priority support.`,
        detail: "Segment by order count or lifetime value.",
        category: "value-add",
      },
      {
        title: "Trade-in / upgrade credit",
        body: `Credit toward ${brand}'s new product when customers upgrade from an older version or competitor.`,
        detail: "Works for hardware and subscription upgrades.",
        category: "bundle",
      },
      {
        title: "Webinar exclusive offer",
        body: `Attendees of your ${industry} webinar get a one-time ${brand} offer valid 72 hours after the session.`,
        detail: "Reveal the offer in the last 5 minutes.",
        category: "limited",
      },
    ],
  };

  return byMode[mode].slice(0, MAX_PLAYBOOK_ITEMS);
}

export function normalizePlaybookMode(raw: string | undefined): SalesPlaybookMode {
  const modes: SalesPlaybookMode[] = [
    "pitch-angles",
    "cold-outreach",
    "objections",
    "campaigns",
    "channels",
    "promotions",
  ];
  return modes.includes(raw as SalesPlaybookMode) ? (raw as SalesPlaybookMode) : "pitch-angles";
}
