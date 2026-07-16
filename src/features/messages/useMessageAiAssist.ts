import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/apiBase";
import { apiJson } from "@/lib/apiJson";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { UnifiedMessage } from "./types";

type Args = {
  messages: UnifiedMessage[];
  selectedMessage: UnifiedMessage | null;
  selectedId: string | null;
  replySent: boolean;
  sendBusy: boolean;
  setReplyDraft: (draft: string) => void;
};

/**
 * AI reply drafts (auto + manual) and inbox snippet summaries.
 * Owns draftBusy / aiSummaries; page still owns replyDraft text state.
 */
export function useMessageAiAssist({
  messages,
  selectedMessage,
  selectedId,
  replySent,
  sendBusy,
  setReplyDraft,
}: Args) {
  const { toast } = useToast();
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [draftBusy, setDraftBusy] = useState(false);
  const autoDraftForId = useRef<string | null>(null);
  const lastSummaryFingerprint = useRef("");
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const draftReplyFor = useCallback(
    async (forId: string, kind: "email" | "dm", authorName: string, text: string) => {
      setDraftBusy(true);
      try {
        const payload = await apiJson<{ draft?: unknown }>("/api/ai/reply-draft", "Kunde inte skapa AI-utkast", {
          body: { kind, authorName, text },
        });
        if (selectedIdRef.current !== forId) return;
        setReplyDraft(String(payload?.draft || ""));
      } catch (e) {
        if (selectedIdRef.current !== forId) return;
        toast({
          title: "AI-utkast misslyckades",
          description: e instanceof Error ? e.message : "Okänt fel",
          variant: "destructive",
        });
      } finally {
        setDraftBusy(false);
      }
    },
    [setReplyDraft, toast]
  );

  const draftReply = useCallback(async () => {
    if (!selectedMessage) return;
    autoDraftForId.current = selectedMessage.id;
    await draftReplyFor(
      selectedMessage.id,
      selectedMessage.kind === "email" ? "email" : "dm",
      selectedMessage.from.name || selectedMessage.subject,
      selectedMessage.body || selectedMessage.snippet
    );
  }, [draftReplyFor, selectedMessage]);

  useEffect(() => {
    if (!selectedMessage || draftBusy || sendBusy || replySent) return;
    if (autoDraftForId.current === selectedMessage.id) return;
    const text = (selectedMessage.body || selectedMessage.snippet || "").trim();
    if (!text) return;
    // On phones/tablets, wait for an explicit AI tap so reading stays calm.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      return;
    }
    // Debounce so rapid J/K navigation doesn't spam AI draft requests.
    const messageId = selectedMessage.id;
    const authorName = selectedMessage.from.name || selectedMessage.subject;
    const kind = selectedMessage.kind === "email" ? "email" : "dm";
    const bodyText = selectedMessage.body || selectedMessage.snippet;
    const timer = window.setTimeout(() => {
      if (autoDraftForId.current === messageId) return;
      if (selectedIdRef.current !== messageId) return;
      autoDraftForId.current = messageId;
      void draftReplyFor(messageId, kind, authorName, bodyText);
    }, 550);
    return () => window.clearTimeout(timer);
    // Match prior page behavior: only re-arm on selection id / busy flags.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedMessage fields read for the current id
  }, [selectedMessage?.id, draftBusy, sendBusy, replySent, draftReplyFor]);

  const summaryPayload = useMemo(
    () =>
      messages.slice(0, 10).map((m) => ({
        id: m.id,
        subject: m.subject,
        snippet: m.snippet,
        from: m.from,
      })),
    [messages]
  );
  const summaryFingerprint = useMemo(
    () => summaryPayload.map((m) => `${m.id}\0${m.snippet}\0${m.subject}`).join("|"),
    [summaryPayload]
  );

  useEffect(() => {
    if (summaryPayload.length === 0) {
      lastSummaryFingerprint.current = "";
      setAiSummaries({});
      return;
    }
    if (summaryFingerprint === lastSummaryFingerprint.current) return;
    const ac = new AbortController();
    void fetchWithTimeout(apiUrl("/api/messages/summaries"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: summaryPayload }),
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("summary_failed"))))
      .then((d) => {
        if (ac.signal.aborted || !d || typeof d.summaries !== "object") return;
        lastSummaryFingerprint.current = summaryFingerprint;
        setAiSummaries(d.summaries);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [summaryFingerprint, summaryPayload]);

  return {
    aiSummaries,
    draftBusy,
    setDraftBusy,
    draftReply,
    autoDraftForId,
  };
}
