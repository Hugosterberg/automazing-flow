import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { Connection } from "@/types/connection";
import { useNavigate } from "react-router-dom";
import { platformLabel } from "@/lib/platformLabels";

const WARNED_KEY = "automazing-token-expiry-warned";
const WARN_DAYS = 3; // warn if expires within 3 days

function loadWarned(): Set<string> {
  try {
    const raw = localStorage.getItem(WARNED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveWarned(set: Set<string>) {
  try {
    localStorage.setItem(WARNED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

/**
 * Watches the connections list and toasts when any connection's health is
 * "expired" or "failed" and the user hasn't been warned recently.
 * Also detects tokens that have lastSyncedAt older than WARN_DAYS days
 * without a successful sync.
 */
export function useTokenExpiryNotifier(connections: Connection[]) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const warnedRef = useRef<Set<string>>(loadWarned());

  useEffect(() => {
    if (connections.length === 0) return;

    const warned = warnedRef.current;
    const now = Date.now();
    const thresholdMs = WARN_DAYS * 24 * 60 * 60 * 1000;

    const problematic = connections.filter((c) => {
      if (c.disconnectedAt) return false;
      if (warned.has(c.id)) return false;

      if (c.health === "expired") return true;
      if (c.health === "failed") return true;

      // Stale: hasn't had a successful sync in WARN_DAYS days
      if (c.lastSuccessfulSyncAt) {
        const ageMs = now - new Date(c.lastSuccessfulSyncAt).getTime();
        if (ageMs > thresholdMs) return true;
      }

      return false;
    });

    if (problematic.length === 0) return;

    const expiredCount = problematic.filter((c) => c.health === "expired").length;
    const failedCount = problematic.filter((c) => c.health === "failed").length;
    const staleCount = problematic.length - expiredCount - failedCount;

    const parts: string[] = [];
    if (expiredCount > 0) parts.push(`${expiredCount} anslutning${expiredCount > 1 ? "ar" : ""} kräver ny inloggning`);
    if (failedCount > 0) parts.push(`${failedCount} misslyckad${failedCount > 1 ? "e" : ""} synkronisering${failedCount > 1 ? "ar" : ""}`);
    if (staleCount > 0) parts.push(`${staleCount} inaktiv${staleCount > 1 ? "a" : ""} anslutning${staleCount > 1 ? "ar" : ""}`);

    // Name the platforms so the toast reads as a specific to-do, and when a
    // single platform is affected deep-link straight to its card (search
    // pre-filled) instead of the generic Connections page.
    const platforms = [...new Set(problematic.map((c) => c.platform))];
    const labels = platforms.map((p) => platformLabel(p));
    const shownLabels = labels.slice(0, 3).join(", ") + (labels.length > 3 ? "…" : "");
    const target =
      platforms.length === 1
        ? `/connections?filter=attention&q=${encodeURIComponent(labels[0])}`
        : "/connections?filter=attention";
    const actionLabel = platforms.length === 1 ? `Åtgärda ${labels[0]}` : "Hantera";

    toast({
      title: "Anslutningsproblem upptäckta",
      description: `${parts.join(" · ")} — ${shownLabels}`,
      action: (
        <ToastAction altText={actionLabel} onClick={() => navigate(target)}>
          {actionLabel}
        </ToastAction>
      ),
    });

    // Mark as warned
    for (const c of problematic) {
      warned.add(c.id);
    }
    saveWarned(warned);
    warnedRef.current = warned;
  }, [connections, toast, navigate]);
}
