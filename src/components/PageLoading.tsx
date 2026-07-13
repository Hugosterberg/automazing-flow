import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PageLoadingProps = {
  className?: string;
};

/**
 * Shared route-level loading skeleton. Used by lazy-route Suspense so
 * every page gets a consistent first paint instead of a bare spinner.
 */
export function PageLoading({ className }: PageLoadingProps) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6 p-1", className)} aria-busy="true" aria-label="Laddar sida">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 rounded-xl md:col-span-1" />
        <Skeleton className="h-24 rounded-xl md:col-span-1" />
        <Skeleton className="h-24 rounded-xl md:col-span-1" />
      </div>
      <Skeleton className="h-[min(52vh,520px)] w-full rounded-2xl" />
      <span className="sr-only">Laddar…</span>
    </div>
  );
}
