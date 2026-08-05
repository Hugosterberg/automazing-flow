import { useTranslation } from "react-i18next";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { isNavUrlAllowedInMode } from "@/components/navConfig";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";
import { GUIDES } from "./guideCatalog";
import { openGuide } from "./guideEvents";

type Props = {
  /** Hides guides for pages that don't exist in the active workspace. */
  mode: WorkspaceMode;
  /** Close the palette before the guide opens, so only one dialog is up. */
  onSelect: () => void;
};

/**
 * Every guide, searchable from the command palette — so a walkthrough is
 * reachable from anywhere, not only from the page it documents. Entries are
 * prefixed ("Guide: …") so typing "guide" lists them all.
 */
export function GuideCommandGroup({ mode, onSelect }: Props) {
  const { t } = useTranslation("guides");

  const available = GUIDES.filter((guide) => isNavUrlAllowedInMode(guide.route, mode));
  if (available.length === 0) return null;

  return (
    <CommandGroup heading={t("ui.commandGroup")}>
      {available.map((guide) => {
        const title = t(`${guide.id}.title`);
        const label = `${t("ui.commandPrefix")}: ${title}`;
        const Icon = guide.icon;
        return (
          <CommandItem
            key={guide.id}
            value={label}
            onSelect={() => {
              onSelect();
              openGuide(guide.id);
            }}
          >
            <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
            {label}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
