import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile, useMobileReadingFocus } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "automazing-pwa-install-dismissed";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const SHOW_DELAY_MS = 8000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chromeIos = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chromeIos;
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * Soft prompt to install Automazing as a home-screen app.
 * - Chromium: uses beforeinstallprompt → native install sheet
 * - iOS Safari: shows Share → "Lägg till på hemskärmen" guidance
 * Hidden when already installed, dismissed recently, or on desktop.
 */
export function PwaInstallPrompt({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const readingFocus = useMobileReadingFocus();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isMobile || isStandaloneDisplay() || wasDismissedRecently()) return;

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleShow = () => {
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (!cancelled) setVisible(true);
      }, SHOW_DELAY_MS);
    };

    if (isIosSafari()) {
      setIosHint(true);
      scheduleShow();
      return () => {
        cancelled = true;
        if (showTimer) clearTimeout(showTimer);
      };
    }

    function onBip(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      scheduleShow();
    }

    window.addEventListener("beforeinstallprompt", onBip);
    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", onBip);
    };
  }, [isMobile]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      dismiss();
    } catch {
      setBusy(false);
    }
  }, [deferred, dismiss]);

  if (readingFocus || !visible || !isMobile) return null;

  return (
    <div
      role="dialog"
      aria-label="Installera app"
      className={cn(
        "fixed inset-x-3 z-50 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-lg backdrop-blur-md safe-x",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:hidden",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <img
          src="/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="mt-0.5 h-10 w-10 shrink-0 rounded-xl border border-border/60"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">Lägg till på hemskärmen</p>
          {iosHint ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tryck <Share className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom" aria-hidden /> Dela, sedan
              ”Lägg till på hemskärmen” för snabbare tillgång.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Installera Automazing som app — snabbare start och mer plats på skärmen.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!iosHint && deferred ? (
              <Button type="button" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => void install()} disabled={busy}>
                <Download className="h-3.5 w-3.5" />
                Installera
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={dismiss}>
              Inte nu
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
          onClick={dismiss}
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
