/**
 * Generate automations/mcp/shortcuts locale files + pages chrome.
 * Run: node scripts/build-i18n-batch2.mjs
 */
import fs from "node:fs";

const autoSv = {
  shared: { configurableCadence: "Konfigurerbart schema" },
  topics: {
    messages: {
      title: "Meddelanden & inbox",
      description:
        "Automatik som hanterar inkommande konversationer så du slipper svara på allt manuellt.",
    },
    content: {
      title: "Innehåll & publicering",
      description:
        "Automatik som publicerar schemalagt innehåll på rätt tid utan att du behöver trycka på knappen.",
    },
    reports: {
      title: "Rapporter & utskick",
      description:
        "Sammanställningar och larm som mejlas automatiskt istället för att du ska komma ihåg att kolla.",
    },
    insights: {
      title: "AI & insikter",
      description:
        "Bakgrundsjobb som håller rekommendationer och nyckeltal färska utan manuell uppdatering.",
    },
  },
  entries: {
    "dm-auto-reply": {
      title: "Auto-svar på DM:s",
      description: "Läser olästa konversationer och skriver svar — som utkast eller skickar direkt.",
      explainer:
        "Jobbet läser nya DM:s, skriver ett svarsförslag och lägger det i kön under Meddelanden. I standardläge skickas inget förrän du trycker skicka. Auto-skick kräver en extra bekräftelse.",
      exampleDraft:
        "Hej! Tack för att du hör av dig — absolut intresserade. Skicka gärna mer om upplägg så återkommer vi snart.",
      trustNote: "Utkast före sändning som standard — du godkänner innan något går ut.",
    },
    "publish-scheduled-posts": {
      title: "Publicera schemalagda inlägg",
      description:
        "Sveper var 15:e minut, försöker om misslyckade inlägg en gång, och publicerar det som är due.",
    },
    "sales-outreach-auto": {
      title: "Automatisk outreach",
      description:
        "Skapar utkast till uppföljningsmejl för due leads och tysta leads (10+ dagar utan kontakt).",
      explainer:
        "När en lead är due eller tyst för länge skapas ett uppföljningsutkast i Sales-kön. Du granskar, redigerar och skickar — automationen skickar inte själv.",
      exampleDraft: "Hej! Ville bara följa upp vårt tidigare samtal — har ni hunnit titta på förslaget?",
      trustNote: "Bara utkast i kön — ingen outreach skickas utan dig.",
    },
    "content-pipeline": {
      title: "Innehållspipeline",
      description:
        "Seedar repurpose/gap/evergreen-idéer och flyttar köade inlägg till schemalagd publicering.",
    },
    "cart-recovery": {
      title: "Kundvagnsåtervinning",
      description:
        "Skickar återvinningsmejl till kunder som lämnat varukorgen i Shopify (deduplicerat).",
    },
    "review-reply-auto": {
      title: "Automatiska review-svar",
      description:
        "Skapar utkast till svar på nya recensioner och skickar brådskande mejl vid ≤2★ — du godkänner på Reviews.",
      explainer:
        "Nya recensioner får ett svarsutkast under Recensioner. Vid ≤2★ kan du få ett brådskande mejl — själva svaret publiceras först när du godkänner.",
      exampleDraft: "Tack för din feedback — vi tar det vidare internt och återkommer gärna.",
      trustNote: "Utkast först — publicering kräver ditt godkännande.",
    },
    "mail-reply-auto": {
      title: "Automatiska mail-utkast",
      description:
        "Skapar svarsutkast till olästa Gmail/Outlook-mail — inget skickas förrän du godkänner under Meddelanden.",
      explainer:
        "Jobbet plockar olästa mail, skriver ett svarsutkast och lägger det i Meddelanden. Du kan skicka, redigera eller kasta — automationen skickar aldrig själv.",
      exampleDraft:
        "Hej Anna! Tack för din förfrågan — absolut, vi har tid. Föreslår tisdag eller torsdag 10:00.",
      trustNote: "Utkast före sändning — inget mail går ut utan dig.",
    },
    "marketing-actions": {
      title: "Marknadsförings-åtgärder",
      description:
        "Pausar automatiskt Meta-kampanjer med betyg F/poor enligt analytics (Google flaggas för manuell review).",
    },
    "weekly-insight-digest": {
      title: "Veckovis insiktsrapport",
      description:
        "Måndagsmejl med ROAS-trend, publicerade inlägg och content-tips när social-flödet är aktivt.",
    },
    "engagement-followup": {
      title: "Engagement-följdflöde",
      description: "Mejlar när olästa DM:s hopar sig så du inte missar köpintention eller frågor.",
    },
    "daily-digest": {
      title: "Daglig översikt",
      description: "Morgonmejl varje vardag med det som behöver göras.",
    },
    "weekly-report": {
      title: "Veckorapport",
      description: "Måndagsmejl som summerar förra veckan.",
    },
    "lead-reminder": {
      title: "Lead-påminnelse",
      description: "Mejl när leads behöver uppföljning idag eller är försenade.",
    },
    "task-reminder": {
      title: "Uppgiftspåminnelse",
      description: "Mejl med försenade och dagens uppgifter.",
    },
    "marketing-alerts": {
      title: "Marknadsförings-larm",
      description: "Mejl när ROAS går under 1× eller annonser körs mot tomma hyllor.",
    },
    "ai-recommendations-refresh": {
      title: "AI-rekommendationer",
      description: "Uppdaterar rekommendationerna utifrån connections, tasks och innehåll.",
    },
    "marketing-snapshot": {
      title: "Marknadsförings-snapshot",
      description: "Sparar dagens annons-KPI:er så veckotrenden på Marketing-sidan alltid är komplett.",
    },
    "social-stats-snapshot": {
      title: "Social statistik-snapshot",
      description:
        "Sparar dagliga följar- och engagemangssiffror per konto så Social-sidan kan visa trender, inte bara ögonblicksbilder.",
    },
    "market-pulse-snapshot": {
      title: "Market pulse-snapshot",
      description:
        "Hämtar LunarCrush-sentiment varje natt så startsidan laddar direkt utan live MCP-anrop.",
    },
  },
};

const autoEn = {
  shared: { configurableCadence: "Configurable schedule" },
  topics: {
    messages: {
      title: "Messages & inbox",
      description: "Automation that handles incoming conversations so you don’t reply to everything manually.",
    },
    content: {
      title: "Content & publishing",
      description: "Automation that publishes scheduled content on time without you pressing the button.",
    },
    reports: {
      title: "Reports & digests",
      description: "Summaries and alerts emailed automatically instead of you remembering to check.",
    },
    insights: {
      title: "AI & insights",
      description: "Background jobs that keep recommendations and KPIs fresh without manual refresh.",
    },
  },
  entries: {
    "dm-auto-reply": {
      title: "Auto-reply to DMs",
      description: "Reads unread conversations and writes replies — as drafts or sends directly.",
      explainer:
        "The job reads new DMs, writes a reply suggestion, and puts it in the Messages queue. In default mode nothing is sent until you press send. Auto-send needs an extra confirmation.",
      exampleDraft:
        "Hi! Thanks for reaching out — definitely interested. Send more about the setup and we’ll get back soon.",
      trustNote: "Draft before send by default — you approve before anything goes out.",
    },
    "publish-scheduled-posts": {
      title: "Publish scheduled posts",
      description: "Sweeps every 15 minutes, retries failed posts once, and publishes what’s due.",
    },
    "sales-outreach-auto": {
      title: "Automatic outreach",
      description: "Creates follow-up email drafts for due leads and quiet leads (10+ days without contact).",
      explainer:
        "When a lead is due or quiet too long, a follow-up draft is created in the Sales queue. You review, edit and send — the automation does not send on its own.",
      exampleDraft: "Hi! Just following up on our earlier chat — have you had a chance to look at the proposal?",
      trustNote: "Drafts in the queue only — no outreach sends without you.",
    },
    "content-pipeline": {
      title: "Content pipeline",
      description: "Seeds repurpose/gap/evergreen ideas and moves queued posts into scheduled publishing.",
    },
    "cart-recovery": {
      title: "Cart recovery",
      description: "Sends recovery emails to customers who left a Shopify cart (deduplicated).",
    },
    "review-reply-auto": {
      title: "Automatic review replies",
      description: "Creates reply drafts for new reviews and sends urgent mail at ≤2★ — you approve on Reviews.",
      explainer:
        "New reviews get a reply draft under Reviews. At ≤2★ you may get an urgent email — the reply itself publishes only when you approve.",
      exampleDraft: "Thanks for your feedback — we’re taking it internally and happy to follow up.",
      trustNote: "Drafts first — publishing requires your approval.",
    },
    "mail-reply-auto": {
      title: "Automatic mail drafts",
      description: "Creates reply drafts for unread Gmail/Outlook mail — nothing sends until you approve in Messages.",
      explainer:
        "The job picks unread mail, writes a reply draft, and puts it in Messages. You can send, edit or discard — the automation never sends on its own.",
      exampleDraft: "Hi Anna! Thanks for your inquiry — absolutely, we have time. Suggest Tuesday or Thursday 10:00.",
      trustNote: "Draft before send — no mail goes out without you.",
    },
    "marketing-actions": {
      title: "Marketing actions",
      description: "Automatically pauses Meta campaigns rated F/poor by analytics (Google flagged for manual review).",
    },
    "weekly-insight-digest": {
      title: "Weekly insight digest",
      description: "Monday email with ROAS trend, published posts and content tips when the social feed is active.",
    },
    "engagement-followup": {
      title: "Engagement follow-up",
      description: "Emails when unread DMs pile up so you don’t miss purchase intent or questions.",
    },
    "daily-digest": {
      title: "Daily digest",
      description: "Morning email every weekday with what needs doing.",
    },
    "weekly-report": {
      title: "Weekly report",
      description: "Monday email summarizing last week.",
    },
    "lead-reminder": {
      title: "Lead reminder",
      description: "Email when leads need follow-up today or are overdue.",
    },
    "task-reminder": {
      title: "Task reminder",
      description: "Email with overdue and today’s tasks.",
    },
    "marketing-alerts": {
      title: "Marketing alerts",
      description: "Email when ROAS drops below 1× or ads run against empty shelves.",
    },
    "ai-recommendations-refresh": {
      title: "AI recommendations",
      description: "Refreshes recommendations from connections, tasks and content.",
    },
    "marketing-snapshot": {
      title: "Marketing snapshot",
      description: "Saves today’s ad KPIs so the weekly trend on Marketing stays complete.",
    },
    "social-stats-snapshot": {
      title: "Social stats snapshot",
      description: "Saves daily follower and engagement figures per account so Social can show trends, not just snapshots.",
    },
    "market-pulse-snapshot": {
      title: "Market pulse snapshot",
      description: "Fetches LunarCrush sentiment every night so Home loads without a live MCP call.",
    },
  },
};

const mcpSv = {
  tabs: {
    overview: { label: "Status", description: "Kopplings- och nyckelstatus för alla MCP-leverantörer." },
    compare: {
      label: "Jämför",
      description: "Kör samma domän eller företag mot varje kopplad MCP-lins och jämför bedömningarna sida vid sida.",
    },
    research: { label: "Research", description: "Marknadspuls, lead-research och konkurrentanalys." },
    marketing: { label: "Marknadsföring", description: "SEO- och marknadsföringsdata." },
    content: { label: "Innehåll", description: "Presentationer och designhjälp." },
    commerce: { label: "E-handel", description: "Frågor mot din Shopify-butik." },
    "crm-mail": { label: "CRM & mail", description: "CRM-assistent och mailsökning." },
    catalog: { label: "Katalog", description: "Alla MCP-leverantörer och vilka datatyper var och en kan hämta." },
    tools: { label: "Verktyg", description: "Bläddra bland och anropa råa verktyg från valfri kopplad MCP-server." },
    developer: { label: "Utvecklare", description: "Dokumentation, domäner, arkitektur och kontextverktyg." },
  },
  features: {
    "market-pulse": {
      title: "Marknadspuls",
      description: "Krypto/socialt sentiment för ett ämne på din startsida.",
      placeholder: "t.ex. bitcoin, ethereum, solana",
      buttonLabel: "Hämta puls",
      unavailable: "Marknadspulsen är inte tillgänglig — koppla LunarCrush med en API-nyckel.",
    },
    "lead-research": {
      title: "Lead-research",
      description: "Företagsöversikt från din kopplade research-leverantör (Exa i första hand, Sprouts som reserv).",
      placeholder: "Företagsnamn, person eller webbplats",
      buttonLabel: "Undersök",
    },
    "competitive-research": {
      title: "Konkurrentanalys",
      description: "Research om konkurrenter och marknadspositionering.",
      placeholder: "t.ex. Acme Corp mot vår positionering",
      buttonLabel: "Undersök",
    },
    "seo-overview": {
      title: "SEO-översikt",
      description: "Domän- eller URL-översikt via Ahrefs OAuth MCP.",
      placeholder: "t.ex. automazing.life",
      buttonLabel: "Analysera",
    },
    "marketing-query": {
      title: "Marknadsföringsdata",
      description: "Fråga efter kampanj- eller kanalsiffror (Supermetrics i första hand, Windsor som reserv).",
      placeholder: "t.ex. Meta-annonskostnad senaste 7 dagarna",
      buttonLabel: "Fråga",
    },
    "deck-generation": {
      title: "Skapa presentation",
      description: "Generera en presentationsdisposition eller ett deck från en prompt.",
      placeholder: "t.ex. Q3-marknadsresultat för intressenter",
      buttonLabel: "Generera",
    },
    "design-assist": {
      title: "Designhjälp",
      description: "Designbriefer och kreativ riktning via Canva OAuth MCP.",
      placeholder: "t.ex. Instagram-karusell för produktlansering",
      buttonLabel: "Hjälp till",
    },
    "shop-catalog": {
      title: "Butikskatalog",
      description: "Sök produkter i din kopplade Shopify-butik (butiksdomän krävs vid koppling).",
      placeholder: "t.ex. bästsäljare taggade sommar",
      buttonLabel: "Sök",
    },
    "crm-query": {
      title: "CRM-assistent",
      description: "Fråga om kunder, affärer och pipeline via Day.ai OAuth MCP.",
      placeholder: "t.ex. öppna affärer över 50k detta kvartal",
      buttonLabel: "Fråga CRM",
    },
    "mail-search": {
      title: "Mailsökning",
      description: "Sök i mail via Superhuman när OAuth är konfigurerat.",
      placeholder: "t.ex. fakturor från Acme förra veckan",
      buttonLabel: "Sök mail",
    },
    "doc-search": {
      title: "Dokumentationssökning",
      description: "Sök i utvecklardokumentation (Twilio nyckellös MCP i första hand, Exa som reserv).",
      placeholder: "t.ex. Hur skickar jag SMS med Twilio?",
      buttonLabel: "Sök",
    },
    "domain-lookup": {
      title: "Domänuppslag",
      description: "Slå upp domäntillgänglighet eller DNS via GoDaddy-API-nyckel.",
      placeholder: "t.ex. automazing.life",
      buttonLabel: "Slå upp",
    },
    "architecture-docs": {
      title: "Arkitekturdokumentation",
      description: "Sök i arkitekturdokumentation via Klarity-API-nyckel.",
      placeholder: "t.ex. händelsedriven orderpipeline",
      buttonLabel: "Sök",
    },
    "context-query": {
      title: "Kontextverktyg",
      description: "Kontext- och integrationsfrågor via Era OAuth MCP.",
      placeholder: "t.ex. sammanfatta kopplade integrationer",
      buttonLabel: "Fråga",
    },
  },
};

const mcpEn = {
  tabs: {
    overview: { label: "Status", description: "Connection and key status for all MCP providers." },
    compare: {
      label: "Compare",
      description: "Run the same domain or company through every connected MCP lens and compare assessments side by side.",
    },
    research: { label: "Research", description: "Market pulse, lead research and competitor analysis." },
    marketing: { label: "Marketing", description: "SEO and marketing data." },
    content: { label: "Content", description: "Presentations and design help." },
    commerce: { label: "Commerce", description: "Queries against your Shopify store." },
    "crm-mail": { label: "CRM & mail", description: "CRM assistant and mail search." },
    catalog: { label: "Catalog", description: "All MCP providers and which data types each can fetch." },
    tools: { label: "Tools", description: "Browse and call raw tools from any connected MCP server." },
    developer: { label: "Developer", description: "Documentation, domains, architecture and context tools." },
  },
  features: {
    "market-pulse": {
      title: "Market pulse",
      description: "Crypto/social sentiment for a topic on your home page.",
      placeholder: "e.g. bitcoin, ethereum, solana",
      buttonLabel: "Fetch pulse",
      unavailable: "Market pulse is unavailable — connect LunarCrush with an API key.",
    },
    "lead-research": {
      title: "Lead research",
      description: "Company overview from your connected research provider (Exa first, Sprouts as backup).",
      placeholder: "Company name, person or website",
      buttonLabel: "Research",
    },
    "competitive-research": {
      title: "Competitor analysis",
      description: "Research on competitors and market positioning.",
      placeholder: "e.g. Acme Corp vs our positioning",
      buttonLabel: "Research",
    },
    "seo-overview": {
      title: "SEO overview",
      description: "Domain or URL overview via Ahrefs OAuth MCP.",
      placeholder: "e.g. automazing.life",
      buttonLabel: "Analyze",
    },
    "marketing-query": {
      title: "Marketing data",
      description: "Ask for campaign or channel figures (Supermetrics first, Windsor as backup).",
      placeholder: "e.g. Meta ad spend last 7 days",
      buttonLabel: "Ask",
    },
    "deck-generation": {
      title: "Create presentation",
      description: "Generate a presentation outline or deck from a prompt.",
      placeholder: "e.g. Q3 marketing results for stakeholders",
      buttonLabel: "Generate",
    },
    "design-assist": {
      title: "Design help",
      description: "Design briefs and creative direction via Canva OAuth MCP.",
      placeholder: "e.g. Instagram carousel for product launch",
      buttonLabel: "Help me",
    },
    "shop-catalog": {
      title: "Store catalog",
      description: "Search products in your connected Shopify store (shop domain required at connect).",
      placeholder: "e.g. bestsellers tagged summer",
      buttonLabel: "Search",
    },
    "crm-query": {
      title: "CRM assistant",
      description: "Ask about customers, deals and pipeline via Day.ai OAuth MCP.",
      placeholder: "e.g. open deals over 50k this quarter",
      buttonLabel: "Ask CRM",
    },
    "mail-search": {
      title: "Mail search",
      description: "Search mail via Superhuman when OAuth is configured.",
      placeholder: "e.g. invoices from Acme last week",
      buttonLabel: "Search mail",
    },
    "doc-search": {
      title: "Documentation search",
      description: "Search developer docs (Twilio keyless MCP first, Exa as backup).",
      placeholder: "e.g. How do I send SMS with Twilio?",
      buttonLabel: "Search",
    },
    "domain-lookup": {
      title: "Domain lookup",
      description: "Look up domain availability or DNS via GoDaddy API key.",
      placeholder: "e.g. automazing.life",
      buttonLabel: "Look up",
    },
    "architecture-docs": {
      title: "Architecture docs",
      description: "Search architecture documentation via Klarity API key.",
      placeholder: "e.g. event-driven order pipeline",
      buttonLabel: "Search",
    },
    "context-query": {
      title: "Context tools",
      description: "Context and integration questions via Era OAuth MCP.",
      placeholder: "e.g. summarize connected integrations",
      buttonLabel: "Ask",
    },
  },
};

const shortcutsSv = {
  sections: {
    global: "Globalt",
    messages: "Meddelanden",
    reviews: "Recensioner",
    activity: "Aktivitet",
    sales: "Sales",
    tasks: "Uppgifter",
    customers: "Kunder",
    content: "Innehåll",
    automations: "Automationer",
    marketing: "Marknadsföring",
    calendar: "Kalender",
  },
  global: {
    palette: "Kommandopalett",
    home: "Gå till Startsida",
    tasks: "Gå till Uppgifter",
    messages: "Gå till Meddelanden",
    sales: "Gå till Försäljning (företagsläge)",
    company: "Gå till Företag (företagsläge)",
    intelligence: "Gå till MCP Intelligence",
    preferences: "Gå till Inställningar",
    help: "Visa genvägslista",
    sidebar: "Visa/dölj sidopanelen",
  },
  messages: {
    next: "Nästa meddelande",
    prev: "Föregående meddelande",
    handled: "Markera som hanterad (eller filtret Hanterade utan valt meddelande)",
    reply: "Svara (fokus)",
    nextOpen: "Nästa öppna",
    filterQueue: "Filter: Kö",
    filterOpen: "Filter: Öppna",
    filterAll: "Filter: Alla",
    search: "Sök",
    close: "Stäng",
    send: "Skicka svar",
  },
  reviews: {
    next: "Nästa recension",
    prev: "Föregående recension",
    markReplied: "Markera som besvarad",
    aiDraft: "AI-utkast",
    filterAll: "Filter: Alla",
    filterNeeds: "Filter: Behöver svar",
    search: "Sök",
    close: "Stäng",
  },
  activity: {
    next: "Nästa händelse",
    prev: "Föregående händelse",
    search: "Sök",
    filterError: "Filter: Fel",
    filterWarn: "Filter: Varningar",
    close: "Stäng",
  },
  sales: {
    search: "Sök",
    next: "Nästa (outreach / uppföljning)",
    prev: "Föregående (outreach / uppföljning)",
    markSent: "Markera som skickad (outreach-kö)",
    outreachDraft: "Outreach-utkast (uppföljningar)",
  },
  tasks: {
    search: "Sök",
    new: "Ny uppgift",
    next: "Nästa kort",
    prev: "Föregående kort",
    edit: "Redigera fokuserat kort",
    filterAll: "Filter: Alla",
    filterOverdue: "Filter: Försenade",
    filterToday: "Filter: Idag",
  },
  customers: {
    next: "Nästa kund",
    prev: "Föregående kund",
    search: "Sök",
    close: "Stäng",
  },
  content: {
    next: "Nästa fil (Bläddra)",
    prev: "Föregående fil (Bläddra)",
    search: "Sök (Bläddra)",
    select: "Välj / växla fil",
  },
  automations: {
    failed: "Misslyckade körningar (scrolla till listan)",
  },
  marketing: {
    next: "Nästa kampanj",
    prev: "Föregående kampanj",
    new: "Ny kampanj",
    edit: "Redigera fokuserad kampanj",
  },
  calendar: {
    next: "Nästa händelse (vald dag)",
    prev: "Föregående händelse (vald dag)",
    open: "Öppna fokuserad händelse",
  },
};

const shortcutsEn = {
  sections: {
    global: "Global",
    messages: "Messages",
    reviews: "Reviews",
    activity: "Activity",
    sales: "Sales",
    tasks: "Tasks",
    customers: "Customers",
    content: "Content",
    automations: "Automations",
    marketing: "Marketing",
    calendar: "Calendar",
  },
  global: {
    palette: "Command palette",
    home: "Go to Home",
    tasks: "Go to Tasks",
    messages: "Go to Messages",
    sales: "Go to Sales (business mode)",
    company: "Go to Company (business mode)",
    intelligence: "Go to MCP Intelligence",
    preferences: "Go to Preferences",
    help: "Show shortcut list",
    sidebar: "Show/hide sidebar",
  },
  messages: {
    next: "Next message",
    prev: "Previous message",
    handled: "Mark as handled (or Handled filter with no message selected)",
    reply: "Reply (focus)",
    nextOpen: "Next open",
    filterQueue: "Filter: Queue",
    filterOpen: "Filter: Open",
    filterAll: "Filter: All",
    search: "Search",
    close: "Close",
    send: "Send reply",
  },
  reviews: {
    next: "Next review",
    prev: "Previous review",
    markReplied: "Mark as replied",
    aiDraft: "AI draft",
    filterAll: "Filter: All",
    filterNeeds: "Filter: Needs reply",
    search: "Search",
    close: "Close",
  },
  activity: {
    next: "Next event",
    prev: "Previous event",
    search: "Search",
    filterError: "Filter: Errors",
    filterWarn: "Filter: Warnings",
    close: "Close",
  },
  sales: {
    search: "Search",
    next: "Next (outreach / follow-up)",
    prev: "Previous (outreach / follow-up)",
    markSent: "Mark as sent (outreach queue)",
    outreachDraft: "Outreach draft (follow-ups)",
  },
  tasks: {
    search: "Search",
    new: "New task",
    next: "Next card",
    prev: "Previous card",
    edit: "Edit focused card",
    filterAll: "Filter: All",
    filterOverdue: "Filter: Overdue",
    filterToday: "Filter: Today",
  },
  customers: {
    next: "Next customer",
    prev: "Previous customer",
    search: "Search",
    close: "Close",
  },
  content: {
    next: "Next file (Browse)",
    prev: "Previous file (Browse)",
    search: "Search (Browse)",
    select: "Select / toggle file",
  },
  automations: {
    failed: "Failed runs (scroll to list)",
  },
  marketing: {
    next: "Next campaign",
    prev: "Previous campaign",
    new: "New campaign",
    edit: "Edit focused campaign",
  },
  calendar: {
    next: "Next event (selected day)",
    prev: "Previous event (selected day)",
    open: "Open focused event",
  },
};

const pagesSv = {
  content: {
    title: "Innehåll",
    smartBar: "Innehåll är hela flödet — välj media, skapa med AI, spara utkast och publicera.",
    smartShort: "Innehåll",
  },
  sales: {
    title: "Försäljning",
    smartBar: "Försäljning samlar leads, affärer och mål — från första kontakt till avslut.",
  },
  marketing: {
    title: "Marknadsföring",
    smartBar: "Marknadsföring visar kampanjer, annonsresultat och vad som behöver åtgärdas.",
  },
  ecommerce: {
    title: "E-handel",
    smartBar: "E-handel samlar Shopify-produkter, ordrar och återvinning i ett flöde.",
  },
  activity: {
    title: "Aktivitet",
    smartBar: "Aktivitet visar vad automationen och integrationerna gjort — fel först, sedan resten.",
  },
  automations: {
    title: "Automationer",
    smartBar: "Automationer sköter det repetitiva — snapshots, påminnelser och synk — så du slipper manuellt underhåll.",
  },
  intelligence: {
    title: "MCP Intelligence",
    smartBar:
      "MCP Intelligence är kontrollpanelen för alla AI-leverantörer — se status, testa nycklar och kör frågor mot dina data.",
  },
  calendar: {
    title: "Kalender",
    smartBar: "Kalendern samlar uppgifter, lead-uppföljningar och externa kalendrar — så du ser veckan i ett flöde.",
  },
  company: {
    title: "Företag",
    smartBar: "Företagsprofilen ger AI och automationer rätt kontext — beskrivning, webb och mål.",
  },
  aiRecommendations: {
    title: "AI-förslag",
    smartBar: "AI-förslag prioriterar nästa steg utifrån dina kopplingar, uppgifter och innehåll.",
  },
};

const pagesEn = {
  content: {
    title: "Content",
    smartBar: "Content is the full flow — pick media, create with AI, save drafts and publish.",
    smartShort: "Content",
  },
  sales: {
    title: "Sales",
    smartBar: "Sales gathers leads, deals and goals — from first contact to close.",
  },
  marketing: {
    title: "Marketing",
    smartBar: "Marketing shows campaigns, ad results and what needs action.",
  },
  ecommerce: {
    title: "E-commerce",
    smartBar: "E-commerce gathers Shopify products, orders and recovery in one flow.",
  },
  activity: {
    title: "Activity",
    smartBar: "Activity shows what automation and integrations did — errors first, then the rest.",
  },
  automations: {
    title: "Automations",
    smartBar: "Automations handle the repetitive — snapshots, reminders and sync — so you skip manual upkeep.",
  },
  intelligence: {
    title: "MCP Intelligence",
    smartBar:
      "MCP Intelligence is the control panel for all AI providers — see status, test keys and run queries on your data.",
  },
  calendar: {
    title: "Calendar",
    smartBar: "Calendar gathers tasks, lead follow-ups and external calendars — so you see the week in one flow.",
  },
  company: {
    title: "Company",
    smartBar: "The company profile gives AI and automations the right context — description, website and goals.",
  },
  aiRecommendations: {
    title: "AI suggestions",
    smartBar: "AI suggestions prioritize next steps from your connections, tasks and content.",
  },
};

for (const [ns, sv, en] of [
  ["automations", autoSv, autoEn],
  ["mcp", mcpSv, mcpEn],
  ["shortcuts", shortcutsSv, shortcutsEn],
  ["pages", pagesSv, pagesEn],
]) {
  fs.writeFileSync(`src/locales/sv/${ns}.json`, JSON.stringify(sv, null, 2) + "\n");
  fs.writeFileSync(`src/locales/en/${ns}.json`, JSON.stringify(en, null, 2) + "\n");
}
console.log("Wrote automations, mcp, shortcuts, pages");
