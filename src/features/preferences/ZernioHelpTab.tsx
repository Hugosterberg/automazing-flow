import { AlertTriangle, CheckCircle2, ExternalLink, Layers, Link2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const zernioConnectPaths = [
  "Instagram",
  "Facebook",
  "WhatsApp",
  "TikTok",
  "Google Business / Reviews",
  "Google Ads",
  "Google Calendar",
  "Outlook Calendar",
  "Tripadvisor",
];

export function ZernioHelpTab() {
  return (
    <div className="space-y-5">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Hur Zernio används i Automazing
          </CardTitle>
          <CardDescription>
            Zernio är broker-lagret för flera sociala konton, inbox/DMs, reviews och vissa kalenderkopplingar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="font-medium text-foreground">1. Connect (standardvägen)</p>
              <p className="mt-1">
                Använd Connect-knapparna i Automazing. Servern skapar/hämtar rätt Zernio profile för aktiv
                business profile och skickar dig vidare till Zernios provider-OAuth. Du ska normalt inte behöva
                öppna Zernio-dashboarden själv.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="font-medium text-foreground">2. Link existing (avancerad fallback)</p>
              <p className="mt-1">
                “Link existing Zernio account” visar bara konton som Zernio redan returnerar via API:t.
                Om ett konto saknas där ska vanlig Connect användas i stället.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-3">
            <p className="font-medium text-foreground">Kopplingar som kan gå via Zernio</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {zernioConnectPaths.map((path) => (
                <span key={path} className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs">
                  {path}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Om ett konto saknas i listan
          </CardTitle>
          <CardDescription>
            Skillnaden mellan att länka befintligt och att skapa en ny provider-koppling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Klicka <span className="font-medium text-foreground">Connect</span> för rätt plattform
              (t.ex. Facebook). Det startar Zernios connect-flow från Automazing.
            </li>
            <li>Logga in/godkänn hos provider-flödet som öppnas.</li>
            <li>
              När du kommer tillbaka ska kontot vara kopplat till aktiv business profile. Refresh list behövs bara i
              den avancerade “Link existing”-dialogen.
            </li>
            <li>Välj kontot i listan om Zernio returnerar flera kanaler.</li>
          </ol>
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Automazing kan inte visa eller koppla ett provider-konto som Zernio inte returnerar via API:t.
                Då beror begränsningen vanligtvis på Zernio workspace/profile, plan/add-on eller provider-rättigheter.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            DMs, Inbox och felsökning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="font-medium text-foreground">Instagram/Facebook DMs</p>
              <p className="mt-1">
                Messages läser Zernio Inbox. Det kräver att Zernio returnerar conversations för den anslutna
                kanalen och att Inbox-funktionen/add-on är aktiv i Zernio-planen.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="font-medium text-foreground">Profile scope</p>
              <p className="mt-1">
                Automazing sparar varje koppling mot aktiv business profile. Samma inlogg kan ha flera profiler,
                men varje profil ska bara se sina egna anslutningar.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-3">
            <p className="font-medium text-foreground">Checklista när något inte syns</p>
            <ul className="mt-2 space-y-1.5">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Kontrollera att du är på rätt business profile i Automazing.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Använd vanlig Connect. Link existing är bara för kanaler som redan finns i Zernio.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Klicka Refresh list efter ny provider-login.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Om Inbox/DMs saknas: verifiera att Zernio-planen har Inbox och att provider-kontot har rätt åtkomst.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <a
              href="https://zernio.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Öppna Zernio
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-muted-foreground">
              Serverkrav: <code>ZERNIO_API_KEY</code> eller legacy <code>LATE_API_KEY</code>.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
