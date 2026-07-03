import { m } from "framer-motion";
import { Bot } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpIntelligenceHub } from "@/features/intelligence";
import { pageFadeUp } from "@/lib/motion";

export default function IntelligencePage() {
  const { activeProfileId } = useAccounts();
  const activeBp = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBp ?? activeProfileId ?? null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={Bot}
        title="MCP Intelligence"
        description="One place for all MCP providers — status, queries, and clear feedback when API keys or OAuth are missing."
      />

      <m.div {...pageFadeUp}>
        <SectionConnectionStatus area="intelligence" />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.04 }}>
        <McpIntelligenceHub businessProfileId={businessProfileId} />
      </m.div>
    </div>
  );
}
