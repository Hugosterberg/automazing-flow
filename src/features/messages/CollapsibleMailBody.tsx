import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Collapsed email body — tall enough that typical mail is readable without expand. */
export const MAIL_BODY_COLLAPSED_MAX = "min(72vh, 780px)";
/** Expanded still capped so the reading pane cannot run away. */
export const MAIL_BODY_EXPANDED_MAX = "min(92vh, 1200px)";

type Props = {
  children: ReactNode;
  className?: string;
  /** Re-measure when this changes (e.g. message id / html). */
  contentKey?: string;
};

/**
 * Caps tall email bodies so triage stays on-screen. Overflow scrolls inside
 * the clamp; user can expand once for longer reading.
 */
export function CollapsibleMailBody({ children, className, contentKey }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [contentKey]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      // Compare scrollHeight to collapsed CSS max (~780px / 72vh).
      const collapsedPx = Math.min(window.innerHeight * 0.72, 780);
      setOverflows(el.scrollHeight > collapsedPx + 8);
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 500);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [contentKey, expanded]);

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={contentRef}
        className={cn(
          "w-full overflow-x-hidden overflow-y-auto app-scroll",
          !expanded && overflows && "mask-mail-fade"
        )}
        style={{
          maxHeight: expanded ? MAIL_BODY_EXPANDED_MAX : MAIL_BODY_COLLAPSED_MAX,
        }}
      >
        {children}
      </div>
      {overflows ? (
        <div
          className={cn(
            "flex justify-center pt-1.5",
            !expanded && "-mt-1"
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 rounded-full px-3 text-[11px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Visa mindre" : "Visa mer av mailet"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
