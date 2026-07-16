import { useState } from "react";
import { Check, GripVertical, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  QUICK_NAV_HOME_JUMP_LIMIT,
  QUICK_NAV_PRIMARY_LIMIT,
  pathConflictKey,
  type QuickNavDestination,
} from "./quickNavCatalog";
import { quickNavLabel } from "./quickNavLabels";
import { useQuickNavPrefs } from "./useQuickNavPrefs";

function moveKey(list: string[], from: number, to: number): string[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function toggleKey(
  list: string[],
  key: string,
  limit: number,
  catalog: QuickNavDestination[],
): string[] {
  if (list.includes(key)) {
    return list.filter((k) => k !== key);
  }
  if (list.length >= limit) return list;

  const dest = catalog.find((d) => d.key === key);
  if (!dest) return list;
  const conflict = pathConflictKey(dest.to);
  const hasConflict = list.some((k) => {
    const other = catalog.find((d) => d.key === k);
    return other ? pathConflictKey(other.to) === conflict : false;
  });
  if (hasConflict) return list;
  return [...list, key];
}

type QuickNavPrefsEditorProps = {
  className?: string;
  /** When true, compact copy for bottom-sheet use. */
  compact?: boolean;
};

export function QuickNavPrefsEditor({
  className,
  compact = false,
}: QuickNavPrefsEditorProps) {
  const { t } = useTranslation();
  const {
    primaryKeys,
    homeJumpKeys,
    available,
    savePrefs,
    resetDefaults,
    isLoading,
  } = useQuickNavPrefs();
  const [draftPrimary, setDraftPrimary] = useState<string[] | null>(null);
  const [draftHome, setDraftHome] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const primary = draftPrimary ?? primaryKeys;
  const homeJumps = draftHome ?? homeJumpKeys;
  const dirty = draftPrimary !== null || draftHome !== null;

  const save = () => {
    setSaving(true);
    setMessage(null);
    try {
      savePrefs(primary, homeJumps);
      setDraftPrimary(null);
      setDraftHome(null);
      setMessage("Genvägar sparade.");
    } catch {
      setMessage("Kunde inte spara. Försök igen.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSaving(true);
    setMessage(null);
    try {
      resetDefaults();
      setDraftPrimary(null);
      setDraftHome(null);
      setMessage("Standardgenvägar återställda.");
    } catch {
      setMessage("Kunde inte återställa.");
    } finally {
      setSaving(false);
    }
  };

  const renderSlotPicker = (
    selected: string[],
    setSelected: (keys: string[]) => void,
    limit: number,
    listLabel: string,
  ) => {
    const selectedSet = new Set(selected);
    return (
      <div className="space-y-3">
        {selected.length > 0 ? (
          <ul className="space-y-1.5" aria-label={listLabel}>
            {selected.map((key, index) => {
              const dest = available.find((d) => d.key === key);
              if (!dest) return null;
              const Icon = dest.icon;
              const label = quickNavLabel(dest.key, t);
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-2"
                >
                  <span className="text-muted-foreground" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <Icon className="h-4 w-4 text-foreground/80" aria-hidden />
                  <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={index === 0}
                      onClick={() => setSelected(moveKey(selected, index, index - 1))}
                      aria-label={`Flytta ${label} upp`}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={index === selected.length - 1}
                      onClick={() => setSelected(moveKey(selected, index, index + 1))}
                      aria-label={`Flytta ${label} ner`}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => setSelected(selected.filter((k) => k !== key))}
                      aria-label={`Ta bort ${label}`}
                    >
                      Ta bort
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Inga valda ännu.</p>
        )}

        <p className="text-xs text-muted-foreground">
          {selected.length}/{limit} valda. Tryck för att lägga till eller ta bort.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {available.map((dest) => {
            const active = selectedSet.has(dest.key);
            const conflict = pathConflictKey(dest.to);
            const blockedByConflict =
              !active &&
              selected.some((k) => {
                const other = available.find((d) => d.key === k);
                return other ? pathConflictKey(other.to) === conflict : false;
              });
            const atLimit = !active && selected.length >= limit;
            const disabled = blockedByConflict || atLimit;
            const Icon = dest.icon;
            return (
              <button
                key={dest.key}
                type="button"
                disabled={disabled && !active}
                onClick={() => setSelected(toggleKey(selected, dest.key, limit, available))}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 bg-background text-foreground hover:bg-muted/50",
                  disabled && !active && "cursor-not-allowed opacity-40",
                )}
                aria-pressed={active}
              >
                {active ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="truncate font-medium">{quickNavLabel(dest.key, t)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading && draftPrimary === null && draftHome === null) {
    return (
      <div className={cn("rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground", className)}>
        Laddar genvägar…
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-1.5">
        <h3 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-lg")}>
          Anpassa genvägar
        </h3>
        <p className="text-sm text-muted-foreground">
          Välj vad som syns i bottenmenyn och under ”Gå till” på Hem. Hem och Mer ligger alltid kvar.
        </p>
      </div>

      <section className="space-y-2" aria-labelledby="quick-nav-primary-heading">
        <div>
          <h4 id="quick-nav-primary-heading" className="text-sm font-semibold text-foreground">
            Bottenmeny (max {QUICK_NAV_PRIMARY_LIMIT})
          </h4>
          <p className="text-xs text-muted-foreground">
            Visas mellan Hem och Mer. Övriga destinationer hamnar under Mer.
          </p>
        </div>
        {renderSlotPicker(primary, setDraftPrimary, QUICK_NAV_PRIMARY_LIMIT, "Valda genvägar")}
      </section>

      <section className="space-y-2" aria-labelledby="quick-nav-home-heading">
        <div>
          <h4 id="quick-nav-home-heading" className="text-sm font-semibold text-foreground">
            Hem – Gå till (max {QUICK_NAV_HOME_JUMP_LIMIT})
          </h4>
          <p className="text-xs text-muted-foreground">
            Snabblänkarna under statusraden på startsidan.
          </p>
        </div>
        {renderSlotPicker(homeJumps, setDraftHome, QUICK_NAV_HOME_JUMP_LIMIT, "Valda snabblänkar")}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Sparar…" : "Spara genvägar"}
        </Button>
        <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
          Återställ standard
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setDraftPrimary(null);
              setDraftHome(null);
              setMessage(null);
            }}
          >
            Avbryt
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
