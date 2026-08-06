import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bot,
  Briefcase,
  Building2,
  BookOpen,
  CalendarDays,
  Clock,
  Keyboard,
  Link2,
  ListPlus,
  LogOut,
  Mail,
  Megaphone,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  ListChecks,
  MessageSquare,
  Star,
  Zap,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  navItemsForMode,
  topNavItemsForMode,
  type NavGroup,
} from "@/components/navConfig";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { useAppPulse } from "@/hooks/useAppPulse";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceMode } from "@/features/workspace-mode";
import {
  getRecentPages,
  modKeyLabel,
  titleForRecentPage,
  type RecentPage,
} from "@/lib/keyboardShortcuts";
import { useTranslation } from "react-i18next";
import { briefItemsForRoute } from "@/features/daily-brief/briefForRoute";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useCommandPaletteEntities } from "@/hooks/useCommandPaletteEntities";
import { GuideCommandGroup } from "@/features/guides/GuideCommandGroup";
import { openWelcomeTour } from "@/features/onboarding/welcomeTourState";

type CommandPaletteProps = {
  onOpenShortcuts?: () => void;
};

/**
 * Global command palette: ⌘K / Ctrl+K opens a fuzzy-searchable list of pages,
 * recent visits, and quick actions. Swedish labels; pairs with G-chord nav
 * and the ? shortcuts dialog via Layout.
 */
export function CommandPalette({ onOpenShortcuts }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const prefetchFor = useRoutePrefetch();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { brief } = useDailyBriefSummary(businessProfileId);
  const routeBriefItems = useMemo(
    () => briefItemsForRoute(location.pathname, brief.items),
    [location.pathname, brief.items]
  );
  const entities = useCommandPaletteEntities(open);

  const contextualActions = useMemo(() => {
    const path = location.pathname;
    const rows: Array<{ label: string; url: string; icon: typeof Sparkles }> = [];
    if (path.startsWith("/messages")) {
      rows.push({ label: t("commandPalette.ctxFilterOpen"), url: "/messages", icon: MessageSquare });
    }
    if (path.startsWith("/tasks")) {
      rows.push({ label: t("commandPalette.ctxOverdueTasks"), url: "/tasks?view=overdue", icon: ListChecks });
      rows.push({ label: t("commandPalette.ctxTodayTasks"), url: "/tasks?view=today", icon: ListChecks });
    }
    if (path.startsWith("/reviews")) {
      rows.push({ label: t("commandPalette.ctxReviewsNeeds"), url: "/reviews?filter=needs_reply", icon: Target });
    }
    if (path.startsWith("/content")) {
      rows.push({ label: t("commandPalette.ctxContentPublish"), url: "/content?tab=publish", icon: Megaphone });
      rows.push({ label: t("commandPalette.ctxContentSelected"), url: "/content?tab=selected", icon: Sparkles });
    }
    if (path.startsWith("/sales")) {
      rows.push({ label: t("commandPalette.ctxLeadFollowups"), url: "/sales?view=followups", icon: Target });
      rows.push({ label: t("commandPalette.ctxOutreachQueue"), url: "/sales?view=outreach-queue", icon: TrendingUp });
    }
    if (path.startsWith("/activity")) {
      rows.push({ label: t("commandPalette.ctxFilterErrors"), url: "/activity?severity=error", icon: Activity });
    }
    if (path.startsWith("/connections")) {
      rows.push({ label: t("commandPalette.ctxConnectionHealth"), url: "/connections?tab=health", icon: Link2 });
    }
    if (path.startsWith("/calendar")) {
      rows.push({ label: t("commandPalette.ctxCreateEvent"), url: "/calendar", icon: CalendarDays });
    }
    if (path.startsWith("/company")) {
      rows.push({ label: t("commandPalette.ctxCompanyProfile"), url: "/company", icon: Building2 });
    }
    return rows;
  }, [location.pathname, t]);
  const { authMode, signOut } = useAuth();
  const { mode, setMode } = useWorkspaceMode();
  const { items: pulseItems } = useAppPulse();
  const modKey = modKeyLabel();

  const { pageGroups, systemItems } = useMemo(() => {
    const modeNavItems = navItemsForMode(mode);
    return {
      pageGroups: (["work", "productivity"] as NavGroup[]).map((group) => ({
        group,
        items: modeNavItems.filter((item) => item.group === group),
      })),
      systemItems: topNavItemsForMode(mode),
    };
  }, [mode]);

  const refreshRecent = useCallback(() => {
    setRecentPages(getRecentPages());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (!value) refreshRecent();
          return !value;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshRecent]);

  function goTo(url: string) {
    setOpen(false);
    navigate(url);
  }

  function switchWorkspace() {
    setOpen(false);
    setMode(mode === "private" ? "business" : "private");
    navigate("/");
  }

  function openShortcuts() {
    setOpen(false);
    onOpenShortcuts?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          refreshRecent();
          setOpen(true);
        }}
        className="pressable relative flex h-9 w-9 items-center justify-center gap-2 rounded-full border border-border bg-card/40 px-0 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground sm:h-auto sm:w-auto sm:rounded-md sm:px-2 sm:py-1.5"
        aria-label={t("commandPalette.open")}
      >
        <Search className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
        <span className="hidden sm:inline">{t("commandPalette.search")}</span>
        {pulseItems.length > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.7)]"
            aria-hidden
          />
        ) : null}
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
          {modKey} K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title={t("commandPalette.title")}>
        <CommandInput placeholder={t("commandPalette.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>

          {contextualActions.length > 0 ? (
            <>
              <CommandGroup heading={t("commandPalette.contextual")}>
                {contextualActions.map((action) => (
                  <CommandItem
                    key={action.url + action.label}
                    value={`${t("commandPalette.contextual")} ${action.label}`}
                    onSelect={() => goTo(action.url)}
                    onPointerEnter={() => prefetchFor(action.url.split("?")[0] ?? action.url)}
                  >
                    <action.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {action.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          {entities.length > 0 ? (
            <>
              <CommandGroup heading={t("commandPalette.entities")}>
                {entities.slice(0, 12).map((entity) => (
                  <CommandItem
                    key={entity.id}
                    value={`${entity.label} ${entity.description} ${entity.kind}`}
                    onSelect={() => goTo(entity.to)}
                    onPointerEnter={() => prefetchFor(entity.to.split("?")[0] ?? entity.to)}
                  >
                    {entity.kind === "task" ? (
                      <ListChecks className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : entity.kind === "outreach" ? (
                      <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : entity.kind === "message" ? (
                      <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : entity.kind === "customer" ? (
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : entity.kind === "review" ? (
                      <Star className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : entity.kind === "automation" ? (
                      <Zap className="mr-2 h-4 w-4 text-destructive/80" />
                    ) : entity.kind === "event" ? (
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{entity.label}</span>
                      <span className="truncate text-[10px] text-muted-foreground">{entity.description}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          {routeBriefItems.length > 0 ? (
            <>
              <CommandGroup heading={t("commandPalette.onThisPage")}>
                {routeBriefItems.slice(0, 4).map((item) => (
                  <CommandItem
                    key={`route-${item.id}`}
                    value={`${t("commandPalette.onThisPage")} ${item.title} ${item.description}`}
                    onSelect={() => goTo(item.to)}
                    onPointerEnter={() => prefetchFor(item.to.split("?")[0] ?? item.to)}
                  >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.title}</span>
                      <span className="truncate text-[10px] text-muted-foreground">{item.description}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          {pulseItems.length > 0 ? (
            <>
              <CommandGroup heading={t("commandPalette.needsAttention")}>
                {pulseItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${t("commandPalette.needsAttention")} ${item.label} ${item.description}`}
                    onSelect={() => goTo(item.url)}
                    onPointerEnter={() => prefetchFor(item.url.split("?")[0] ?? item.url)}
                  >
                    <item.icon className="mr-2 h-4 w-4 text-primary" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.label}</span>
                      <span className="truncate text-[10px] text-muted-foreground">{item.description}</span>
                    </span>
                    <CommandShortcut>
                      <Zap className="h-3 w-3" />
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          {recentPages.length > 0 ? (
            <>
              <CommandGroup heading={t("commandPalette.recent")}>
                {recentPages.map((page) => {
                  // Re-derive the title so recents follow the active language
                  // (the stored title is from visit time).
                  const title = titleForRecentPage(page.pathname) || page.title;
                  return (
                    <CommandItem
                      key={page.pathname}
                      value={`${t("commandPalette.recent")} ${title} ${page.pathname}`}
                      onSelect={() => goTo(page.pathname)}
                      onPointerEnter={() => prefetchFor(page.pathname)}
                    >
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                      {title}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          <GuideCommandGroup mode={mode} onSelect={() => setOpen(false)} />
          <CommandSeparator />

          <CommandGroup heading={t("commandPalette.actions")}>
            <CommandItem
              value={t("commandPalette.showShortcuts")}
              onSelect={openShortcuts}
            >
              <Keyboard className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.showShortcuts")}
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={t("commandPalette.openHandbook")}
              onSelect={() => goTo("/handbook")}
            >
              <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.openHandbook")}
            </CommandItem>
            <CommandItem
              value={t("commandPalette.showWelcomeTour")}
              onSelect={() => {
                setOpen(false);
                // Tour lives on Home — navigate there first so it can mount.
                navigate("/");
                openWelcomeTour();
              }}
            >
              <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.showWelcomeTour")}
            </CommandItem>
            <CommandItem
              value={
                mode === "private"
                  ? t("commandPalette.switchToBusiness")
                  : t("commandPalette.switchToPrivate")
              }
              onSelect={switchWorkspace}
            >
              {mode === "private" ? (
                <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
              ) : (
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
              )}
              {mode === "private"
                ? t("commandPalette.switchToBusiness")
                : t("commandPalette.switchToPrivate")}
            </CommandItem>
            <CommandItem
              value={t("commandPalette.messageTriage")}
              onSelect={() => goTo("/messages")}
              onPointerEnter={() => prefetchFor("/messages")}
            >
              <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.messageTriage")}
              <CommandShortcut>G M</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={t("commandPalette.newTask")}
              onSelect={() => goTo("/tasks")}
              onPointerEnter={() => prefetchFor("/tasks")}
            >
              <ListPlus className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.newTask")}
              <CommandShortcut>G T</CommandShortcut>
            </CommandItem>
            {mode === "business" ? (
              <>
                <CommandItem
                  value={t("commandPalette.newLead")}
                  onSelect={() => goTo("/sales?new=lead")}
                  onPointerEnter={() => prefetchFor("/sales")}
                >
                  <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("commandPalette.newLead")}
                </CommandItem>
                <CommandItem
                  value={t("commandPalette.newDeal")}
                  onSelect={() => goTo("/sales?new=deal")}
                  onPointerEnter={() => prefetchFor("/sales")}
                >
                  <TrendingUp className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("commandPalette.newDeal")}
                </CommandItem>
                <CommandItem
                  value={t("commandPalette.newCampaign")}
                  onSelect={() => goTo("/marketing?new=campaign")}
                  onPointerEnter={() => prefetchFor("/marketing")}
                >
                  <Megaphone className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("commandPalette.newCampaign")}
                </CommandItem>
                <CommandItem
                  value={t("commandPalette.companyProfile")}
                  onSelect={() => goTo("/company")}
                  onPointerEnter={() => prefetchFor("/company")}
                >
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("commandPalette.companyProfile")}
                  <CommandShortcut>G C</CommandShortcut>
                </CommandItem>
              </>
            ) : null}
            <CommandItem
              value={t("commandPalette.mcpIntelligence")}
              onSelect={() => goTo("/intelligence")}
              onPointerEnter={() => prefetchFor("/intelligence")}
            >
              <Bot className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.mcpIntelligence")}
              <CommandShortcut>G I</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={t("commandPalette.aiSettings")}
              onSelect={() => goTo("/preferences?tab=ai")}
              onPointerEnter={() => prefetchFor("/preferences")}
            >
              <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("commandPalette.aiSettings")}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />

          {pageGroups.map(({ group, items }) => (
            <CommandGroup key={group} heading={t(`navGroups.${group}`)}>
              {items.map((item) => (
                <CommandItem
                  key={item.key}
                  value={t(`nav.${item.key}`)}
                  onSelect={() => goTo(item.url)}
                  onPointerEnter={() => prefetchFor(item.url)}
                >
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t(`nav.${item.key}`)}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading={t("navGroups.system")}>
            {systemItems.map((item) => (
              <CommandItem
                key={item.key}
                value={t(`nav.${item.key}`)}
                onSelect={() => goTo(item.url)}
                onPointerEnter={() => prefetchFor(item.url)}
              >
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {t(`nav.${item.key}`)}
              </CommandItem>
            ))}
          </CommandGroup>
          {authMode === "cloud" ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("commandPalette.account")}>
                <CommandItem
                  value={t("commandPalette.signOut")}
                  onSelect={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                  {t("commandPalette.signOut")}
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
