import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  APP_LANGUAGES,
  clearUserLanguage,
  detectGeoLanguage,
  getGeoLanguage,
  getUserLanguage,
  setUserLanguage,
  type AppLanguage,
} from "@/lib/appLanguage";
import { i18n } from "@/lib/i18n";

/**
 * Explicit language override. "Automatic" clears the override so SE → sv,
 * everyone else → en (via /api/geo + cached geo).
 */
export function LanguageSettingsSection() {
  const { t } = useTranslation();
  const userChoice = getUserLanguage();
  const selectValue = userChoice ?? "auto";

  async function apply(next: "auto" | AppLanguage) {
    if (next === "auto") {
      clearUserLanguage();
      const detected = getGeoLanguage() ?? (await detectGeoLanguage()) ?? "en";
      await i18n.changeLanguage(detected);
      toast.success(t("language.saved"));
      return;
    }
    setUserLanguage(next);
    await i18n.changeLanguage(next);
    toast.success(t("language.saved"));
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" aria-hidden />
          {t("language.title")}
        </CardTitle>
        <CardDescription>{t("language.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="app-language">{t("language.label")}</Label>
        <Select
          value={selectValue}
          onValueChange={(v) => void apply(v as "auto" | AppLanguage)}
        >
          <SelectTrigger id="app-language" className="max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("language.auto")}</SelectItem>
            {APP_LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {t(`language.${lang.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
