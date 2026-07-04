import { useState } from "react";
import { Copy, Loader2, Mail } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  async function draftRecovery() {
    if (!businessProfileId) {
      toast.error("Select a business profile first.");
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
      setSubject(result.draft.subject || "Complete your order");
      setBody(result.draft.body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not draft recovery email");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void draftRecovery()}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
        Draft recovery
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cart recovery email</DialogTitle>
            <DialogDescription>
              {email ? `Draft for ${email}` : "Anonymous checkout — copy and send manually."}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {subject ? <p className="text-sm"><span className="text-muted-foreground">Subject: </span>{subject}</p> : null}
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed max-h-64 overflow-y-auto">
                {body}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText([subject ? `Subject: ${subject}` : "", body].filter(Boolean).join("\n\n"));
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy
                </Button>
                {email ? (
                  <Button type="button" size="sm" asChild>
                    <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                      Open in email
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
