import { motion } from "framer-motion";
import { Zap, Megaphone, BriefcaseBusiness, CalendarDays, Mail, Settings, Info, Trash2 } from "lucide-react";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { ProfileList } from "@/components/ProfileList";
import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";

const areas = [
  {
    title: "Social Media",
    desc: "Schedule, analyze and automate your social channels",
    icon: Megaphone,
    url: "/social-media",
    ready: true,
  },
  {
    title: "Organization & Management",
    desc: "Operations, workflows and business management in one place",
    icon: BriefcaseBusiness,
    url: "/ecommerce",
    ready: true,
  },
  {
    title: "Calendar",
    desc: "Smart scheduling and automated reminders",
    icon: CalendarDays,
    url: "/calendar",
    ready: true,
  },
  {
    title: "Mail",
    desc: "Manage and automate your emails",
    icon: Mail,
    url: "/mail",
    ready: true,
  },
  {
    title: "AI Recommendations",
    desc: "AI-powered suggestions and recommendations",
    icon: LightbulbGlowIcon,
    url: "/ai-recommendations",
    ready: false,
  },
  {
    title: "Preferences",
    desc: "Settings, theme and security",
    icon: Settings,
    url: "/preferences",
    ready: false,
  },
];

export default function Index() {
  const navigate = useNavigate();
  const { activeProfile, profiles, accounts, removeProfile } = useAccounts();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const platformLabel: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    x: "X",
    facebook: "Facebook",
    google_business: "Google Business",
    whatsapp: "WhatsApp",
    shopify: "Shopify",
    gmail: "Gmail",
    outlook: "Outlook",
  };

  const profileSummary = useMemo(() => {
    const connectedCount = accounts.length;
    const grouped = accounts.reduce<Record<string, number>>((acc, account) => {
      acc[account.platform] = (acc[account.platform] || 0) + 1;
      return acc;
    }, {});
    const platformText = Object.entries(grouped)
      .map(([platform, count]) => `${platformLabel[platform] || platform} (${count})`)
      .join(", ");

    const withLoadedData = accounts.filter((a) => Boolean(a.stats || a.analysis)).length;
    const firstAnalysis = accounts.find(
      (a) => a.analysis?.about || a.analysis?.writes || a.analysis?.perception
    )?.analysis;
    const profileText =
      firstAnalysis?.about || firstAnalysis?.writes || firstAnalysis?.perception || "";

    return { connectedCount, platformText, withLoadedData, profileText };
  }, [accounts]);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-area-card]"));
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-change',hypothesisId:'A2',location:'Index:area-cards',message:'Home area card heights after equal-size layout',data:{count:cards.length,heights:cards.map((c)=>c.offsetHeight),titles:cards.map((c)=>c.getAttribute('data-area-title'))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-3xl space-y-6"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center glow-md">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          auto<span className="text-muted-foreground">mazing</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Automate your everyday tasks. One tool at a time.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-10"
      >
        <ProfileList />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-6 max-w-4xl w-full"
      >
        <Card className="bg-card border-white/60 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_34px_rgba(255,255,255,0.28)]">
          <CardContent className="relative p-5">
            {activeProfile && profiles.length > 1 && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="absolute right-5 top-5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                aria-label={`Delete profile ${activeProfile.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="flex flex-col items-center text-center space-y-2.5">
              <h2 className="text-xl font-semibold tracking-tight w-full">
                {activeProfile?.name || "Active profile"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {profileSummary.connectedCount} connected account
                {profileSummary.connectedCount === 1 ? "" : "s"}
                {profileSummary.platformText ? ` · ${profileSummary.platformText}` : ""}
              </p>
              <p className="text-xs text-muted-foreground/80">
                Loaded profile data from {profileSummary.withLoadedData} of {profileSummary.connectedCount} account
                {profileSummary.connectedCount === 1 ? "" : "s"}.
              </p>
              {profileSummary.profileText && (
                <p className="text-sm text-muted-foreground border-t border-border pt-2 max-w-2xl">
                  {profileSummary.profileText}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              You want to delete profile "{activeProfile?.name || ""}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It means the analysis of all connected accounts will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (activeProfile) removeProfile(activeProfile.id);
                setConfirmDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-14 max-w-4xl w-full">
        {areas.map((area, i) => (
          <motion.div
            key={area.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
            className="h-full"
          >
            <Card
              data-area-card
              data-area-title={area.title}
              onClick={() => navigate(area.url)}
              className="bg-card border-border glow-border hover:bg-white hover:border-white/90 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.75),0_0_44px_rgba(255,255,255,0.45)] transition-all duration-300 cursor-pointer group h-full"
            >
              <CardContent className="relative p-6 h-full min-h-[192px] text-center">
                <div className="absolute left-1.5 bottom-1.5 z-10 group/info">
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-muted-foreground/80 hover:text-foreground hover:border-muted-foreground/50 transition-colors"
                    aria-label={`Info: ${area.title}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info className="h-2.5 w-2.5" />
                  </button>
                  <div className="pointer-events-none absolute left-5 bottom-0 w-40 rounded border border-border bg-popover/95 px-2 py-1.5 text-[10px] leading-tight text-popover-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100 whitespace-normal break-words">
                    {area.desc}
                  </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-24 flex flex-col items-center">
                    <area.icon className="h-10 w-10 text-muted-foreground group-hover:text-zinc-700 transition-colors" />
                    <h3 className="mt-2 text-[11px] leading-tight text-muted-foreground group-hover:text-zinc-700 font-medium text-center w-full">
                      {area.title}
                    </h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
