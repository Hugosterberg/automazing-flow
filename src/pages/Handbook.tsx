import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PlugZap,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  countHandbookByStatus,
  handbookPages,
  HANDBOOK_STATUS_LABEL,
  type HandbookPage,
  type HandbookStatus,
} from "@/features/handbook/handbookCatalog";
import {
  clarifyFeature,
  pageClarity,
} from "@/features/handbook/handbookClarity";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<HandbookStatus, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  beta: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  wip: "border-border bg-muted/40 text-muted-foreground",
};

const GROUP_ORDER = ["home", "work", "productivity", "system"] as const;

const START_HERE = [
  { to: "/connections", labelKey: "startHere.connect", icon: PlugZap },
  { to: "/company", labelKey: "startHere.company", icon: Sparkles },
  { to: "/", labelKey: "startHere.home", icon: CheckCircle2 },
] as const;

function featureCount(page: HandbookPage): number {
  return page.tabs.reduce((n, tab) => n + tab.features.length, 0);
}

export default function HandbookPage() {
  const { t } = useTranslation("handbook");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<HandbookStatus | "all">("all");
  const [openPages, setOpenPages] = useState<string[]>([]);
  const q = query.trim().toLowerCase();

  const counts = useMemo(
    () => ({
      ready: countHandbookByStatus("ready"),
      beta: countHandbookByStatus("beta"),
      wip: countHandbookByStatus("wip"),
      pages: handbookPages.length,
      features: handbookPages.reduce((n, p) => n + featureCount(p), 0),
    }),
    []
  );

  const filtered = useMemo(() => {
    return handbookPages
      .map((page) => filterPage(page, q, statusFilter))
      .filter((page): page is HandbookPage => page != null);
  }, [q, statusFilter]);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      pages: filtered.filter((p) => p.group === group),
    })).filter((g) => g.pages.length > 0);
  }, [filtered]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);

  // When searching, auto-expand matches so results are immediately readable.
  const accordionValue = q || statusFilter !== "all" ? filteredIds : openPages;

  function expandAll() {
    setOpenPages(filteredIds);
  }

  function collapseAll() {
    setOpenPages([]);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader icon={BookOpen} title={t("title")} description={t("description")} />

      {/* How to use */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("howTo.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("howTo.body")}</p>
        </div>
        <ol className="grid gap-2 sm:grid-cols-3 text-sm">
          <li className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("howTo.step1Label")}</p>
            <p className="mt-0.5 text-foreground">{t("howTo.step1")}</p>
          </li>
          <li className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("howTo.step2Label")}</p>
            <p className="mt-0.5 text-foreground">{t("howTo.step2")}</p>
          </li>
          <li className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("howTo.step3Label")}</p>
            <p className="mt-0.5 text-foreground">{t("howTo.step3")}</p>
          </li>
        </ol>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">{t("startHere.title")}</p>
          <div className="flex flex-wrap gap-2">
            {START_HERE.map((item) => (
              <Button key={item.to} size="sm" variant="outline" asChild>
                <Link to={item.to}>
                  <item.icon className="h-3.5 w-3.5 mr-1.5" />
                  {t(item.labelKey)}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Status legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(
          [
            ["ready", counts.ready],
            ["beta", counts.beta],
            ["wip", counts.wip],
          ] as const
        ).map(([status, count]) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === status ? "all" : status))}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              STATUS_STYLE[status],
              statusFilter === status && "ring-2 ring-foreground/20"
            )}
          >
            <p className="text-xs font-semibold text-foreground">{t(`status.${status}`)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t(`statusHint.${status}`)}</p>
            <p className="text-xs tabular-nums mt-1.5 text-foreground/80">
              {t("featureCount", { count })}
            </p>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t("languageNote")}</p>

      {/* Search + expand controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            {t("filterAll")}
            <span className="ml-1.5 tabular-nums opacity-70">{counts.features}</span>
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={expandAll}>
            <ChevronDown className="h-3.5 w-3.5 mr-1" />
            {t("expandAll")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={collapseAll}>
            <ChevronUp className="h-3.5 w-3.5 mr-1" />
            {t("collapseAll")}
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t("empty")}</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ group, pages }) => (
            <section key={group} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`groups.${group}`)}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  · {t("pageCount", { count: pages.length })}
                </span>
              </h2>
              <Accordion
                type="multiple"
                value={accordionValue}
                onValueChange={setOpenPages}
                className="space-y-2"
              >
                {pages.map((page) => {
                  const clarity = pageClarity[page.id];
                  const nFeatures = featureCount(page);
                  return (
                    <AccordionItem
                      key={page.id}
                      value={page.id}
                      className="rounded-lg border border-border bg-card px-4"
                    >
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex flex-1 flex-col items-start gap-1.5 pr-4 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{page.name}</span>
                            <Badge variant="outline" className="font-normal text-[10px]">
                              {page.path}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {t("tabsAndFeatures", {
                                tabs: page.tabs.length,
                                features: nFeatures,
                              })}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground font-normal">
                            {clarity?.purpose ?? page.summary}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 space-y-5">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" asChild>
                            <Link to={page.path}>
                              {t("openPage")}
                              <ExternalLink className="h-3.5 w-3.5 ml-1" />
                            </Link>
                          </Button>
                        </div>

                        {clarity?.canDo?.length ? (
                          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("youCanHere")}
                            </p>
                            <ul className="space-y-1.5">
                              {clarity.canDo.map((item) => (
                                <li
                                  key={item}
                                  className="flex gap-2 text-sm text-foreground leading-snug"
                                >
                                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                            {clarity.tip ? (
                              <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                                {clarity.tip}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="space-y-5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("byTab")}
                          </p>
                          {page.tabs.map((tab) => (
                            <div key={tab.id} className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-foreground">{tab.name}</h3>
                                {tab.href ? (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                                    <Link to={tab.href}>{t("openTab")}</Link>
                                  </Button>
                                ) : null}
                              </div>
                              {tab.summary ? (
                                <p className="text-[11px] text-muted-foreground">{tab.summary}</p>
                              ) : null}
                              <ul className="space-y-2">
                                {tab.features.map((feature) => {
                                  const clear = clarifyFeature(feature.id, feature.description);
                                  return (
                                    <li
                                      key={feature.id}
                                      className="rounded-md border border-border/50 bg-background/40 px-3 py-2.5 space-y-1.5"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium">{feature.name}</p>
                                        <span
                                          className={cn(
                                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                            STATUS_STYLE[feature.status]
                                          )}
                                        >
                                          {t(`status.${feature.status}`, {
                                            defaultValue: HANDBOOK_STATUS_LABEL[feature.status],
                                          })}
                                        </span>
                                      </div>
                                      <p className="text-sm text-foreground leading-relaxed">
                                        {/^you can\b/i.test(clear.youCan)
                                          ? clear.youCan
                                          : `You can ${clear.youCan.charAt(0).toLowerCase()}${clear.youCan.slice(1)}`}
                                      </p>
                                      {clear.why ? (
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                          <span className="font-medium text-foreground/80">
                                            {t("whyLabel")}{" "}
                                          </span>
                                          {clear.why}
                                        </p>
                                      ) : null}
                                      {clear.needs ? (
                                        <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                                          <span className="font-medium">{t("needsLabel")} </span>
                                          {clear.needs}
                                        </p>
                                      ) : feature.status === "beta" ? (
                                        <p className="text-[11px] text-muted-foreground">
                                          {t("needsGeneric")}
                                        </p>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function filterPage(
  page: HandbookPage,
  q: string,
  statusFilter: HandbookStatus | "all"
): HandbookPage | null {
  const clarity = pageClarity[page.id];
  const clarityHay = clarity
    ? `${clarity.purpose} ${clarity.canDo.join(" ")} ${clarity.tip || ""}`
    : "";

  const tabs = page.tabs
    .map((tab) => {
      const features = tab.features.filter((f) => {
        if (statusFilter !== "all" && f.status !== statusFilter) return false;
        if (!q) return true;
        const clear = clarifyFeature(f.id, f.description);
        const hay =
          `${page.name} ${page.summary} ${page.path} ${clarityHay} ${tab.name} ${f.name} ${f.description} ${clear.youCan} ${clear.why || ""} ${clear.needs || ""}`.toLowerCase();
        return hay.includes(q);
      });
      if (features.length === 0) return null;
      return { ...tab, features };
    })
    .filter((tab): tab is NonNullable<typeof tab> => tab != null);

  if (tabs.length === 0) return null;
  return { ...page, tabs };
}
