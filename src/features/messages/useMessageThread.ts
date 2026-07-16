import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMessageThread } from "./messagesClient";
import type { ThreadMessage, UnifiedMessage } from "./types";

type Args = {
  selectedMessage: UnifiedMessage | null;
  activeProfileId: string | null | undefined;
};

/**
 * Thread body for the selected message: fetch, abort, and prefetch cache.
 */
export function useMessageThread({ selectedMessage, activeProfileId }: Args) {
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const threadPrefetchCache = useRef<Map<string, ThreadMessage[]>>(new Map());
  const prefetchInflight = useRef<Set<string>>(new Set());

  // Latest-ref: the load effect below keys on the message *id* so list
  // refreshes (new object, same id) don't refetch; the ref carries the full
  // object. Synced in an effect declared first so it is current when the
  // load effect runs in the same commit.
  const selectedMessageRef = useRef(selectedMessage);
  useEffect(() => {
    selectedMessageRef.current = selectedMessage;
  }, [selectedMessage]);

  useEffect(() => {
    const msg = selectedMessageRef.current;
    if (!msg) {
      setThreadLoading(false);
      return;
    }
    const canLoad =
      (msg.kind === "email" && (msg.threadId || msg.providerMessageId)) ||
      (msg.kind === "dm" && msg.conversationId);
    if (!canLoad) {
      setThreadMessages([]);
      setThreadLoading(false);
      return;
    }

    const cached = threadPrefetchCache.current.get(msg.id);
    if (cached) {
      setThreadMessages(cached);
      setThreadLoading(false);
      return;
    }

    // Avoid briefly showing the previous message's thread under the new selection.
    setThreadMessages([]);

    const ac = new AbortController();
    const messageId = msg.id;
    setThreadLoading(true);
    void fetchMessageThread(msg, activeProfileId, ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) {
          threadPrefetchCache.current.set(messageId, rows);
          setThreadMessages(rows);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setThreadMessages([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setThreadLoading(false);
      });

    return () => ac.abort();
  }, [selectedMessage?.id, activeProfileId]);

  const prefetchThread = useCallback(
    (msg: UnifiedMessage) => {
      if (threadPrefetchCache.current.has(msg.id) || prefetchInflight.current.has(msg.id)) return;
      const canLoad =
        (msg.kind === "email" && (msg.threadId || msg.providerMessageId)) ||
        (msg.kind === "dm" && msg.conversationId);
      if (!canLoad) return;
      prefetchInflight.current.add(msg.id);
      void fetchMessageThread(msg, activeProfileId)
        .then((rows) => {
          threadPrefetchCache.current.set(msg.id, rows);
          prefetchInflight.current.delete(msg.id);
        })
        .catch(() => prefetchInflight.current.delete(msg.id));
    },
    [activeProfileId]
  );

  return {
    threadMessages,
    threadLoading,
    prefetchThread,
  };
}
