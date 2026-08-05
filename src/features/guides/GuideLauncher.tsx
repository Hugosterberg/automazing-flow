import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { guideForRoute } from "./guideCatalog";
import { OPEN_GUIDE_EVENT, type OpenGuideDetail } from "./guideEvents";
import { GuideDialog } from "./GuideDialog";
import { isGuideComplete } from "./guideProgress";
import { useGuideContent } from "./useGuideContent";

/**
 * The "Guide" affordance shown next to a page's purpose strip.
 *
 * Renders nothing on routes without a guide, so pages can mount it
 * unconditionally. Until the user has ticked every step it carries a small
 * dot — enough to be noticed once, not enough to nag forever.
 */
export function GuideLauncher({ className }: { className?: string }) {
  const { t } = useTranslation("guides");
  const { pathname } = useLocation();
  const routeGuide = guideForRoute(pathname);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const guide = useGuideContent(routeGuide?.id ?? null);
  const [unseen, setUnseen] = useState(false);

  // Let any other surface (command palette, empty states) open a guide.
  useEffect(() => {
    function onOpen(event: Event) {
      const id = (event as CustomEvent<OpenGuideDetail>).detail?.guideId;
      if (!id) return;
      setActiveId(id);
      setOpen(true);
    }
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!routeGuide) {
      setUnseen(false);
      return;
    }
    setUnseen(!isGuideComplete(routeGuide.id, routeGuide.stepCount));
  }, [routeGuide, open]);

  const handleOpen = useCallback(() => {
    if (!routeGuide) return;
    setActiveId(routeGuide.id);
    setOpen(true);
  }, [routeGuide]);

  return (
    <>
      {routeGuide && guide ? (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={t("ui.triggerAria", { title: guide.title })}
          className={cn(
            "pressable relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground",
            className
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          {t("ui.trigger")}
          {unseen ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background"
              aria-hidden
            />
          ) : null}
        </button>
      ) : null}
      <GuideDialog guideId={activeId} open={open} onOpenChange={setOpen} />
    </>
  );
}
