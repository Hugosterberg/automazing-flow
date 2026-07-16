import { m } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpIntelligenceHub } from "@/features/intelligence";
import {
  localizeMcpHubTab,
  MCP_HUB_TABS,
  type McpHubTabId,
} from "@/features/intelligence/mcpFeatureConfig";
import { pageFadeUp } from "@/lib/motion";

const HUB_TAB_IDS = MCP_HUB_TABS.map((t) => t.id);

function parseHubTab(raw: string | null): McpHubTabId {
  if (raw && (HUB_TAB_IDS as string[]).includes(raw)) return raw as McpHubTabId;
  return "overview";
}

export default function IntelligencePage() {
  const { t } = useTranslation("pages");
  const { activeProfileId } = useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const hubTab = parseHubTab(searchParams.get("tab"));

  function setHubTab(tab: McpHubTabId) {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={Bot}
        title={t("intelligence.title")}
        description={t("intelligence.description")}
      />

      <PageSmartBar
        title={t("intelligence.smartBar")}
        steps={[t("intelligence.step1"), t("intelligence.step2"), t("intelligence.step3")]}
        tip={t("intelligence.tip")}
      />

      <m.div {...pageFadeUp}>
        <SectionConnectionStatus area="intelligence" />
      </m.div>

      <PageModeTabs
        value={hubTab}
        aria-label={t("intelligence.tabsAria")}
        onChange={setHubTab}
        options={MCP_HUB_TABS.map((tab) => {
          const localized = localizeMcpHubTab(tab);
          return { value: localized.id, label: localized.label };
        })}
      />

      <m.div {...pageFadeUp} transition={{ delay: 0.04 }} className="app-workspace-shell !min-h-[min(60vh,720px)]">
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <McpIntelligenceHub
            businessProfileId={businessProfileId}
            tab={hubTab}
            onTabChange={setHubTab}
            hideTabList
          />
        </div>
      </m.div>
    </div>
  );
}
