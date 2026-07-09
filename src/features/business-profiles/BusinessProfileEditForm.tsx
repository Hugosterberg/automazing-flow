import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PROFILE_FIELD_SECTIONS,
  formFieldKey,
  getProfileField,
  type BusinessProfileFormState,
  type ProfileFieldId,
} from "./businessProfileCompleteness";
import { Badge } from "@/components/ui/badge";

type Props = {
  form: BusinessProfileFormState;
  onChange: (next: BusinessProfileFormState) => void;
  focusFieldId?: ProfileFieldId | null;
  disabled?: boolean;
};

export function BusinessProfileEditForm({ form, onChange, focusFieldId, disabled }: Props) {
  const baseId = useId();

  function patch(field: ProfileFieldId, value: string) {
    onChange({ ...form, [formFieldKey(field)]: value });
  }

  return (
    <div className="space-y-8">
      {PROFILE_FIELD_SECTIONS.map((section) => {
        const fields = section.fields.map((id) => getProfileField(id));
        return (
          <section key={section.id} className="space-y-4">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                {section.id === "identity" && form.orgNumber.trim() ? (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    Org.nr {form.orgNumber.trim()}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{section.description}</p>
            </div>
            <div className="space-y-4">
              {fields.map((field) => {
                const inputId = `${baseId}-${field.id}`;
                const value = form[formFieldKey(field.id)];
                const filled = value.trim().length > 0;
                const isNotes = field.id === "notes";

                return (
                  <div
                    key={field.id}
                    id={`profile-field-${field.id}`}
                    className={cn(
                      "rounded-lg border p-4 space-y-2 scroll-mt-24 transition-colors",
                      focusFieldId === field.id ? "border-primary/50 ring-1 ring-primary/20" : "border-border/70",
                      isNotes && !filled && "border-primary/30 bg-primary/[0.03]"
                    )}
                  >
                    <div className="space-y-1">
                      <Label htmlFor={inputId} className="text-sm font-medium">
                        {field.label}
                        {isNotes ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Viktigast
                          </span>
                        ) : null}
                      </Label>
                      <p className="text-xs text-muted-foreground">{field.why}</p>
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
          </section>
        );
      })}
    </div>
  );
}
