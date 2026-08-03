import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { FlaskConical, Mail, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { useDemoMode } from "@/features/demo";
import { connectionsSessionHref } from "@/features/connections/connectSessionState";

/** Empty-state cards when the mail tab has no Gmail/Outlook connection. */
export function MailConnectEmptyCards() {
  const { t } = useTranslation("messages");
  const { enable, isLoading } = useDemoMode();

  return (
    <m.div {...fadeUp} transition={{ duration: 0.35 }} className="space-y-3">
      <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 sm:px-4">
        <p className="text-sm font-medium text-foreground">{t("mailEmpty.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {t("mailEmpty.description")}
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t("mailEmpty.trust")}
        </p>
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            disabled={isLoading}
            onClick={enable}
          >
            <FlaskConical className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("mailEmpty.demo")}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Gmail</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("mailEmpty.gmailHint")}</p>
            </div>
            <Button asChild size="sm" className="glow-sm">
              <Link to={connectionsSessionHref("gmail", { wizard: true })}>
                {t("mailEmpty.connectGmail")}
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Outlook</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("mailEmpty.outlookHint")}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={connectionsSessionHref("outlook", { wizard: true })}>
                {t("mailEmpty.connectOutlook")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </m.div>
  );
}
