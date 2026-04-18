import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Generic React error boundary. A single render error in a page or widget
 * would otherwise take down the whole app (white screen). The boundary
 * catches the error, logs it, and renders a recoverable fallback.
 *
 * Designed to be used at two levels:
 *   1. Root (wrapping providers / chrome) — last line of defense.
 *   2. Route (wrapping <Outlet />) — lets a page crash without killing the
 *      sidebar/header so the user can navigate away.
 *
 * Reset behavior:
 *   - The fallback's "Try again" button clears the error state.
 *   - Passing a changing `resetKey` (typically `location.pathname`) also
 *     clears the error, so navigating elsewhere recovers automatically.
 *
 * Telemetry hook:
 *   - Errors are written to the console today. When a real tracker
 *     (Sentry, Datadog, ...) is added, wire it up inside `componentDidCatch`.
 */

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary clears its error state. */
  resetKey?: string | number;
  /**
   * Custom fallback renderer. Receives the captured error and a reset
   * callback so the caller can render an arbitrary retry UI.
   */
  fallback?: (ctx: { error: Error; reset: () => void }) => ReactNode;
  /** Short label included in the console log — helps when multiple boundaries are nested. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const tag = this.props.label ? `:${this.props.label}` : "";
    console.error(`[ErrorBoundary${tag}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }
    return <DefaultFallback error={error} reset={this.reset} />;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8">
      <div className="w-full max-w-md space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <div className="inline-flex items-center justify-center rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          This section hit an unexpected error. You can retry, or pick another
          page from the sidebar.
        </p>
        {error.message ? (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-left text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        ) : null}
        <Button type="button" size="sm" onClick={reset} className="mx-auto">
          <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
      </div>
    </div>
  );
}
