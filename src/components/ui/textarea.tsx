import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // `text-base` below `md` keeps iOS from zooming the viewport on focus.
        // Focus glow matches Input — border lights up, soft halo, no ring jump.
        "flex min-h-[80px] w-full rounded-md border border-input bg-background/70 px-3 py-2 text-base shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:border-muted-foreground/60 focus-visible:shadow-[inset_0_1px_2px_rgb(0_0_0/0.25),0_0_0_1px_hsl(var(--glow)/0.25),0_0_16px_-4px_hsl(var(--glow)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
