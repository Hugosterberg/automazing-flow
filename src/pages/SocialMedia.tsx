import { motion } from "framer-motion";
import {
  Users,
  FileText,
  Sparkles,
  Clock,
  Heart,
  Eye,
  BarChart3,
  Target,
  ImagePlus,
  Loader2,
  Zap,
  CalendarDays,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { useEffect, useRef, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { InstagramIcon, TikTokIcon, YoutubeIcon } from "@/components/platform-icons";
import type { SocialPlatform } from "@/types/accounts";
import type { CalendarEvent } from "@/types/calendar";

const platformIcons: Record<SocialPlatform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
};

const SOCIAL_AUTOMATIONS_STORAGE_KEY = "automazing-social-workflows";
const CALENDAR_STORAGE_KEY = "automazing-calendar-events";

const stats = [
  { label: "Followers", value: "12,847", change: "+3.2%", icon: Users },
  { label: "Engagement", value: "8.4%", change: "+1.1%", icon: Heart },
  { label: "Inlägg denna vecka", value: "14", change: "+5", icon: FileText },
  { label: "Visningar", value: "48.2K", change: "+12%", icon: Eye },
];

const scheduledPosts = [
  { title: "Produktlansering – Instagram", time: "Idag 14:00", platform: "Instagram" },
  { title: "Tips & tricks video", time: "Imorgon 09:00", platform: "TikTok" },
  { title: "Veckosammanfattning", time: "Fre 18:00", platform: "LinkedIn" },
];

const contentIdeas = [
  "Bakom kulisserna – visa er arbetsprocess",
  "Kundrecension i karusellformat",
  "5 tips inom er bransch (Reels)",
  "Före/efter transformation",
  "Frågestund med era följare",
];

interface AutomationWorkflow {
  id: string;
  title: string;
  summary: string;
  cadence: string;
  value: string;
  steps: string[];
  icon: LucideIcon;
}

const automationWorkflows: AutomationWorkflow[] = [
  {
    id: "repurpose-weekly-hero",
    title: "Repurpose av veckans huvudinnehåll",
    summary: "Ett långt video- eller blogginnehåll delas upp till flera kanaler med AI-kopior.",
    cadence: "2 ggr/vecka",
    value: "Sparar tid i produktion",
    steps: [
      "Identifiera veckans huvudinnehåll",
      "Generera 3 kortformat (Reels/TikTok/Shorts)",
      "Skapa plattformsanpassad copy",
    ],
    icon: FileText,
  },
  {
    id: "caption-hashtag-optimizer",
    title: "Caption + hashtag-optimering",
    summary: "AI skapar caption-varianter och hashtag-paket beroende på mål (reach, leads, community).",
    cadence: "Varje publicering",
    value: "Högre organisk räckvidd",
    steps: [
      "Analysera format och målgrupp",
      "Skapa 3 caption-varianter i olika tonalitet",
      "Lägg till relevanta hashtags per kanal",
    ],
    icon: Sparkles,
  },
  {
    id: "engagement-followup",
    title: "Engagement-följdflöde",
    summary: "Kritiska kommentarer och frågor fångas upp och fördelas till snabba svarsmallar.",
    cadence: "Dagligen",
    value: "Ökar svarsfrekvens",
    steps: [
      "Filtrera kommentarer med köpintention eller frågor",
      "Skicka notifiering och svarsförslag",
      "Tagga heta leads för uppföljning",
    ],
    icon: Heart,
  },
  {
    id: "weekly-insight-digest",
    title: "Veckovis insiktsrapport",
    summary: "Automatisk sammanställning av vad som fungerade bäst och vad som ska testas nästa vecka.",
    cadence: "1 gång/vecka",
    value: "Datadrivna beslut snabbare",
    steps: [
      "Hämta toppinlägg per kanal",
      "Sammanfatta engagemangsmönster",
      "Generera 3 nya testidéer för veckan",
    ],
    icon: BarChart3,
  },
];

const pipelineStages = [
  {
    title: "1. Research",
    tasks: ["Trendspaning", "Målgruppsanalys", "Innehållsvinklar"],
  },
  {
    title: "2. Produktion",
    tasks: ["Skapa masterinnehåll", "AI-copy", "Bild-/videovarianter"],
  },
  {
    title: "3. Distribution",
    tasks: ["Plattformsanpassning", "Schemaläggning", "Automatisk publicering"],
  },
  {
    title: "4. Uppföljning",
    tasks: ["Engagemangssvar", "Lead-tagging", "Veckorapport"],
  },
];

const initialAutomationState = automationWorkflows.reduce<Record<string, boolean>>((acc, workflow) => {
  acc[workflow.id] = false;
  return acc;
}, {});

function loadAutomationState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SOCIAL_AUTOMATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatDateForCalendar(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildAutomationEvents(activeWorkflows: AutomationWorkflow[]): CalendarEvent[] {
  const now = new Date();
  const timeSlots = ["09:00", "11:00", "14:00", "16:00", "18:00"];
  return activeWorkflows.map((workflow, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index + 1);
    return {
      id: crypto.randomUUID(),
      title: `Auto: ${workflow.title}`,
      date: formatDateForCalendar(date),
      time: timeSlots[index % timeSlots.length],
      isAutomated: true,
      description: workflow.summary,
      createdAt: new Date().toISOString(),
    };
  });
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

// AI-analys – hämtar live-data om OAuth-konto, annars simulerad
async function analyzeAccount(
  accountId?: string
): Promise<{ story: string; purpose: string; targetAudience: string; contentThemes: string[] }> {
  let profileData: { media?: { caption?: string }[]; profile?: Record<string, unknown> } = {};

  if (accountId) {
    try {
      const res = await fetch(`/api/accounts/${accountId}/data`);
      if (res.ok) {
        const data = await res.json();
        profileData = { media: data.media || data.videos || [], profile: data.profile };
      }
    } catch {
      // Fallback till simulerad analys
    }
  }

  await new Promise((r) => setTimeout(r, accountId ? 1500 : 2000));

  // Om vi har riktiga media – extrahera teman från captions/titles (förenklad)
  const mediaItems = profileData.media || [];
  const captions = mediaItems.map((m) => m.caption || m.snippet?.title || m.snippet?.description || "").filter(Boolean);
  const hasRealData = captions.length > 0;

  const themesFromData = hasRealData
    ? Array.from(new Set(captions.flatMap((c) => (typeof c === "string" ? c.match(/#\w+/g) : []) || [])))
        .slice(0, 5)
        .map((t) => String(t).replace("#", ""))
    : [];

  return {
    story: hasRealData
      ? `Baserat på dina ${profileData.media?.length || 0} senaste inlägg: Kontot delar en konsekvent story genom visuellt innehåll. Tema och ton speglar din profil.`
      : "Kontot berättar en historia om transformation och autentisk livsstil. Innehållet fokuserar på före/efter-moment, tips och insikter som inspirerar följare att ta kontroll över sin vardag.",
    purpose: hasRealData
      ? "Profilen fungerar som en central plats för ditt innehåll. Baserat på dina senaste inlägg bygger du engagemang och community."
      : "Att inspirera och bygga community kring personlig utveckling. Kontot fungerar som en hub för motivation, produkttips och engagerande visuellt innehåll.",
    targetAudience: "Unga vuxna 25–35 år, intresserade av livsstil, wellness och visuellt innehåll.",
    contentThemes:
      themesFromData.length > 0
        ? themesFromData
        : ["Före/efter", "Dagliga tips", "Produktrecensioner", "Bakom kulisserna", "Community"],
  };
}

// Simulerad bildvariant-generering
async function generateImageVariants(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 2500));
  return [
    "https://picsum.photos/seed/v1/400/400",
    "https://picsum.photos/seed/v2/400/400",
    "https://picsum.photos/seed/v3/400/400",
    "https://picsum.photos/seed/v4/400/400",
  ];
}

export default function SocialMedia() {
  const [postContent, setPostContent] = useState("");
  const { accounts, selectedAccountId, setSelectedAccountId, updateAccountAnalysis } = useAccounts();
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [enabledAutomations, setEnabledAutomations] = useState<Record<string, boolean>>(() => ({
    ...initialAutomationState,
    ...loadAutomationState(),
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const activeAutomations = automationWorkflows.filter((workflow) => enabledAutomations[workflow.id]);

  const { oauthError, clearOauthError } = useOAuthCallback();

  useEffect(() => {
    localStorage.setItem(SOCIAL_AUTOMATIONS_STORAGE_KEY, JSON.stringify(enabledAutomations));
  }, [enabledAutomations]);

  async function handleAnalyze() {
    if (!selectedAccount) return;
    setAnalyzing(true);
    try {
      const result = await analyzeAccount(selectedAccount.isOAuth ? selectedAccount.id : undefined);
      updateAccountAnalysis(selectedAccount.id, {
        ...result,
        analyzedAt: new Date().toISOString(),
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
      setVariants([]);
    }
    e.target.value = "";
  }

  async function handleGenerateVariants() {
    if (!uploadedImage) return;
    setGeneratingVariants(true);
    setVariants([]);
    try {
      const urls = await generateImageVariants();
      setVariants(urls);
    } finally {
      setGeneratingVariants(false);
    }
  }

  function handleToggleAutomation(workflowId: string, checked: boolean) {
    setEnabledAutomations((prev) => ({
      ...prev,
      [workflowId]: checked,
    }));
  }

  function handleCreateAutomationWeekPlan() {
    if (activeAutomations.length === 0) {
      toast({
        title: "Aktivera minst ett automationsflöde",
        description: "Välj ett eller flera flöden ovan för att skapa en veckoplan.",
      });
      return;
    }

    try {
      const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const existingEvents: CalendarEvent[] = Array.isArray(parsed) ? parsed : [];
      const newEvents = buildAutomationEvents(activeAutomations);

      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify([...existingEvents, ...newEvents]));

      toast({
        title: "Veckoplan skapad",
        description: `${newEvents.length} automatiserade aktiviteter lades till i kalendern.`,
      });
    } catch {
      toast({
        title: "Kunde inte skapa veckoplan",
        description: "Kontrollera lokal lagring och försök igen.",
      });
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Social Media</h1>
        <p className="text-muted-foreground mt-1">Automatisera och hantera dina sociala medier</p>
      </motion.div>

      {/* OAuth-fel */}
      {oauthError && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-4 flex items-center justify-between">
              <p className="text-sm text-destructive">
                Inloggningen misslyckades: {oauthError.replace(/_/g, " ")}
              </p>
              <Button variant="ghost" size="sm" onClick={clearOauthError}>
                Stäng
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Välj konto + Kontohantering */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
        {selectedAccount ? (
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = platformIcons[selectedAccount.platform];
                    return (
                      <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                        <Icon className="h-5 w-5" />
                      </div>
                    );
                  })()}
                  <div>
                    <CardTitle className="text-lg">{selectedAccount.username}</CardTitle>
                    <CardDescription>
                      Välj ett konto i sidofältet för att analysera. Klicka här för att avmarkera.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAccountId(null)}
                >
                  Avmarkera
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedAccount.analysis ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
                    <h4 className="flex items-center gap-2 font-medium text-sm">
                      <BarChart3 className="h-4 w-4" />
                      Kontots story
                    </h4>
                    <p className="text-sm text-muted-foreground">{selectedAccount.analysis.story}</p>
                  </div>
                  <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
                    <h4 className="flex items-center gap-2 font-medium text-sm">
                      <Target className="h-4 w-4" />
                      Syfte
                    </h4>
                    <p className="text-sm text-muted-foreground">{selectedAccount.analysis.purpose}</p>
                  </div>
                  {selectedAccount.analysis.targetAudience && (
                    <div className="md:col-span-2 space-y-2 rounded-lg bg-secondary/50 p-4">
                      <h4 className="font-medium text-sm">Målgrupp</h4>
                      <p className="text-sm text-muted-foreground">{selectedAccount.analysis.targetAudience}</p>
                    </div>
                  )}
                  {selectedAccount.analysis.contentThemes && selectedAccount.analysis.contentThemes.length > 0 && (
                    <div className="md:col-span-2 space-y-2 rounded-lg bg-secondary/50 p-4">
                      <h4 className="font-medium text-sm">Innehållsteman</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedAccount.analysis.contentThemes.map((theme) => (
                          <span
                            key={theme}
                            className="px-2 py-1 rounded-md bg-accent text-xs"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="glow-sm"
                  >
                    {analyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {analyzing ? "Analyserar..." : "Analysera konto (AI)"}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    AI analyserar kontots innehåll och beskriver story och syfte.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border glow-border border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-2">
                Välj ett konto i sidofältet (Anslutna konton) för att börja.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Anslut Instagram, TikTok eller YouTube via +-knappen i sidofältet.
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Bild till varianter */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5" />
              AI-bildvarianter
            </CardTitle>
            <CardDescription>
              Ladda upp en bild så genererar AI olika varianter och förslag
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="flex flex-wrap gap-4 items-start">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 rounded-lg border-2 border-dashed border-border hover:border-muted-foreground/50 hover:bg-secondary/50 cursor-pointer flex items-center justify-center transition-colors"
              >
                {uploadedImage ? (
                  <img
                    src={uploadedImage}
                    alt="Uploaded"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Button
                  onClick={handleGenerateVariants}
                  disabled={!uploadedImage || generatingVariants}
                  variant="outline"
                >
                  {generatingVariants ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generatingVariants ? "Genererar varianter..." : "Generera AI-varianter"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Klicka på rutan för att ladda upp, sedan generera.
                </p>
              </div>
            </div>
            {variants.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Förslag på varianter</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {variants.map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                    >
                      <img src={url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.08 }}>
            <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-green-400 font-medium">{stat.change}</span>
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Automation workflows */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5" />
                  Automationsflöden för social media
                </CardTitle>
                <CardDescription>
                  Aktivera flöden för att automatisera content-produktion, distribution och uppföljning.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">
                {activeAutomations.length} aktiva
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {automationWorkflows.map((workflow) => {
                const Icon = workflow.icon;
                const isEnabled = Boolean(enabledAutomations[workflow.id]);
                return (
                  <div
                    key={workflow.id}
                    className="rounded-lg border border-border/60 bg-secondary/30 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {workflow.title}
                        </h4>
                        <p className="text-xs text-muted-foreground">{workflow.summary}</p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleToggleAutomation(workflow.id, checked)}
                        aria-label={`Aktivera ${workflow.title}`}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] px-2 py-1 rounded-full bg-accent text-muted-foreground">
                        {workflow.cadence}
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-accent text-muted-foreground">
                        {workflow.value}
                      </span>
                    </div>

                    <ul className="space-y-1">
                      {workflow.steps.map((step) => (
                        <li key={step} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="mt-0.5">•</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-dashed border-border/80 bg-secondary/20 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Generera veckoplan till kalendern</p>
                <p className="text-xs text-muted-foreground">
                  Skapar automatiserade aktiviteter i kalendern baserat på aktiva flöden.
                </p>
              </div>
              <Button
                onClick={handleCreateAutomationWeekPlan}
                disabled={activeAutomations.length === 0}
                className="w-full sm:w-auto"
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                Skapa automationsvecka
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduler */}
        <motion.div className="lg:col-span-2" {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Schemalägg inlägg
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Skriv ditt inlägg här..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                className="bg-secondary border-border min-h-[100px] resize-none"
              />
              <div className="flex gap-3">
                <Input type="date" className="bg-secondary border-border w-auto" />
                <Input type="time" className="bg-secondary border-border w-auto" />
                <Button className="glow-sm hover:glow-md transition-shadow duration-300">
                  Schemalägg
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Content Ideas */}
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border glow-border h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Content-idéer
              </CardTitle>
              <CardDescription>AI-genererade förslag</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {contentIdeas.map((idea, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span className="text-muted-foreground/50 mt-0.5">→</span>
                    {idea}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Content pipeline */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.45 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" />
              Innehållspipeline att automatisera
            </CardTitle>
            <CardDescription>
              Ett enkelt ramverk för att automatisera hela content-flödet från idé till analys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pipelineStages.map((stage) => (
                <div key={stage.title} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <p className="text-sm font-medium mb-2">{stage.title}</p>
                  <ul className="space-y-1">
                    {stage.tasks.map((task) => (
                      <li key={task} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="mt-0.5">→</span>
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Scheduled Posts */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="text-lg">Schemalagda inlägg</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledPosts.map((post, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.time}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground">
                    {post.platform}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
