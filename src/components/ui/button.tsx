import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-spring active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Vertical gradient + inset highlight give the white primary a
        // machined, slightly convex read instead of a flat fill.
        default:
          "bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(0_0_0/0.5)] hover:from-primary hover:to-primary hover:shadow-glow-md",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/85 text-destructive-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:to-destructive hover:shadow-glow-sm",
        outline:
          "border border-input bg-background/60 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)] hover:bg-accent hover:text-accent-foreground hover:border-muted-foreground/40 hover:shadow-glow-sm",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)] hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
