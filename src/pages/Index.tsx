import { motion } from "framer-motion";
import { Zap, Megaphone, BriefcaseBusiness, LineChart, Users, CalendarDays, MessageSquare, Settings, Info, Trash2, Star, Menu, Pencil, FolderOpen } from "lucide-react";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { useNavigate, Link } from "react-router-dom";
import { ProfileList } from "@/components/ProfileList";
import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { postAgentDebugIngest } from "@/lib/agentDebugIngest";

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
    title: "Sales & Marketing",
    desc: "Track growth goals, campaigns and sales performance",
    icon: LineChart,
    url: "/sales-marketing",
    ready: true,
  },
  {
    title: "Customers",
    desc: "Keep customer context, segments and relationship insights",
    icon: Users,
    url: "/customers",
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
    title: "Messages",
    desc: "Email and social DMs from all connected accounts",
    icon: MessageSquare,
    url: "/messages",
    ready: true,
  },
  {
    title: "Reviews",
    desc: "Monitor and respond to customer reviews",
    icon: Star,
    url: "/reviews",
    ready: true,
  },
  {
    title: "Content",
    desc: "Browse Google Drive media and mark it for creation workflows",
    icon: FolderOpen,
    url: "/content",
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
  const { activeProfile, profiles, accounts, removeProfile, updateProfile } = useAccounts();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    website: "",
    email: "",
    phone: "",
    company: "",
    location: "",
    notes: "",
  });

  const platformLabel: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    x: "X",
    facebook: "Facebook",
    google_business: "Google Business",
    google_reviews: "Google Reviews",
    tripadvisor: "Tripadvisor",
    whatsapp: "WhatsApp",
    shopify: "Shopify",
    gmail: "Gmail",
    outlook: "Outlook",
    google_drive: "Google Drive",
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
    postAgentDebugIngest({
      sessionId: "3f6df6",
      runId: "post-change",
      hypothesisId: "A2",
      location: "Index:area-cards",
      message: "Home area card heights after equal-size layout",
      data: {
        count: cards.length,
        heights: cards.map((c) => c.offsetHeight),
        titles: cards.map((c) => c.getAttribute("data-area-title")),
      },
      timestamp: Date.now(),
    });
    // #endregion
  }, []);

  useEffect(() => {
    if (!activeProfile) return;
    setProfileForm({
      name: activeProfile.name || "",
      website: activeProfile.website || "",
      email: activeProfile.email || "",
      phone: activeProfile.phone || "",
      company: activeProfile.company || "",
      location: activeProfile.location || "",
      notes: activeProfile.notes || "",
    });
  }, [activeProfile]);

  function saveProfileEdits() {
    if (!activeProfile) return;
    updateProfile(activeProfile.id, profileForm);
    setEditOpen(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="fixed top-4 left-4 z-40">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMenuOpen(true)}
          className="h-9 w-9 border-border bg-card/90 backdrop-blur hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-[280px] sm:w-[320px] bg-sidebar text-sidebar-foreground border-sidebar-border p-0 [&>button]:text-muted-foreground"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">automazing</span>
            </div>
            <div className="flex-1 overflow-auto px-3 py-3 sidebar-scroll">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                >
                  Home
                </button>
                {areas.map((area) => (
                  <button
                    key={area.title}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(area.url);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    {area.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
            {activeProfile && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="absolute left-5 top-5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors"
                aria-label={`Edit profile ${activeProfile.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
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
              <Link
                to="/connect-accounts"
                className="inline-flex items-center justify-center rounded-md border border-white/25 bg-transparent px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-white/45 hover:text-foreground"
              >
                Connect accounts
              </Link>
              {profileSummary.profileText && (
                <p className="text-sm text-muted-foreground border-t border-border pt-2 max-w-2xl">
                  {profileSummary.profileText}
                </p>
              )}
              {(activeProfile?.website || activeProfile?.email || activeProfile?.phone || activeProfile?.location) && (
                <p className="text-xs text-muted-foreground/80 border-t border-border pt-2 max-w-2xl">
                  {activeProfile.website ? `Website: ${activeProfile.website}` : ""}
                  {activeProfile.website && (activeProfile.email || activeProfile.phone || activeProfile.location) ? " · " : ""}
                  {activeProfile.email ? `Email: ${activeProfile.email}` : ""}
                  {activeProfile.email && (activeProfile.phone || activeProfile.location) ? " · " : ""}
                  {activeProfile.phone ? `Phone: ${activeProfile.phone}` : ""}
                  {activeProfile.phone && activeProfile.location ? " · " : ""}
                  {activeProfile.location ? `Location: ${activeProfile.location}` : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update profile details used for planning and account context.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-name">Profile name</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-company">Company</Label>
              <Input
                id="profile-company"
                value={profileForm.company}
                onChange={(e) => setProfileForm((p) => ({ ...p, company: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-location">Location</Label>
              <Input
                id="profile-location"
                value={profileForm.location}
                onChange={(e) => setProfileForm((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-website">Website</Label>
              <Input
                id="profile-website"
                placeholder="https://example.com"
                value={profileForm.website}
                onChange={(e) => setProfileForm((p) => ({ ...p, website: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-notes">Notes</Label>
              <Input
                id="profile-notes"
                placeholder="Short profile notes"
                value={profileForm.notes}
                onChange={(e) => setProfileForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveProfileEdits} disabled={!activeProfile}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
