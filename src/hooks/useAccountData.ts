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
};

export function useAccountData<TData>({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  accountFilter,
  fetcher,
  initialData,
  autoSelectFirst = true,
}: UseAccountDataOptions<TData>) {
  const scopedAccounts = useMemo(() => accounts.filter(accountFilter), [accounts, accountFilter]);

  const activeAccount =
    scopedAccounts.find((a) => a.id === selectedAccountId) ?? scopedAccounts[0] ?? null;

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
