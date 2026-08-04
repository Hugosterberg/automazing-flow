import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner's default bottom placement lands on top of the mobile bottom tab
 * bar, so toasts either cover navigation or get tapped by accident. On
 * phones they drop from the top instead — clear of the notch, clear of the
 * tab bar. Desktop keeps the familiar bottom-right stack.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      mobileOffset={{
        top: "max(0.75rem, env(safe-area-inset-top, 0px))",
        left: "0.75rem",
        right: "0.75rem",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
