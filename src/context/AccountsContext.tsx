import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ConnectedAccount, SocialPlatform } from "@/types/accounts";

const STORAGE_KEY = "automazing-connected-accounts";

interface AccountsContextValue {
  accounts: ConnectedAccount[];
  addAccount: (platform: SocialPlatform, username: string, extra?: Partial<ConnectedAccount>) => void;
  removeAccount: (id: string) => void;
  updateAccountAnalysis: (id: string, analysis: ConnectedAccount["analysis"]) => void;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
}

const AccountsContext = createContext<AccountsContextValue | null>(null);

function loadFromStorage(): ConnectedAccount[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return [];
}

function saveToStorage(accounts: ConnectedAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(loadFromStorage);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    saveToStorage(accounts);
  }, [accounts]);

  const addAccount = useCallback(
    (platform: SocialPlatform, username: string, extra?: Partial<ConnectedAccount>) => {
      const newAccount: ConnectedAccount = {
        id: crypto.randomUUID(),
        platform,
        username: username.trim(),
        connectedAt: new Date().toISOString(),
        ...extra,
      };
      setAccounts((prev) => [...prev, newAccount]);
    },
    []
  );

  const removeAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setSelectedAccountId((current) => (current === id ? null : current));
  }, []);

  const updateAccountAnalysis = useCallback((id: string, analysis: ConnectedAccount["analysis"]) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, analysis } : a))
    );
  }, []);

  return (
    <AccountsContext.Provider
      value={{
        accounts,
        addAccount,
        removeAccount,
        updateAccountAnalysis,
        selectedAccountId,
        setSelectedAccountId,
      }}
    >
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within AccountsProvider");
  return ctx;
}
