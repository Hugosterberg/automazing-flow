import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { Globe2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  clearUserLanguage,
  detectGeoLanguage,
  getGeoLanguage,
  getUserLanguage,
  setUserLanguage,
  type AppLanguage,
} from "@/lib/appLanguage";
import { i18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type LanguageChoice = "auto" | AppLanguage;

async function applyLanguage(next: LanguageChoice): Promise<void> {
  if (next === "auto") {
    clearUserLanguage();
    const detected = getGeoLanguage() ?? (await detectGeoLanguage()) ?? "en";
    await i18n.changeLanguage(detected);
    return;
  }
  setUserLanguage(next);
  await i18n.changeLanguage(next);
}

function useLanguageChoice(): LanguageChoice {
  const { i18n: i18nInstance } = useTranslation();
  const [choice, setChoice] = useState<LanguageChoice>(() => getUserLanguage() ?? "auto");

  useEffect(() => {
    setChoice(getUserLanguage() ?? "auto");
  }, [i18nInstance.language]);

  return choice;
}

/**
 * Compact header control — sliding SV/EN pill with optional Auto via popover.
 * Click a code to force that language; open the popover (globe/pin) for Auto.
 */
export function LanguageSwitcherCompact({ className }: { className?: string }) {
  const { t, i18n: i18nInstance } = useTranslation();
  const choice = useLanguageChoice();
  const activeLang: AppLanguage = i18nInstance.language?.startsWith("sv") ? "sv" : "en";
  const [open, setOpen] = useState(false);

  async function pick(next: LanguageChoice) {
    await applyLanguage(next);
    toast.success(t("language.saved"));
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-full border border-border/70 bg-card/50 p-0.5",
        className
      )}
    >
      <div className="relative flex h-7 items-stretch rounded-full bg-muted/40 p-0.5">
        <m.span
          layout
          className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full bg-primary shadow-sm"
          animate={{ x: activeLang === "sv" ? 0 : "100%" }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          style={{ left: 2 }}
        />
        {(["sv", "en"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => void pick(lang)}
            className={cn(
              "relative z-10 flex h-6 w-8 items-center justify-center rounded-full font-display text-[10px] font-semibold tracking-wider transition-colors",
              activeLang === lang ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label={t(`language.${lang}`)}
            aria-pressed={activeLang === lang && choice !== "auto"}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-accent/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              choice === "auto" && "text-primary"
            )}
            aria-label={t("language.openSwitcher")}
          >
            {choice === "auto" ? (
              <MapPin className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Globe2 className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 border-border/80 bg-popover/95 p-2 backdrop-blur-xl">
          <p className="mb-2 px-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("language.title")}
          </p>
          <LanguageOptionList choice={choice} onPick={pick} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Full preferences panel — three selectable tiles with motion highlight.
 */
export function LanguageSwitcherPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const choice = useLanguageChoice();

  async function pick(next: LanguageChoice) {
    await applyLanguage(next);
    toast.success(t("language.saved"));
  }

  return (
    <div className={cn("space-y-3", className)}>
      <LanguageOptionList choice={choice} onPick={pick} large />
      <p className="text-xs leading-relaxed text-muted-foreground">{t("language.description")}</p>
    </div>
  );
}

function LanguageOptionList({
  choice,
  onPick,
  large = false,
}: {
  choice: LanguageChoice;
  onPick: (next: LanguageChoice) => void | Promise<void>;
  large?: boolean;
}) {
  const { t } = useTranslation();

  const options: {
    value: LanguageChoice;
    title: string;
    subtitle: string;
    code?: string;
    icon?: typeof MapPin;
  }[] = [
    {
      value: "auto",
      title: t("language.autoShort"),
      subtitle: t("language.autoHint"),
      icon: MapPin,
    },
    {
      value: "sv",
      title: t("language.sv"),
      subtitle: t("language.svHint"),
      code: "SV",
    },
    {
      value: "en",
      title: t("language.en"),
      subtitle: t("language.enHint"),
      code: "EN",
    },
  ];

  return (
    <div className={cn("grid gap-1.5", large ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1")}>
      {options.map((opt) => {
        const selected = choice === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => void onPick(opt.value)}
            aria-pressed={selected}
            className={cn(
              "relative overflow-hidden rounded-xl border text-left transition-colors",
              large ? "min-h-[5.5rem] px-3.5 py-3" : "px-2.5 py-2",
              selected
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-border/60 bg-card/40 text-foreground hover:bg-muted/40"
            )}
          >
            {selected ? (
              <m.span
                layoutId="language-option-glow"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent"
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              />
            ) : null}
            <span className="relative z-10 flex items-start gap-2.5">
              {opt.code ? (
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg font-display font-semibold tracking-wider",
                    large ? "h-10 w-10 text-sm" : "h-8 w-8 text-[11px]",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {opt.code}
                </span>
              ) : Icon ? (
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg",
                    large ? "h-10 w-10" : "h-8 w-8",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className={cn("block font-medium", large ? "text-sm" : "text-xs")}>{opt.title}</span>
                <span className={cn("mt-0.5 block text-muted-foreground", large ? "text-xs" : "text-[10px]")}>
                  {opt.subtitle}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
