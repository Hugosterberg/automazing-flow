import { useMemo, useState } from "react";
import { m } from "framer-motion";
import { Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { buildConnectUrl } from "@/features/connections";
import { getConnectConfig } from "@/features/connections/connectAuthPath";
import { useTasks } from "@/features/tasks";
import type { TaskStatus } from "@/features/tasks/tasksService";
import { pageFadeUp } from "@/lib/motion";

const MARKETING_PLATFORMS = [
  { platform: "google_ads" as const, label: "Google Ads" },
  { platform: "meta_business" as const, label: "Meta Business" },
];

export default function MarketingPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const { activeProfileId, accounts } = useAccounts();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { tasks, createTask, updateTask, deleteTask, isDeleting } = useTasks(businessProfileId);

  const campaignTasks = useMemo(
    () => tasks.filter((t) => t.module === "campaign" && t.status !== "archived"),
    [tasks]
  );

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignAdding, setCampaignAdding] = useState(false);

  function connect(platform: "google_ads" | "meta_business") {
    if (!businessProfileId) return;
    const config = getConnectConfig(platform);
    if (!config) return;
    window.location.href = buildConnectUrl(config.authPath, businessProfileId, {
      provider: config.provider,
    });
  }

  async function addCampaign() {
    if (!campaignTitle.trim()) return;
    setCampaignAdding(true);
    try {
      await createTask({
        title: campaignTitle.trim(),
        description: campaignDesc.trim() || null,
        priority: "medium",
        status: "open",
        module: "campaign",
      });
      setCampaignOpen(false);
      setCampaignTitle("");
      setCampaignDesc("");
    } finally {
      setCampaignAdding(false);
    }
  }

  async function moveTask(id: string, status: TaskStatus) {
    await updateTask({ id, patch: { status } });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        icon={Megaphone}
        title="Marketing"
        description="Kampanjer, annonskanaler och marknadsföringsflöden."
      />

      <m.div {...pageFadeUp}>
        <SectionConnectionStatus area="marketing" />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.04 }} className="grid gap-3 sm:grid-cols-2">
        {MARKETING_PLATFORMS.map((item) => {
          const connected = accounts.some((account) => account.platform === item.platform);
          return (
            <Card key={item.platform} className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.label}</CardTitle>
                <CardDescription>
                  {connected ? "Connected for this profile." : "Connect to bring campaign data into Marketing."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  size="sm"
                  variant={connected ? "outline" : "default"}
                  onClick={() => connect(item.platform)}
                  disabled={!businessProfileId}
                >
                  {connected ? "Reconnect" : "Connect"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </m.div>

      <m.section {...pageFadeUp} transition={{ delay: 0.08 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Kampanjer</h2>
            <p className="text-xs text-muted-foreground">Koordinera marknadsföringskampanjer och idéer.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCampaignOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ny kampanj
          </Button>
        </div>

        {campaignTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Inga kampanjer ännu</p>
              <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setCampaignOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Ny kampanj
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaignTasks.map((task) => (
              <Card key={task.id} className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">{task.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-4 space-y-2">
                  {task.description && (
                    <CardDescription className="text-xs line-clamp-2">{task.description}</CardDescription>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Select value={task.status} onValueChange={(v) => void moveTask(task.id, v as TaskStatus)}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Planerad</SelectItem>
                        <SelectItem value="in_progress">Aktiv</SelectItem>
                        <SelectItem value="blocked">Pausad</SelectItem>
                        <SelectItem value="done">Avslutad</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => void deleteTask(task.id)}
                      disabled={isDeleting}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Ta bort kampanj"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </m.section>

      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ny kampanj</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-title">Kampanjnamn</Label>
              <Input id="campaign-title" value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-desc">Beskrivning</Label>
              <Textarea id="campaign-desc" value={campaignDesc} onChange={(e) => setCampaignDesc(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>Avbryt</Button>
            <Button onClick={() => void addCampaign()} disabled={campaignAdding || !campaignTitle.trim()}>
              {campaignAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Skapa kampanj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
