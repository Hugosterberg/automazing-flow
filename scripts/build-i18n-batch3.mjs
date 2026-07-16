/**
 * Generate pages smartBar keys + dailyBrief + leads/outreach chrome locales.
 * Run: node scripts/build-i18n-batch3.mjs
 */
import fs from "node:fs";

const pagesSv = JSON.parse(fs.readFileSync("src/locales/sv/pages.json", "utf8"));
const pagesEn = JSON.parse(fs.readFileSync("src/locales/en/pages.json", "utf8"));

Object.assign(pagesSv.content, {
  step1: "Koppla Google Drive under Kopplingar",
  step2: "Bläddra eller ladda upp — markera det du vill använda",
  step3: "Skapa med AI, spara till Valda och publicera",
  tip: "När Drive är kopplat försvinner den här guiden — flikarna räcker för flödet.",
  liveBrowseMobile: "{{count}} mediafiler i vyn — markera det du vill använda.",
  liveBrowseDesktop: "{{count}} mediafiler i vyn — J/K bläddra, S välj.",
  liveSelected: "{{count}} valda — gå till Skapa eller Publicera.",
});
Object.assign(pagesEn.content, {
  step1: "Connect Google Drive under Connections",
  step2: "Browse or upload — select what you want to use",
  step3: "Create with AI, save to Selected and publish",
  tip: "When Drive is connected this guide disappears — the tabs are enough for the flow.",
  liveBrowseMobile: "{{count}} media files in view — select what you want to use.",
  liveBrowseDesktop: "{{count}} media files in view — J/K browse, S select.",
  liveSelected: "{{count}} selected — go to Create or Publish.",
});

Object.assign(pagesSv.sales, {
  step1: "Komplettera bolagsprofilen under Företag för bättre AI-förslag",
  step2: "Lägg till leads och följ upp det som är försenat",
  step3: "Flytta affärer i pipelinen och mät mot dina mål",
  tip: "Outreach-utkast kan skickas vidare till Content. Fyll i Företag först så AI-förslagen blir mer relevanta.",
  liveFollowups_one: "{{count}} lead att följa upp idag",
  liveFollowups_other: "{{count}} leads att följa upp idag",
  liveOutreach: "{{count}} outreach-utkast väntar i kön",
  actionFollowups: "Visa uppföljningar",
  actionOutreach: "Outreach-kö",
  tabsAria: "Försäljningsflikar",
  tabLeads: "Leads",
  tabOutreach: "Outreach",
  tabPipeline: "Pipeline",
  tabOverview: "Översikt",
  tabDiscover: "Upptäck",
  tabGoals: "Mål",
});
Object.assign(pagesEn.sales, {
  step1: "Complete the company profile under Company for better AI suggestions",
  step2: "Add leads and follow up what’s overdue",
  step3: "Move deals through the pipeline and measure against your goals",
  tip: "Outreach drafts can be sent on to Content. Fill in Company first so AI suggestions stay relevant.",
  liveFollowups_one: "{{count}} lead to follow up today",
  liveFollowups_other: "{{count}} leads to follow up today",
  liveOutreach: "{{count}} outreach drafts waiting in the queue",
  actionFollowups: "Show follow-ups",
  actionOutreach: "Outreach queue",
  tabsAria: "Sales tabs",
  tabLeads: "Leads",
  tabOutreach: "Outreach",
  tabPipeline: "Pipeline",
  tabOverview: "Overview",
  tabDiscover: "Discover",
  tabGoals: "Goals",
});

Object.assign(pagesSv.marketing, {
  step1: "Koppla Google Ads och Meta för live kampanjdata",
  step2: "Skapa kampanjer eller låt AI föreslå kanaler och erbjudanden",
  step3: "Skicka idéer vidare till Content eller E-handel med ett klick",
  tip: "ROAS och spend syns när annonskonton är kopplade och snapshots körs.",
  liveActiveMobile_one: "{{count}} aktiv kampanj — svep eller tryck för att bläddra.",
  liveActiveMobile_other: "{{count}} aktiva kampanjer — svep eller tryck för att bläddra.",
  liveActiveDesktop_one: "{{count}} aktiv kampanj — J/K bläddra, N ny kampanj.",
  liveActiveDesktop_other: "{{count}} aktiva kampanjer — J/K bläddra, N ny kampanj.",
  livePlannedMobile_one: "{{count}} kampanj planerad — tryck Ny kampanj.",
  livePlannedMobile_other: "{{count}} kampanjer planerade — tryck Ny kampanj.",
  livePlannedDesktop_one: "{{count}} kampanj planerad — tryck N för ny.",
  livePlannedDesktop_other: "{{count}} kampanjer planerade — tryck N för ny.",
});
Object.assign(pagesEn.marketing, {
  step1: "Connect Google Ads and Meta for live campaign data",
  step2: "Create campaigns or let AI suggest channels and offers",
  step3: "Send ideas on to Content or E-commerce in one click",
  tip: "ROAS and spend show when ad accounts are connected and snapshots run.",
  liveActiveMobile_one: "{{count}} active campaign — swipe or tap to browse.",
  liveActiveMobile_other: "{{count}} active campaigns — swipe or tap to browse.",
  liveActiveDesktop_one: "{{count}} active campaign — J/K browse, N new campaign.",
  liveActiveDesktop_other: "{{count}} active campaigns — J/K browse, N new campaign.",
  livePlannedMobile_one: "{{count}} campaign planned — tap New campaign.",
  livePlannedMobile_other: "{{count}} campaigns planned — tap New campaign.",
  livePlannedDesktop_one: "{{count}} campaign planned — press N for new.",
  livePlannedDesktop_other: "{{count}} campaigns planned — press N for new.",
});

Object.assign(pagesSv.ecommerce, {
  step1: "Koppla Shopify under Kopplingar",
  step2: "Synka produkter och följ ordrar under Översikt",
  step3: "Importera från Alibaba eller hantera katalogen under Produkter",
  tip: "Dagliga automationer synkar ordrar och lager. Ordrar som väntar på leverans markeras i åtgärdsraden.",
  liveActions_one: "{{count}} åtgärd väntar — ordrar eller lågt lager",
  liveActions_other: "{{count}} åtgärder väntar — ordrar eller lågt lager",
  liveOk: "Inga brådskande e-handelsåtgärder just nu.",
});
Object.assign(pagesEn.ecommerce, {
  step1: "Connect Shopify under Connections",
  step2: "Sync products and track orders under Overview",
  step3: "Import from Alibaba or manage the catalog under Products",
  tip: "Daily automations sync orders and inventory. Orders waiting for fulfillment are marked in the action row.",
  liveActions_one: "{{count}} action waiting — orders or low stock",
  liveActions_other: "{{count}} actions waiting — orders or low stock",
  liveOk: "No urgent e-commerce actions right now.",
});

Object.assign(pagesSv.activity, {
  step1: "Filtrera på modul eller allvarlighetsgrad för att hitta rätt händelse",
  step2: "Välj en rad i listan för att läsa detaljer och metadata",
  step3: "Använd loggen när något ser fel ut eller du behöver spåra vem som gjorde vad",
  stepMobile1: "Filtrera på modul eller allvarlighetsgrad",
  stepMobile2: "Tryck en rad för detaljer",
  stepMobile3: "Använd loggen när något ser fel ut",
  tip: "Genvägar: J/K bläddra · / sök · E fel · W varning · Esc stäng.",
  tipMobile: "Här syns vad automationer och synk gjorde — använd filtrer när något ser konstigt ut.",
  liveErrors: "{{count}} fel i loggen — börja där",
  liveWarnings: "{{count}} varningar att granska",
  pickProfile: "Välj en affärsprofil för att se aktivitetsflödet.",
  tabsAria: "Allvarlighetsflikar",
  tabError: "Fel",
  tabWarning: "Varningar",
  tabAll: "Alla",
  tabSuccess: "Lyckades",
  tabInfo: "Info",
  refresh: "Uppdatera",
});
Object.assign(pagesEn.activity, {
  step1: "Filter by module or severity to find the right event",
  step2: "Select a row to read details and metadata",
  step3: "Use the log when something looks wrong or you need to trace who did what",
  stepMobile1: "Filter by module or severity",
  stepMobile2: "Tap a row for details",
  stepMobile3: "Use the log when something looks wrong",
  tip: "Shortcuts: J/K browse · / search · E errors · W warnings · Esc close.",
  tipMobile: "Here you see what automations and sync did — use filters when something looks odd.",
  liveErrors: "{{count}} errors in the log — start there",
  liveWarnings: "{{count}} warnings to review",
  pickProfile: "Pick a business profile to see the activity feed.",
  tabsAria: "Severity tabs",
  tabError: "Errors",
  tabWarning: "Warnings",
  tabAll: "All",
  tabSuccess: "Succeeded",
  tabInfo: "Info",
  refresh: "Refresh",
});

Object.assign(pagesSv.automations, {
  step1: "Se status för varje jobb — senaste körning och nästa schemalagda tid",
  step2: "Justera schema (dagar, tider) efter hur din verksamhet jobbar",
  step3: "Följ länken ”Se resultatet” för att se vad jobbet faktiskt gjorde",
  tipFailed: "Misslyckade körningar kan oftast köras om direkt från jobbkortet.",
  tipOk: "Här körs digests, snapshots, AI-jobb och synk på schema — så du slipper manuellt underhåll.",
  liveFailed: "{{count}} jobb misslyckades vid senaste körning — kör om från listan eller jobbkortet.",
  liveNever: "{{count}} jobb har ännu ingen körningshistorik — kontrollera att schemat är aktiverat.",
  actionFailed: "{{count}} misslyckade — granska",
  aiStrip: "AI underhållsförslag",
  retryOk: "\"{{title}}\" kördes om.",
  retryFail: "Kunde inte köra om automationen.",
});
Object.assign(pagesEn.automations, {
  step1: "See status for each job — last run and next scheduled time",
  step2: "Adjust the schedule (days, times) to how your business works",
  step3: "Follow the “See the result” link to see what the job actually did",
  tipFailed: "Failed runs can usually be retried directly from the job card.",
  tipOk: "Digests, snapshots, AI jobs and sync run on a schedule here — so you skip manual upkeep.",
  liveFailed: "{{count}} jobs failed on the last run — retry from the list or job card.",
  liveNever: "{{count}} jobs have no run history yet — check that the schedule is enabled.",
  actionFailed: "{{count}} failed — review",
  aiStrip: "AI maintenance suggestions",
  retryOk: "\"{{title}}\" was rerun.",
  retryFail: "Could not rerun the automation.",
});

Object.assign(pagesSv.intelligence, {
  step1: "Kontrollera att leverantörerna är gröna under Kopplingar → MCP",
  step2: "Välj flik för status, jämförelse eller frågekategori",
  step3: "Använd svaren i Försäljning, Innehåll eller automationer",
  tip: "Saknas en nyckel? Lägg till den under Inställningar → API-nycklar.",
});
Object.assign(pagesEn.intelligence, {
  step1: "Check that providers are green under Connections → MCP",
  step2: "Pick a tab for status, compare or a query category",
  step3: "Use the answers in Sales, Content or automations",
  tip: "Missing a key? Add it under Preferences → API keys.",
});

Object.assign(pagesSv.calendar, {
  step1: "Koppla Google eller Outlook-kalender för synk",
  step2: "Växla dag/vecka/månad och öppna en dag för detaljer",
  step3: "Skapa egna händelser eller följ upp från Uppgifter och Sales",
  tip: "Uppgifter och leads med datum syns automatiskt i vyn.",
  liveDue_one: "{{count}} uppgift eller lead förfaller idag — lägg till i kalendern",
  liveDue_other: "{{count}} uppgifter eller leads förfaller idag — lägg till i kalendern",
});
Object.assign(pagesEn.calendar, {
  step1: "Connect Google or Outlook calendar for sync",
  step2: "Switch day/week/month and open a day for details",
  step3: "Create your own events or follow up from Tasks and Sales",
  tip: "Tasks and leads with dates show automatically in the view.",
  liveDue_one: "{{count}} task or lead is due today — add it to the calendar",
  liveDue_other: "{{count}} tasks or leads are due today — add them to the calendar",
});

Object.assign(pagesSv.company, {
  step1: "Fyll i automatiskt med org.nr eller börja manuellt",
  step2: "Komplettera beskrivning och målgrupp — det påverkar AI mest",
  step3: "Spara så att Sales och Content får bättre förslag direkt",
  tip: "Börja med beskrivning (vad ni säljer och till vem), sedan webb och org.nr. Org.nr kan fyllas i automatiskt via uppslag.",
  liveIncomplete: "Profilen är {{percent}}% klar — saknas: {{missing}}",
  liveComplete: "Profilen ser komplett ut — AI kan ge full träffsäkerhet.",
});
Object.assign(pagesEn.company, {
  step1: "Auto-fill with org number or start manually",
  step2: "Complete description and audience — that affects AI most",
  step3: "Save so Sales and Content get better suggestions right away",
  tip: "Start with description (what you sell and to whom), then website and org number. Org number can auto-fill via lookup.",
  liveIncomplete: "Profile is {{percent}}% complete — missing: {{missing}}",
  liveComplete: "Profile looks complete — AI can hit full accuracy.",
});

Object.assign(pagesSv.aiRecommendations, {
  step1: "Klicka Generera för att köra heuristik + AI på kopplingar, uppgifter och innehåll",
  step2: "Acceptera för att navigera till rätt sida, eller avvisa det som inte passar",
  step3: "Granska accepterade och avvisade under flikarna för historik",
  tip: "Nya förslag markeras automatiskt som sedda när du öppnar sidan.",
  liveNew_one: "{{count}} ny rekommendation att granska",
  liveNew_other: "{{count}} nya rekommendationer att granska",
  liveActive_one: "{{count}} aktivt förslag — acceptera eller avvisa",
  liveActive_other: "{{count}} aktiva förslag — acceptera eller avvisa",
});
Object.assign(pagesEn.aiRecommendations, {
  step1: "Click Generate to run heuristics + AI on connections, tasks and content",
  step2: "Accept to navigate to the right page, or dismiss what doesn’t fit",
  step3: "Review accepted and dismissed under the tabs for history",
  tip: "New suggestions are automatically marked as seen when you open the page.",
  liveNew_one: "{{count}} new recommendation to review",
  liveNew_other: "{{count}} new recommendations to review",
  liveActive_one: "{{count}} active suggestion — accept or dismiss",
  liveActive_other: "{{count}} active suggestions — accept or dismiss",
});

fs.writeFileSync("src/locales/sv/pages.json", JSON.stringify(pagesSv, null, 2) + "\n");
fs.writeFileSync("src/locales/en/pages.json", JSON.stringify(pagesEn, null, 2) + "\n");

const dailyBriefSv = {
  caughtUp: {
    headline: "Du är ikapp",
    subline: "Inget behöver din uppmärksamhet just nu — bra jobbat.",
  },
  focus: {
    headline: "Fokusera här först",
    subline: "{{count}} sak behöver dig",
    subline_other: "{{count}} saker behöver dig",
  },
  signals: {
    connections_one: "1 koppling behöver uppmärksamhet",
    connections_other: "{{count}} kopplingar behöver uppmärksamhet",
    connectionsCritical: "Kritiska kopplingar: {{names}}. Åtgärda under Kopplingar.",
    connectionsWarn: "Varningar: {{names}}. Kolla under Kopplingar.",
    messagesTriage: "Meddelanden i triage",
    messagesOpen: "Öppna meddelanden",
    messagesTriageDesc: "{{count}} i kön — börja med öppna.",
    messagesOpenDesc: "{{count}} öppna — svara under Meddelanden.",
    leads_one: "1 lead att följa upp",
    leads_other: "{{count}} leads att följa upp",
    leadsDesc: "Försenade eller due idag — öppna Sales → uppföljningar.",
    outreach_one: "1 outreach-utkast i kön",
    outreach_other: "{{count}} outreach-utkast i kön",
    outreachDesc: "Automatisk uppföljningstext väntar — granska och skicka under Sales.",
    dmDrafts_one: "1 DM-utkast att godkänna",
    dmDrafts_other: "{{count}} DM-utkast att godkänna",
    dmDraftsDesc: "Auto-svar i utkastläge — granska och skicka under Meddelanden.",
    roasUnderwater: "Annonser under vatten (ROAS {{roas}}×)",
    roasUnderwaterDesc: "Intäkt under annonskostnad senaste 7 dagarna — granska kampanjerna under Marketing.",
    roasDown: "Annons-ROAS sjönk den här veckan",
    roasDownDesc: "Vecka-mot-vecka-avkastning är ner — kolla vad som ändrats under Marketing.",
    inventory_one: "1 produkt med lågt lager i aktiva annonser",
    inventory_other: "{{count}} produkter med lågt lager i aktiva annonser",
    inventoryDesc: "Aktiva annonser kan peka mot varor som behöver påfyllning.",
    automations_one: "1 automation misslyckades senast",
    automations_other: "{{count}} automationer misslyckades senast",
    automationsDesc: "{{names}} — granska och kör om under Automationer.",
    reviews_one: "1 recension behöver svar",
    reviews_other: "{{count}} recensioner behöver svar",
    reviewsDesc: "Svara på färsk kundfeedback medan den fortfarande är aktuell.",
    overdueTasks_one: "1 uppgift är försenad",
    overdueTasks_other: "{{count}} uppgifter är försenade",
    dueTodayTasks_one: "1 uppgift förfaller idag",
    dueTodayTasks_other: "{{count}} uppgifter förfaller idag",
    ai_one: "1 nytt AI-förslag",
    ai_other: "{{count}} nya AI-förslag",
    agents_one: "1 agentresultat att granska",
    agents_other: "{{count}} agentresultat att granska",
    taskList: "{{titles}}",
    taskListMore: "{{titles}} m.fl.",
  },
  quiet: {
    title: "Tyst morgon",
    body: "Inget brådskande just nu. Fortsätt där du slutade eller öppna något från listan.",
  },
  continue: {
    title: "Fortsätt där du slutade",
    empty: "Inga nyliga sidor ännu — öppna något från navigationen.",
  },
  connect: {
    title: "Koppla mer för bättre signaler",
    body: "Fler kopplingar ger tydligare morgonbrief.",
  },
  agentRun: "Agentkörning",
};

const dailyBriefEn = {
  caughtUp: {
    headline: "You’re caught up",
    subline: "Nothing needs your attention right now — nice work.",
  },
  focus: {
    headline: "Focus here first",
    subline: "{{count}} thing needs you",
    subline_other: "{{count}} things need you",
  },
  signals: {
    connections_one: "1 connection needs attention",
    connections_other: "{{count}} connections need attention",
    connectionsCritical: "Critical connections: {{names}}. Fix under Connections.",
    connectionsWarn: "Warnings: {{names}}. Check under Connections.",
    messagesTriage: "Messages in triage",
    messagesOpen: "Open messages",
    messagesTriageDesc: "{{count}} in the queue — start with open ones.",
    messagesOpenDesc: "{{count}} open — reply under Messages.",
    leads_one: "1 lead to follow up",
    leads_other: "{{count}} leads to follow up",
    leadsDesc: "Overdue or due today — open Sales → follow-ups.",
    outreach_one: "1 outreach draft in the queue",
    outreach_other: "{{count}} outreach drafts in the queue",
    outreachDesc: "Automatic follow-up text is waiting — review and send under Sales.",
    dmDrafts_one: "1 DM draft to approve",
    dmDrafts_other: "{{count}} DM drafts to approve",
    dmDraftsDesc: "Auto-replies in draft mode — review and send under Messages.",
    roasUnderwater: "Ads underwater (ROAS {{roas}}×)",
    roasUnderwaterDesc: "Revenue below ad spend last 7 days — review campaigns under Marketing.",
    roasDown: "Ad ROAS dropped this week",
    roasDownDesc: "Week-over-week return is down — check what changed under Marketing.",
    inventory_one: "1 low-stock product in active ads",
    inventory_other: "{{count}} low-stock products in active ads",
    inventoryDesc: "Active ads may point at items that need restocking.",
    automations_one: "1 automation failed last run",
    automations_other: "{{count}} automations failed last run",
    automationsDesc: "{{names}} — review and retry under Automations.",
    reviews_one: "1 review needs a reply",
    reviews_other: "{{count}} reviews need a reply",
    reviewsDesc: "Reply to fresh customer feedback while it’s still timely.",
    overdueTasks_one: "1 task is overdue",
    overdueTasks_other: "{{count}} tasks are overdue",
    dueTodayTasks_one: "1 task is due today",
    dueTodayTasks_other: "{{count}} tasks are due today",
    ai_one: "1 new AI suggestion",
    ai_other: "{{count}} new AI suggestions",
    agents_one: "1 agent result to review",
    agents_other: "{{count}} agent results to review",
    taskList: "{{titles}}",
    taskListMore: "{{titles}} and more",
  },
  quiet: {
    title: "Quiet morning",
    body: "Nothing urgent right now. Continue where you left off or open something from the list.",
  },
  continue: {
    title: "Continue where you left off",
    empty: "No recent pages yet — open something from the navigation.",
  },
  connect: {
    title: "Connect more for better signals",
    body: "More connections make the morning brief clearer.",
  },
  agentRun: "Agent run",
};

const leadsSv = {
  status: {
    new: "Ny",
    contacted: "Kontaktad",
    qualified: "Kvalificerad",
    won: "Vunnen",
    lost: "Förlorad",
  },
  section: {
    title: "Leads",
    description: "Följ upp leads, sätt nästa datum och skapa outreach från samma lista.",
    search: "Sök leads",
    add: "Lägg till lead",
    import: "Importera CSV",
    export: "Exportera CSV",
    emptyTitle: "Inga leads än",
    emptyDesc: "Lägg till manuellt, importera CSV eller låt AI föreslå bolag från din profil.",
    emptyTrust: "Leads sparas i din affärsprofil — du styr uppföljning och outreach.",
    emptyCta: "Lägg till första lead",
    noContact: "Inga kontaktuppgifter än",
    dueToday: "Idag",
    overdue: "Försenad",
  },
  toast: {
    importEmpty: "Inga leads hittades i filen. Förväntar en rubrikrad med kolumn för företag.",
    importOk_one: "Importerade {{count}} lead",
    importOk_other: "Importerade {{count}} leads",
    importSkipped: " ({{skipped}} hoppades över)",
    importFail: "Kunde inte importera filen.",
    noData: "Ingen data hittades.",
    enrichOk: "Ifyllt från uppslag",
    enrichSources_one: "Hämtade från {{count}} källa",
    enrichSources_other: "Hämtade från {{count}} källor",
    enrichFail: "Uppslag misslyckades.",
    added: "Lead tillagd",
    addFail: "Kunde inte lägga till lead.",
    noSuggestions: "Inga förslag — försök igen eller fyll i mer under Företag.",
    suggestionsFail: "Kunde inte hämta förslag.",
    followUpAuto: "Uppföljningsdatum sattes automatiskt.",
    updateFail: "Kunde inte uppdatera lead.",
    suggestionAdded: "Tillagd som lead",
  },
};

const leadsEn = {
  status: {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    won: "Won",
    lost: "Lost",
  },
  section: {
    title: "Leads",
    description: "Follow up leads, set the next date and create outreach from the same list.",
    search: "Search leads",
    add: "Add lead",
    import: "Import CSV",
    export: "Export CSV",
    emptyTitle: "No leads yet",
    emptyDesc: "Add manually, import CSV or let AI suggest companies from your profile.",
    emptyTrust: "Leads are saved in your business profile — you control follow-up and outreach.",
    emptyCta: "Add first lead",
    noContact: "No contact details yet",
    dueToday: "Today",
    overdue: "Overdue",
  },
  toast: {
    importEmpty: "No leads found in the file. Expect a header row with a company column.",
    importOk_one: "Imported {{count}} lead",
    importOk_other: "Imported {{count}} leads",
    importSkipped: " ({{skipped}} skipped)",
    importFail: "Could not import the file.",
    noData: "No data found.",
    enrichOk: "Filled from lookup",
    enrichSources_one: "Fetched from {{count}} source",
    enrichSources_other: "Fetched from {{count}} sources",
    enrichFail: "Lookup failed.",
    added: "Lead added",
    addFail: "Could not add lead.",
    noSuggestions: "No suggestions — try again or fill in more under Company.",
    suggestionsFail: "Could not fetch suggestions.",
    followUpAuto: "Follow-up date was set automatically.",
    updateFail: "Could not update lead.",
    suggestionAdded: "Added as lead",
  },
};

const outreachSv = {
  queue: {
    title: "Outreach-kö",
    emptyTitle: "Kön är tom",
    emptyDesc: "När automationen skapar uppföljningsutkast landar de här för granskning.",
    search: "Sök outreach-utkast",
    panelEmpty: "Välj ett utkast i listan.",
  },
  draft: {
    title: "Outreach-utkast",
    send: "Skicka till kön",
    cancel: "Avbryt",
  },
  toast: {
    draftFail: "Kunde inte skapa utkast.",
    loadFail: "Kunde inte ladda outreach.",
  },
};

const outreachEn = {
  queue: {
    title: "Outreach queue",
    emptyTitle: "Queue is empty",
    emptyDesc: "When automation creates follow-up drafts they land here for review.",
    search: "Search outreach drafts",
    panelEmpty: "Pick a draft in the list.",
  },
  draft: {
    title: "Outreach draft",
    send: "Send to queue",
    cancel: "Cancel",
  },
  toast: {
    draftFail: "Could not create draft.",
    loadFail: "Could not load outreach.",
  },
};

for (const [ns, sv, en] of [
  ["dailyBrief", dailyBriefSv, dailyBriefEn],
  ["leads", leadsSv, leadsEn],
  ["outreach", outreachSv, outreachEn],
]) {
  fs.writeFileSync(`src/locales/sv/${ns}.json`, JSON.stringify(sv, null, 2) + "\n");
  fs.writeFileSync(`src/locales/en/${ns}.json`, JSON.stringify(en, null, 2) + "\n");
}

console.log("Updated pages + wrote dailyBrief, leads, outreach");
