import { m } from "framer-motion";
import { Bot } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
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

      <PageSmartBar
        title="MCP Intelligence är kontrollpanelen för alla AI-leverantörer — se status, testa nycklar och kör frågor mot dina data."
        steps={[
          "Kontrollera att leverantörerna är gröna under Kopplingar → MCP",
          "Välj rätt verktyg och skriv en tydlig fråga med kontext",
          "Använd svaren i Sales, Content eller automationer",
        ]}
        tip="Saknas en nyckel? Lägg till den under Inställningar → Integrationer."
      />

      <m.div {...pageFadeUp}>
        <SectionConnectionStatus area="intelligence" />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.04 }} className="app-workspace-shell !min-h-[min(60vh,720px)]">
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <McpIntelligenceHub businessProfileId={businessProfileId} />
        </div>
      </m.div>
    </div>
  );
}
