import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAccountData } from "./useAccountData";
import type { ConnectedAccount } from "@/types/accounts";

function acc(
  partial: Pick<ConnectedAccount, "id" | "platform" | "username"> & Partial<ConnectedAccount>
): ConnectedAccount {
  return {
    profileId: "p1",
    connectedAt: new Date().toISOString(),
    ...partial,
  } as ConnectedAccount;
}

describe("useAccountData", () => {
  it("auto-selects first account by scopeSort when allowImplicitFirstAccount is false", async () => {
    const accounts = [
      acc({ id: "tik", platform: "tiktok", username: "t" }),
      acc({ id: "ig", platform: "instagram", username: "i" }),
    ];
    const fetcher = vi.fn().mockResolvedValue({ data: 1 });
    let selectedId: string | null = null;
    const setSelected = vi.fn((id: string | null) => {
      selectedId = id;
    });

    const { rerender } = renderHook(() =>
      useAccountData({
        accounts,
        selectedAccountId: selectedId,
        setSelectedAccountId: setSelected,
        accountFilter: (a) => a.platform === "instagram" || a.platform === "tiktok",
        fetcher,
        initialData: null,
        autoSelectFirst: true,
        allowImplicitFirstAccount: false,
        scopeSort: (a, b) => a.platform.localeCompare(b.platform),
      })
    );

    await waitFor(() => {
      expect(setSelected).toHaveBeenCalledWith("ig");
    });
    rerender();
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith("ig");
    });
  });

  it("does not fetch when nothing selected and allowImplicitFirstAccount is false and autoSelectFirst is false", () => {
    const accounts = [acc({ id: "ig", platform: "instagram", username: "i" })];
    const setSelected = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({});

    renderHook(() =>
      useAccountData({
        accounts,
        selectedAccountId: null,
        setSelectedAccountId: setSelected,
        accountFilter: (a) => a.platform === "instagram",
        fetcher,
        initialData: null,
        autoSelectFirst: false,
        allowImplicitFirstAccount: false,
      })
    );

    expect(setSelected).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refetches the same account when requestKey changes", async () => {
    const accounts = [acc({ id: "drive", platform: "google_drive", username: "Drive", isOAuth: true })];
    const setSelected = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({});
    let folderId: string | null = null;

    const { rerender } = renderHook(() =>
      useAccountData({
        accounts,
        selectedAccountId: "drive",
        setSelectedAccountId: setSelected,
        accountFilter: (a) => a.platform === "google_drive",
        fetcher,
        initialData: null,
        requestKey: folderId ?? "root",
      })
    );

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    folderId = "folder-1";
    rerender();

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});
