import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Uses the shared `.shimmer` sweep instead of a plain
 * opacity pulse — the moving highlight reads as "working", not "stalled",
 * and matches the loading language used by mail iframes and charts.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-md bg-muted/70", className)} {...props} />;
}

export { Skeleton };
