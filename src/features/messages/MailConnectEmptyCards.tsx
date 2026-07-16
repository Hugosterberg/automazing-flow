import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { FlaskConical, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { useDemoMode } from "@/features/demo";

/** Empty-state cards when the mail tab has no Gmail/Outlook connection. */
export function MailConnectEmptyCards() {
  const { enable, isLoading } = useDemoMode();

  return (
    <m.div {...fadeUp} transition={{ duration: 0.35 }} className="space-y-3">
      <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 sm:px-4">
        <p className="text-sm font-medium text-foreground">Inkorg som faktiskt hjälper dig</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Koppla Gmail eller Outlook så triagerar automazing mail till Idag / Denna vecka / FYI.
          AI skriver utkast — du godkänner alltid innan något skickas.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
          Draft-before-send — ingen automation skickar utan dig.
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
            Visa demoinkorg först
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Gmail</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Snabbast till värde — triagera och svara med AI-utkast.
              </p>
            </div>
            <Button asChild size="sm" className="glow-sm">
              <Link to="/connections?wizard=1&q=gmail">Koppla Gmail</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Outlook</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Microsoft 365 / Outlook — samma inkorg och utkastflöde.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/connections?wizard=1&q=outlook">Koppla Outlook</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </m.div>
  );
}
