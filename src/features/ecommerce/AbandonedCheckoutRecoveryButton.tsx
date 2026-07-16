import { useState } from "react";
import { Copy, Loader2, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchOutreachDraft } from "@/features/outreach/outreachClient";

export function AbandonedCheckoutRecoveryButton({
  businessProfileId,
  email,
  cartTotal,
  currency,
  businessName,
}: {
  businessProfileId: string | null;
  email: string | null;
  cartTotal: number;
  currency: string;
  businessName?: string;
}) {
  const { t } = useTranslation("ecommerce");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  async function draftRecovery() {
    if (!businessProfileId) {
      toast.error(t("recovery.selectProfileFirst"));
      return;
    }
    setLoading(true);
    setOpen(true);
    try {
      const result = await fetchOutreachDraft({
        business_profile_id: businessProfileId,
        channel: "email",
        businessName,
        prospectEmail: email || undefined,
        prospectNotes: `Abandoned checkout recovery. Cart value: ${cartTotal} ${currency}. Gentle reminder to complete purchase.`,
        prospectReason: "recover abandoned cart",
      });
      setSubject(result.draft.subject || t("recovery.defaultSubject"));
      setBody(result.draft.body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.recoveryDraftFailed"));
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void draftRecovery()}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
        {t("recovery.createEmail")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("recovery.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {email ? t("recovery.draftTo", { email }) : t("recovery.anonymousCart")}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {subject ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("recovery.subjectPrefix")} </span>
                  {subject}
                </p>
              ) : null}
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed max-h-64 overflow-y-auto">
                {body}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      [subject ? `${t("recovery.subjectPrefix")} ${subject}` : "", body].filter(Boolean).join("\n\n")
                    );
                    toast.success(t("toasts.copied"));
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  {t("recovery.copy")}
                </Button>
                {email ? (
                  <Button type="button" size="sm" asChild>
                    <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                      {t("recovery.openInEmail")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
