import { useCallback, useMemo } from "react";
import { useProfileDocument } from "@/features/profile-documents";

export interface ReplyTemplate {
  id: string;
  name: string;
  body: string;
}

/**
 * Reusable reply templates, persisted server-side per business profile via
 * `profile_documents` (same durability model as review reply state). Templates
 * support a `{name}` placeholder that callers substitute with the recipient's
 * name at insert time.
 */
export function useReplyTemplates() {
  const doc = useProfileDocument<ReplyTemplate[]>("reply-templates", []);

  const templates = useMemo(
    () => (Array.isArray(doc.data) ? doc.data.filter((t) => t && t.id && t.name) : []),
    [doc.data]
  );

  const saveTemplate = useCallback(
    (template: { id?: string; name: string; body: string }) => {
      const name = template.name.trim();
      const body = template.body.trim();
      if (!name || !body) return;
      if (template.id) {
        doc.save(templates.map((t) => (t.id === template.id ? { ...t, name, body } : t)));
      } else {
        doc.save([...templates, { id: crypto.randomUUID(), name, body }]);
      }
    },
    [doc, templates]
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      doc.save(templates.filter((t) => t.id !== id));
    },
    [doc, templates]
  );

  return {
    templates,
    isLoading: doc.isLoading,
    saveTemplate,
    deleteTemplate,
  };
}

/** Fill the supported placeholders in a template body. */
export function renderTemplate(body: string, context: { name?: string }): string {
  const name = (context.name || "").trim() || "there";
  return body.split("{name}").join(name);
}
