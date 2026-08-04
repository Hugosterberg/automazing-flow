import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Dock to the bottom of the screen as a native-feeling sheet on phones
   * (default). Set to false for dialogs that must stay centred on every
   * viewport — rare; the sheet keeps controls inside thumb reach.
   */
  mobileSheet?: boolean;
  /** Hide the top-right close control (for dialogs that own their own chrome). */
  hideClose?: boolean;
}

/**
 * On phones the dialog becomes a bottom sheet: full width, docked to the
 * bottom edge, rounded top corners and a grabber, sliding up from below.
 * From `sm` up it is the familiar centred modal. Both presentations share
 * one component so every dialog in the app gets the mobile treatment for
 * free — see `CommandDialog` for the pattern this generalises.
 */
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, mobileSheet = true, hideClose = false, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 shadow-lg duration-200 safe-x data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:w-full sm:p-6 sm:rounded-lg max-h-[min(90dvh,720px)] overflow-y-auto app-scroll",
          mobileSheet &&
            "max-sm:inset-x-0 max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:gap-3 max-sm:rounded-t-[1.35rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:border-t max-sm:border-border/60 max-sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))] max-sm:pt-2 max-sm:max-h-[min(92dvh,calc(100dvh-1rem))] max-sm:shadow-[0_-16px_48px_-20px_rgb(0_0_0_/_0.7)] max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      >
        {mobileSheet ? (
          <div className="flex justify-center pb-0.5 sm:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
          </div>
        ) : null}
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none max-sm:right-2.5 max-sm:top-2.5 max-sm:h-9 max-sm:w-9 max-sm:bg-muted/50 max-sm:opacity-100">
            <X className="h-4 w-4" />
            <span className="sr-only">Stäng</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Phones stack the actions full-width; desktop keeps the right-aligned row.
      "flex flex-col-reverse gap-2 max-sm:[&>*]:w-full sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
