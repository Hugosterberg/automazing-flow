import { m } from "framer-motion";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { BarChart3, CalendarDays, FileText, Heart, Sparkles, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import type { CalendarEvent } from "@/types/calendar";

const SOCIAL_AUTOMATIONS_STORAGE_KEY = "automazing-social-workflows";
const CALENDAR_STORAGE_KEY = "automazing-calendar-events";

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
  { title: "1. Research", tasks: ["Trendspaning", "Målgruppsanalys", "Innehållsvinklar"] },
  { title: "2. Produktion", tasks: ["Skapa masterinnehåll", "AI-copy", "Bild-/videovarianter"] },
  { title: "3. Distribution", tasks: ["Plattformsanpassning", "Schemaläggning", "Automatisk publicering"] },
  { title: "4. Uppföljning", tasks: ["Engagemangssvar", "Lead-tagging", "Veckorapport"] },
];

const initialAutomationState = automationWorkflows.reduce<Record<string, boolean>>((acc, workflow) => {
  acc[workflow.id] = false;
  return acc;
}, {});

function loadAutomationState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SOCIAL_AUTOMATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
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

export function SocialAutomationPanel() {
  const [enabledAutomations, setEnabledAutomations] = useState<Record<string, boolean>>(() => ({
    ...initialAutomationState,
    ...loadAutomationState(),
  }));

  const activeAutomations = automationWorkflows.filter((workflow) => enabledAutomations[workflow.id]);

  useEffect(() => {
    localStorage.setItem(SOCIAL_AUTOMATIONS_STORAGE_KEY, JSON.stringify(enabledAutomations));
  }, [enabledAutomations]);

  function handleToggleAutomation(workflowId: string, checked: boolean) {
    setEnabledAutomations((prev) => ({ ...prev, [workflowId]: checked }));
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
    <>
      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
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
                  <div key={workflow.id} className="rounded-lg border border-border/60 bg-secondary/30 p-4 space-y-3">
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
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.45 }}>
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
      </m.div>
    </>
  );
}
