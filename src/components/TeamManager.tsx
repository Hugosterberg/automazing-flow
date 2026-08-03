import { useState } from "react";
import { Loader2, Mail, RotateCw, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { apiJson } from "@/lib/apiJson";

type Member = {
  userId: string;
  role: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Ägare",
  admin: "Admin",
  editor: "Redaktör",
  member: "Medlem", // legacy alias for editor on old rows
  viewer: "Läsare",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-primary/10 text-primary border-primary/20",
  admin: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400",
  editor: "bg-muted text-muted-foreground border-border",
  member: "bg-muted text-muted-foreground border-border",
  viewer: "bg-muted text-muted-foreground border-border",
};

function initials(name: string | null, email: string | null): string {
  const source = name || email || "?";
  return source.split(/[\s@]/)[0].slice(0, 2).toUpperCase();
}

interface Props {
  businessProfileId: string;
}

export function TeamManager({ businessProfileId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PendingInvite | null>(null);

  const { data, isLoading } = useQuery<{ members: Member[]; pendingInvites: PendingInvite[] }>({
    queryKey: ["team-members", businessProfileId],
    queryFn: () =>
      apiJson<{ members: Member[]; pendingInvites: PendingInvite[] }>(
        `/api/team/members?business_profile_id=${encodeURIComponent(businessProfileId)}`,
        "Kunde inte hämta teammedlemmar"
      ),
    enabled: Boolean(businessProfileId),
  });

  const inviteMut = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return apiJson<{ ok?: boolean; invited?: boolean; hadAccount?: boolean }>(
        "/api/team/invite",
        "Inbjudan misslyckades",
        {
          body: {
            email,
            role,
            business_profile_id: businessProfileId,
            app_origin: window.location.origin,
          },
        }
      );
    },
    onSuccess: (result) => {
      const email = inviteEmail;
      if (result?.hadAccount) {
        toast({
          title: "Tillagd i teamet",
          description: `${email} hade redan konto och ser profilen nu.`,
        });
      } else {
        toast({
          title: "Inbjudan skickad",
          description: `${email} kan logga in och går med automatiskt.`,
        });
      }
      setInviteEmail("");
      void qc.invalidateQueries({ queryKey: ["team-members", businessProfileId] });
    },
    onError: (err: Error) => {
      toast({ title: "Kunde inte skicka inbjudan", description: err.message, variant: "destructive" });
    },
  });

  const resendMut = useMutation({
    mutationFn: async (inviteId: string) => {
      return apiJson(
        `/api/team/invite/${encodeURIComponent(inviteId)}/resend?business_profile_id=${encodeURIComponent(businessProfileId)}`,
        "Kunde inte skicka om inbjudan",
        { body: { business_profile_id: businessProfileId, app_origin: window.location.origin } }
      );
    },
    onSuccess: () => {
      toast({ title: "Inbjudan skickad igen" });
    },
    onError: (err: Error) => {
      toast({ title: "Kunde inte skicka om", description: err.message, variant: "destructive" });
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiJson(
        `/api/team/invite/${encodeURIComponent(inviteId)}?business_profile_id=${encodeURIComponent(businessProfileId)}`,
        "Kunde inte avbryta inbjudan",
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      toast({ title: "Inbjudan avbruten" });
      setRevokeTarget(null);
      void qc.invalidateQueries({ queryKey: ["team-members", businessProfileId] });
    },
    onError: (err: Error) => {
      toast({ title: "Kunde inte avbryta", description: err.message, variant: "destructive" });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (userId: string) => {
      await apiJson(
        `/api/team/members/${encodeURIComponent(userId)}?business_profile_id=${encodeURIComponent(businessProfileId)}`,
        "Borttagning misslyckades",
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      toast({ title: "Teammedlem borttagen" });
      setRemoveTarget(null);
      void qc.invalidateQueries({ queryKey: ["team-members", businessProfileId] });
    },
    onError: (err: Error) => {
      toast({ title: "Kunde inte ta bort", description: err.message, variant: "destructive" });
    },
  });

  const members = data?.members ?? [];
  const pendingInvites = data?.pendingInvites ?? [];
  const currentUserRole = members.find((m) => m.userId === user?.id)?.role ?? null;
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMut.mutate({ email: inviteEmail.trim(), role: inviteRole });
  }

  return (
    <div className="space-y-6">
      {/* Member list */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>Teammedlemmar</span>
          {!isLoading && (
            <span className="text-muted-foreground font-normal">({members.length})</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar teammedlemmar…
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Inga teammedlemmar ännu.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 px-4 py-3 bg-card">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs bg-muted">
                    {initials(member.displayName, member.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.displayName ?? member.email ?? "Okänd"}
                  </p>
                  {member.displayName && member.email && (
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${ROLE_COLORS[member.role] ?? ""}`}
                >
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
                {canManage && member.role !== "owner" && member.userId !== user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setRemoveTarget(member)}
                    aria-label={`Ta bort ${member.email ?? member.displayName ?? ""}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending invites */}
      {!isLoading && pendingInvites.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>Väntande inbjudningar</span>
            <span className="text-muted-foreground font-normal">({pendingInvites.length})</span>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-dashed border-border overflow-hidden">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs bg-muted">
                    {initials(null, invite.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">Väntar på att gå med</p>
                </div>
                <Badge variant="outline" className={`text-xs shrink-0 ${ROLE_COLORS[invite.role] ?? ""}`}>
                  {ROLE_LABELS[invite.role] ?? invite.role}
                </Badge>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => resendMut.mutate(invite.id)}
                      disabled={resendMut.isPending}
                      aria-label={`Skicka om inbjudan till ${invite.email}`}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setRevokeTarget(invite)}
                      aria-label={`Avbryt inbjudan till ${invite.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite form */}
      {canManage && (
        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            Bjud in en kollega
          </div>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="invite-email" className="sr-only">E-postadress</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="kollega@foretag.se"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Redaktör</SelectItem>
                <SelectItem value="viewer">Läsare</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={inviteMut.isPending || !inviteEmail.trim()} className="shrink-0">
              {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-2">Bjud in</span>
            </Button>
          </form>
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              De ser bara denna profil, inga andra. <strong>Admin</strong> kan hantera kopplingar och
              teammedlemmar. <strong>Redaktör</strong> kan se och använda alla funktioner.{" "}
              <strong>Läsare</strong> kan bara se data.
            </span>
          </div>
        </div>
      )}

      {/* Remove member confirm dialog */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort teammedlem?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.displayName ?? removeTarget?.email ?? "Denna person"} kommer att förlora
              åtkomst till detta företagsprofil. De kan bjudas in igen senare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeMut.mutate(removeTarget.userId)}
            >
              {removeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke invite confirm dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avbryt inbjudan?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.email} kommer inte längre kunna gå med genom länken i mailet. Du kan
              bjuda in samma e-postadress igen senare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stäng</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}
            >
              {revokeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Avbryt inbjudan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
