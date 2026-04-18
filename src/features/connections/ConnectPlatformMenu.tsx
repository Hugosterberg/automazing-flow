import type { AccountPlatform } from "@/types/accounts";
import { CONNECTION_CATALOG } from "@/lib/connectionCatalog";
import { getConnectConfig } from "./connectAuthPath";

export interface ConnectPlatformMenuItem {
  platform: AccountPlatform;
  /** Override label from the shared catalog (rarely needed). */
  label?: string;
  /** Optional secondary line shown below the label. */
  hint?: string;
}

interface Props {
  items: ConnectPlatformMenuItem[];
  /**
   * Invoked when the user picks a platform. Receives the OAuth start
   * config from `connectAuthPath.ts` so callers can construct a URL (or
   * trigger a modal) without duplicating that knowledge.
   */
  onSelect: (
    platform: AccountPlatform,
    config: { authPath: string; provider?: "zernio" }
  ) => void;
  /** Grid layout hint. Defaults to 2 columns on `sm` and up. */
  columnsClassName?: string;
}

const LABEL_LOOKUP = new Map(
  CONNECTION_CATALOG.map((c) => [c.platform, c.label] as const)
);

/**
 * Reusable grid of "connect platform X" buttons.
 *
 * Single source of truth:
 *   - Labels come from `connectionCatalog.ts`.
 *   - Auth paths / provider choice come from `connectAuthPath.ts`.
 *
 * The menu skips any platform that has no connect config so callers
 * cannot accidentally ship a dead button.
 */
export function ConnectPlatformMenu({
  items,
  onSelect,
  columnsClassName = "sm:grid-cols-2",
}: Props) {
  const rendered = items
    .map((item) => {
      const config = getConnectConfig(item.platform);
      if (!config || config.manual) return null;
      const label =
        item.label ?? LABEL_LOOKUP.get(item.platform) ?? item.platform;
      return { ...item, label, config };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (rendered.length === 0) return null;

  return (
    <div className={`grid gap-2 ${columnsClassName}`}>
      {rendered.map(({ platform, label, hint, config }) => (
        <button
          key={platform}
          type="button"
          onClick={() =>
            onSelect(platform, {
              authPath: config.authPath,
              provider: config.provider,
            })
          }
          className="flex flex-col items-stretch rounded-md border border-border bg-card/40 px-4 py-3 text-left text-sm transition-colors hover:border-muted-foreground/50 hover:bg-accent/30"
        >
          <span className="font-medium">{label}</span>
          {hint ? (
            <span className="text-xs text-muted-foreground mt-1">{hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
