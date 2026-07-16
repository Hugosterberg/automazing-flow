import { useEffect } from "react";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import type { MailMessageAction } from "./mailActionsClient";
import type { InboxFilter, UnifiedMessage } from "./types";

const FILTER_SHORTCUTS: Record<string, InboxFilter> = {
  q: "queue",
  o: "open",
  a: "all",
};

type Args = {
  canReplyToSelected: boolean;
  cycleTab: (delta: number) => void;
  filteredMessages: UnifiedMessage[];
  focusNextOpen: () => void;
  handledIds: Set<string>;
  mailActionBusy: boolean;
  markHandledAndAdvance: (id: string) => void;
  navigateOpenRelative: (delta: number) => void;
  navigateRelative: (delta: number) => void;
  performSelectedMailAction: (action: MailMessageAction) => void | Promise<void>;
  pickNextAfter: (id: string, list: UnifiedMessage[]) => UnifiedMessage | null;
  selectMessage: (msg: UnifiedMessage | null, opts?: { fromUser?: boolean }) => void;
  selectedId: string | null;
  selectedMessage: UnifiedMessage | null;
  setInboxFilterPersisted: (filter: InboxFilter) => void;
  snoozeMessage: (id: string, until: "tomorrow" | "week") => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  focusReplyRef: React.MutableRefObject<(() => void) | null>;
};

/** Inbox keyboard shortcuts (J/K, H, Z, E, filters, /, R, Escape, tabs). */
export function useMessagesKeyboardShortcuts(args: Args) {
  const {
    canReplyToSelected,
    cycleTab,
    filteredMessages,
    focusNextOpen,
    handledIds,
    mailActionBusy,
    markHandledAndAdvance,
    navigateOpenRelative,
    navigateRelative,
    performSelectedMailAction,
    pickNextAfter,
    selectMessage,
    selectedId,
    selectedMessage,
    setInboxFilterPersisted,
    snoozeMessage,
    searchInputRef,
    focusReplyRef,
  } = args;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;

      if (e.shiftKey && (e.key === "j" || e.key === "ArrowDown")) {
        e.preventDefault();
        navigateOpenRelative(1);
        return;
      }
      if (e.shiftKey && (e.key === "k" || e.key === "ArrowUp")) {
        e.preventDefault();
        navigateOpenRelative(-1);
        return;
      }
      if (!e.shiftKey && (e.key === "j" || e.key === "ArrowDown")) {
        e.preventDefault();
        navigateRelative(1);
        return;
      }
      if (!e.shiftKey && (e.key === "k" || e.key === "ArrowUp")) {
        e.preventDefault();
        navigateRelative(-1);
        return;
      }
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        focusNextOpen();
        return;
      }
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleTab(-1);
        return;
      }
      if (e.key === "]" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleTab(1);
        return;
      }
      if (matchesKey(e, "h") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        if (selectedMessage && !handledIds.has(selectedMessage.id)) {
          markHandledAndAdvance(selectedMessage.id);
        }
        return;
      }
      if (matchesKey(e, "z") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        if (selectedMessage && !handledIds.has(selectedMessage.id)) {
          snoozeMessage(selectedMessage.id, e.shiftKey ? "week" : "tomorrow");
          const next = pickNextAfter(selectedMessage.id, filteredMessages);
          selectMessage(next, { fromUser: true });
        }
        return;
      }
      if (matchesKey(e, "e") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        if (selectedMessage?.kind === "email" && !mailActionBusy) {
          void performSelectedMailAction("archive");
        }
        return;
      }
      const filterShortcut = FILTER_SHORTCUTS[e.key.toLowerCase()];
      if (filterShortcut && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setInboxFilterPersisted(filterShortcut);
        return;
      }
      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        selectMessage(null);
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (matchesKey(e, "r") && isPlainLetterShortcut(e) && selectedMessage && canReplyToSelected) {
        e.preventDefault();
        focusReplyRef.current?.();
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canReplyToSelected,
    cycleTab,
    filteredMessages,
    focusNextOpen,
    focusReplyRef,
    handledIds,
    mailActionBusy,
    markHandledAndAdvance,
    navigateOpenRelative,
    navigateRelative,
    performSelectedMailAction,
    pickNextAfter,
    searchInputRef,
    selectMessage,
    selectedId,
    selectedMessage,
    setInboxFilterPersisted,
    snoozeMessage,
  ]);
}
