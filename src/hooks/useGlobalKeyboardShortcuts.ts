import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";
import {
  GO_CHORD_MS,
  goTargetForKey,
  isShortcutBlocked,
  isTypingTarget,
} from "@/lib/keyboardShortcuts";

type UseGlobalKeyboardShortcutsOptions = {
  mode: WorkspaceMode;
  onOpenShortcuts: () => void;
};

/**
 * Global keyboard layer: G-chord navigation (G then H/T/M/U/…) and ? for the
 * shortcuts cheatsheet. Skips when focus is in an input or a dialog is open.
 */
export function useGlobalKeyboardShortcuts({
  mode,
  onOpenShortcuts,
}: UseGlobalKeyboardShortcutsOptions) {
  const navigate = useNavigate();
  const pendingGoRef = useRef(false);
  const goTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearGoPending() {
      pendingGoRef.current = false;
      if (goTimerRef.current !== null) {
        window.clearTimeout(goTimerRef.current);
        goTimerRef.current = null;
      }
    }

    function armGoPending() {
      pendingGoRef.current = true;
      if (goTimerRef.current !== null) window.clearTimeout(goTimerRef.current);
      goTimerRef.current = window.setTimeout(clearGoPending, GO_CHORD_MS);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (isShortcutBlocked()) return;

      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        onOpenShortcuts();
        clearGoPending();
        return;
      }

      if (pendingGoRef.current) {
        const target = goTargetForKey(event.key, mode);
        clearGoPending();
        if (target) {
          event.preventDefault();
          navigate(target.url);
        }
        return;
      }

      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        armGoPending();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearGoPending();
    };
  }, [mode, navigate, onOpenShortcuts]);
}
