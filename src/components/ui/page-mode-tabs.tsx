import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type PageModeTabOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  value: T;
  options: PageModeTabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * URL-friendly page mode tabs — same underline style as Connections/Content.
 * Keeps one job visible per screen under a shared PageHeader.
 */
export function PageModeTabs<T extends string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel = "Sidflikar",
}: Props<T>) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={cn("w-full", className)}>
      {/*
       * Phones keep every tab on one swipeable row — wrapping five or six
       * labels produced ragged two-line strips that pushed the page content
       * down. From `sm` up there is room to wrap as before.
       */}
      <TabsList
        aria-label={ariaLabel}
        className="h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 no-scrollbar sm:flex-wrap sm:overflow-x-visible"
      >
        {options.map((opt) => (
          <TabsTrigger
            key={opt.value}
            value={opt.value}
            className="min-h-11 rounded-b-none border-b-2 border-transparent px-3 py-2 text-xs transition-all duration-200 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-muted/60 data-[state=active]:shadow-[0_10px_18px_-14px_hsl(var(--primary)/0.55)] sm:min-h-0"
          >
            {opt.label}
            {opt.count != null && opt.count > 0 ? (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] tabular-nums text-primary">
                {opt.count > 99 ? "99+" : opt.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
