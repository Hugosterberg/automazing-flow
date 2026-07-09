import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PROFILE_FIELD_GUIDE,
  type BusinessProfileFormState,
  type ProfileFieldId,
} from "./businessProfileCompleteness";

type Props = {
  form: BusinessProfileFormState;
  onChange: (next: BusinessProfileFormState) => void;
  focusFieldId?: ProfileFieldId | null;
  disabled?: boolean;
};

export function BusinessProfileEditForm({ form, onChange, focusFieldId, disabled }: Props) {
  const baseId = useId();

  function patch(field: ProfileFieldId, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="space-y-5">
      {PROFILE_FIELD_GUIDE.map((field) => {
        const inputId = `${baseId}-${field.id}`;
        const value = form[field.id];
        const filled = value.trim().length > 0;

        return (
          <div
            key={field.id}
            id={`profile-field-${field.id}`}
            className={cn(
              "rounded-lg border p-4 space-y-2 scroll-mt-24 transition-colors",
              focusFieldId === field.id ? "border-primary/50 ring-1 ring-primary/20" : "border-border/70",
              field.id === "notes" && !filled && "border-primary/30 bg-primary/[0.03]"
            )}
          >
            <div className="space-y-1">
              <Label htmlFor={inputId} className="text-sm font-medium">
                {field.label}
                {field.id === "notes" ? (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Viktigast
                  </span>
                ) : null}
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">{field.why}</p>
              <p className="text-[11px] text-muted-foreground/90">
                Används i: {field.powers.join(" · ")}
              </p>
            </div>
            {field.multiline ? (
              <Textarea
                id={inputId}
                value={value}
                disabled={disabled}
                placeholder={field.placeholder}
                rows={4}
                className="text-sm leading-relaxed resize-y min-h-[96px]"
                onChange={(e) => patch(field.id, e.target.value)}
              />
            ) : (
              <Input
                id={inputId}
                value={value}
                disabled={disabled}
                placeholder={field.placeholder}
                type={field.id === "email" ? "email" : "text"}
                className="text-sm"
                onChange={(e) => patch(field.id, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
