import { useCallback, useRef } from "react";
import { apiUrl } from "@/lib/apiBase";
import { apiErrorMessage } from "@/lib/apiError";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  inboxCacheKey,
  mergeUnifiedByKind,
  readInboxCache,
  sortUnifiedMessages,
  writeInboxCache,
} from "./inboxCache";
import { buildInboxLoadScope } from "./inboxLoadParams";
import type { MailFolderSelection, MessageChannelTab, UnifiedMessage } from "./types";

type MailError = { accountId: string; platform: string; error: string };

type Args = {
  activeTab: MessageChannelTab;
  selectedMailFolder: MailFolderSelection | null;
  includeAllMail: boolean;
  activeProfileId: string | null | undefined;
  ensureBackendSession: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<UnifiedMessage[]>>;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setZernioNote: (v: string | null) => void;
  setMailErrors: (v: MailError[]) => void;
};

/**
 * Progressive mail→DM inbox loader with generation guard + session cache.
 * Extracted from Messages page so the page stays focused on composition.
 */
export function useLoadUnifiedInbox({
  activeTab,
  selectedMailFolder,
  includeAllMail,
  activeProfileId,
  ensureBackendSession,
  setMessages,
  setLoading,
  setError,
  setZernioNote,
  setMailErrors,
}: Args) {
  const loadGenRef = useRef(0);

  const loadUnified = useCallback(
    async (opts?: { silent?: boolean }) => {
      const gen = ++loadGenRef.current;
      const { folderScoped, allMailScope, mailAccountId, mailFolderId } = buildInboxLoadScope({
        activeTab,
        selectedMailFolder,
        includeAllMail,
      });
      const cacheKey = inboxCacheKey({
        businessProfileId: activeProfileId,
        mailAccountId,
        mailFolderId,
        includeAllMail: allMailScope,
      });

      if (!opts?.silent) {
        setError(null);
        setZernioNote(null);
        setMailErrors([]);
        const cached = readInboxCache(cacheKey);
        if (cached && cached.length > 0) {
          setMessages(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }

      const baseParams = new URLSearchParams();
      if (activeProfileId) baseParams.set("business_profile_id", activeProfileId);
      if (folderScoped && selectedMailFolder) {
        baseParams.set("mailAccountId", selectedMailFolder.accountId);
        baseParams.set("mailFolderId", selectedMailFolder.folderId);
      } else if (allMailScope) {
        baseParams.set("includeAllMail", "1");
      }

      async function fetchSources(sources: "mail" | "dm") {
        const params = new URLSearchParams(baseParams);
        params.set("sources", sources);
        const unifiedUrl = apiUrl(`/api/messages/unified?${params.toString()}`);
        let res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
        if (res.status === 401) {
          await ensureBackendSession();
          res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(apiErrorMessage(d, "Kunde inte ladda meddelanden."));
        }
        return res.json() as Promise<{
          messages?: UnifiedMessage[];
          mailErrors?: MailError[];
          zernioNote?: string;
        }>;
      }

      try {
        const mailData = await fetchSources("mail");
        if (gen !== loadGenRef.current) return;
        const mailMsgs = Array.isArray(mailData.messages) ? mailData.messages : [];
        setMessages((prev) => {
          const next = folderScoped
            ? sortUnifiedMessages(mailMsgs)
            : mergeUnifiedByKind(prev, mailMsgs, "email");
          writeInboxCache(cacheKey, next);
          return next;
        });
        if (Array.isArray(mailData.mailErrors) && mailData.mailErrors.length > 0) {
          setMailErrors(mailData.mailErrors);
        }
        if (!opts?.silent) setLoading(false);

        if (!folderScoped) {
          try {
            const dmData = await fetchSources("dm");
            if (gen !== loadGenRef.current) return;
            const dmMsgs = Array.isArray(dmData.messages) ? dmData.messages : [];
            setMessages((prev) => {
              const next = mergeUnifiedByKind(prev, dmMsgs, "dm");
              writeInboxCache(cacheKey, next);
              return next;
            });
            if (typeof dmData.zernioNote === "string" && dmData.zernioNote) {
              setZernioNote(dmData.zernioNote);
            }
          } catch {
            /* Keep mail rows if DM fetch fails. */
          }
        }
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : "Något gick fel");
          if (!readInboxCache(cacheKey)?.length) setMessages([]);
        }
      } finally {
        if (gen === loadGenRef.current && !opts?.silent) setLoading(false);
      }
    },
    [
      activeProfileId,
      activeTab,
      ensureBackendSession,
      includeAllMail,
      selectedMailFolder,
      setError,
      setLoading,
      setMailErrors,
      setMessages,
      setZernioNote,
    ]
  );

  return { loadUnified };
}
