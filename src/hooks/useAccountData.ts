import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectedAccount } from "@/types/accounts";

type UseAccountDataOptions<TData> = {
  accounts: ConnectedAccount[];
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  accountFilter: (account: ConnectedAccount) => boolean;
  fetcher: (accountId: string) => Promise<TData>;
  initialData: TData;
  autoSelectFirst?: boolean;
  /** Applied after filter; first entry wins when autoSelectFirst runs (e.g. Instagram before TikTok). */
  scopeSort?: (a: ConnectedAccount, b: ConnectedAccount) => number;
  /**
   * When true (default), if nothing is selected yet, the first scoped account is still treated as active
   * (fetch runs). Set false together with autoSelectFirst so the first paint waits for an explicit selection.
   */
  allowImplicitFirstAccount?: boolean;
};

export function useAccountData<TData>({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  accountFilter,
  fetcher,
  initialData,
  autoSelectFirst = true,
  scopeSort,
  allowImplicitFirstAccount = true,
}: UseAccountDataOptions<TData>) {
  const scopedAccounts = useMemo(() => {
    const list = accounts.filter(accountFilter);
    if (!scopeSort || list.length < 2) return list;
    return [...list].sort(scopeSort);
  }, [accounts, accountFilter, scopeSort]);

  const activeAccount = useMemo(() => {
    if (selectedAccountId) {
      const hit = scopedAccounts.find((a) => a.id === selectedAccountId);
      if (hit) return hit;
      return allowImplicitFirstAccount ? scopedAccounts[0] ?? null : null;
    }
    return allowImplicitFirstAccount ? scopedAccounts[0] ?? null : null;
  }, [allowImplicitFirstAccount, scopedAccounts, selectedAccountId]);

  const [data, setData] = useState<TData>(initialData);
  const [dataAccountId, setDataAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);
  const initialDataRef = useRef(initialData);
  const latestRequestIdRef = useRef(0);
  const latestRequestedAccountIdRef = useRef<string | null>(null);

  const fetchFor = useCallback(
    async (accountId: string, force = false) => {
      if (!force && fetchedFor.current === accountId) return;
      fetchedFor.current = accountId;
      latestRequestedAccountIdRef.current = accountId;
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      setLoading(true);
      setError(null);
      try {
        const next = await fetcher(accountId);
        if (
          latestRequestIdRef.current !== requestId ||
          latestRequestedAccountIdRef.current !== accountId
        ) {
          return;
        }
        setDataAccountId(accountId);
        setData(next);
      } catch (e) {
        if (
          latestRequestIdRef.current !== requestId ||
          latestRequestedAccountIdRef.current !== accountId
        ) {
          return;
        }
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (
          latestRequestIdRef.current === requestId &&
          latestRequestedAccountIdRef.current === accountId
        ) {
          setLoading(false);
        }
      }
    },
    [fetcher]
  );

  const refresh = useCallback(async () => {
    if (!activeAccount) return;
    await fetchFor(activeAccount.id, true);
  }, [activeAccount, fetchFor]);

  useEffect(() => {
    if (!autoSelectFirst) return;
    if (scopedAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(scopedAccounts[0].id);
    }
  }, [autoSelectFirst, scopedAccounts, selectedAccountId, setSelectedAccountId]);

  useEffect(() => {
    if (!activeAccount) {
      latestRequestedAccountIdRef.current = null;
      setDataAccountId(null);
      setData(initialDataRef.current);
      setError(null);
      setLoading(false);
      return;
    }
    setDataAccountId(null);
    setData(initialDataRef.current);
    setError(null);
    void fetchFor(activeAccount.id);
  }, [activeAccount, fetchFor]);

  return {
    scopedAccounts,
    activeAccount,
    data,
    dataAccountId,
    setData,
    loading,
    error,
    setError,
    refresh,
    refetchCurrent: fetchFor,
  };
}
