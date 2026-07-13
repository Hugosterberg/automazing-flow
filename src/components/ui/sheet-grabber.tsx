import { cn } from "@/lib/utils";

/** Visual affordance for bottom sheets — iOS/Android-style grabber. */
export function SheetGrabber({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center pb-1 pt-0.5", className)} aria-hidden>
      <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
    </div>
  );
}
