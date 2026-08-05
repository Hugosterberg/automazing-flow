import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Focus lights the border and casts a soft halo instead of jumping
          // to an offset ring — calmer, and consistent with the glow language.
          "flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-base shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] transition-[border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:border-muted-foreground/60 focus-visible:shadow-[inset_0_1px_2px_rgb(0_0_0/0.25),0_0_0_1px_hsl(var(--glow)/0.25),0_0_16px_-4px_hsl(var(--glow)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
