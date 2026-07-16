import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/context/AccountsContext";
import { useBusinessProfiles } from "@/features/business-profiles";

/**
 * Data & privacy surface — delete cascade already exists; this makes it findable.
 */
export function PreferencesDataSection() {
  const { activeProfile, profiles, removeProfile, activeProfileId } = useAccounts();
  const { profiles: businessProfiles } = useBusinessProfiles();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const bp = businessProfiles.find((p) => p.id === activeProfileId) ?? null;
  const canDelete = Boolean(activeProfile && profiles.length > 0);

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data & integritet
          </CardTitle>
          <CardDescription>
            Din data hör till den aktiva företagsprofilen. När du tar bort en profil raderas även
            dess kopplingar, hemligheter och profildokument ur databasen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
            <li>Kopplingar och tokens hör till profilen — de följer inte med till andra profiler.</li>
            <li>Teammedlemmar (Inställningar → Team) ser samma profildata efter inbjudan.</li>
            <li>
              Formella användarvillkor / privacy-policy publiceras separat. Tills dess gäller: du
              äger din data och kan radera profilen här.
            </li>
          </ul>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Radera aktiv profil</p>
            <p className="text-xs text-muted-foreground">
              {bp || activeProfile ? (
                <>
                  Tar bort{" "}
                  <span className="font-medium text-foreground">
                    {bp?.name || activeProfile?.name}
                  </span>{" "}
                  och all tillhörande data. Detta går inte att ångra.
                </>
              ) : (
                "Ingen aktiv profil vald."
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                disabled={!canDelete}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Radera profil
              </Button>
              <Button asChild type="button" size="sm" variant="outline" className="h-8 text-xs">
                <Link to="/company">Öppna Företag</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ta bort profilen &quot;{activeProfile?.name || ""}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Kopplingar, köer, dokument och synkad data för den här profilen raderas. Andra
              profiler i ditt konto påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (activeProfile) void removeProfile(activeProfile.id);
                setConfirmOpen(false);
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
