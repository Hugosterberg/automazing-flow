import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiJson } from "@/lib/apiJson";

export type CheckStatus = "ok" | "warn" | "error";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface DiagnosticsReport {
  generatedAt: string;
  ok: boolean;
  summary: { ok: number; warn: number; error: number };
  checks: DiagnosticCheck[];
}

export const DIAGNOSTICS_KEY = ["diagnostics"] as const;

/**
 * App health report (config + schema). Cached for a few minutes since config
 * rarely changes; silent so a transient API hiccup never toasts over the page.
 */
export function useDiagnostics() {
  const { enabled, user } = useAuth();
  const query = useQuery<DiagnosticsReport>({
    queryKey: [...DIAGNOSTICS_KEY, user?.id ?? null],
    queryFn: () => apiJson<DiagnosticsReport>("/api/diagnostics", "Couldn't load diagnostics."),
    enabled: Boolean(enabled),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

  return {
    report: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
