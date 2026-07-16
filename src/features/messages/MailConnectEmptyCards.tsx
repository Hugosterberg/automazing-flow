import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pageFadeUp as fadeUp } from "@/lib/motion";

/** Empty-state cards when the mail tab has no Gmail/Outlook connection. */
export function MailConnectEmptyCards() {
  return (
    <m.div {...fadeUp} transition={{ duration: 0.35 }} className="grid gap-3 sm:grid-cols-2">
      <Card className="border-dashed border-border bg-card/40">
        <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Gmail</p>
            <p className="mt-1 text-xs text-muted-foreground">Koppla under Kopplingar för att se mail här.</p>
          </div>
          <Button asChild size="sm" className="glow-sm">
            <Link to="/connections?q=gmail">Öppna Kopplingar</Link>
          </Button>
        </CardContent>
      </Card>
      <Card className="border-dashed border-border bg-card/40">
        <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Outlook</p>
            <p className="mt-1 text-xs text-muted-foreground">Koppla Microsoft 365 / Outlook under Kopplingar.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/connections?q=outlook">Öppna Kopplingar</Link>
          </Button>
        </CardContent>
      </Card>
    </m.div>
  );
}
