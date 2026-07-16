import { useTranslation } from "react-i18next";
import { Globe2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcherPanel } from "@/components/LanguageSwitcher";

/**
 * Preferences language panel — visual tiles for Auto / Swedish / English.
 */
export function LanguageSettingsSection() {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe2 className="h-4 w-4" aria-hidden />
          </span>
          {t("language.title")}
        </CardTitle>
        <CardDescription>{t("language.label")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSwitcherPanel />
      </CardContent>
    </Card>
  );
}
