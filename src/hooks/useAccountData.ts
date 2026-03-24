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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);
  const initialDataRef = useRef(initialData);

  const fetchFor = useCallback(
    async (accountId: string, force = false) => {
      if (!force && fetchedFor.current === accountId) return;
      fetchedFor.current = accountId;
      setLoading(true);
      setError(null);
      try {
        const next = await fetcher(accountId);
        setData(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setLoading(false);
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
      setData(initialDataRef.current);
      setError(null);
      return;
    }
    void fetchFor(activeAccount.id);
  }, [activeAccount, fetchFor]);

  return {
    scopedAccounts,
    activeAccount,
    data,
    setData,
    loading,
    error,
    setError,
    refresh,
    refetchCurrent: fetchFor,
  };
}
