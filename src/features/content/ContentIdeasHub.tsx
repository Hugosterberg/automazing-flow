import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentIdeasCard } from "./ContentIdeasCard";
import { OutreachContentCard } from "@/features/outreach";
import type { OutreachContentInput } from "@/features/outreach/outreachClient";

export function ContentIdeasHub({
  businessProfileId,
  socialContext,
  outreachContext,
  onUseIdea,
}: {
  businessProfileId: string | null;
  socialContext?: { businessName?: string; description?: string; audience?: string; platform?: string };
  outreachContext: Omit<OutreachContentInput, "business_profile_id">;
  onUseIdea: (text: string) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <Tabs defaultValue="social" className="space-y-3">
      <TabsList>
        <TabsTrigger value="social">{t("ideas.tabSocial")}</TabsTrigger>
        <TabsTrigger value="outreach">{t("ideas.tabOutreach")}</TabsTrigger>
      </TabsList>
      <TabsContent value="social" className="mt-0">
        <ContentIdeasCard businessProfileId={businessProfileId} context={socialContext} onUseIdea={onUseIdea} />
      </TabsContent>
      <TabsContent value="outreach" className="mt-0">
        <OutreachContentCard businessProfileId={businessProfileId} context={outreachContext} onUseIdea={onUseIdea} />
      </TabsContent>
    </Tabs>
  );
}
