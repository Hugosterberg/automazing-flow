import { useState } from "react";
import { BookMarked, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { renderTemplate, useReplyTemplates, type ReplyTemplate } from "./useReplyTemplates";

interface EditorState {
  id?: string;
  name: string;
  body: string;
}

/**
 * "Templates" button for reply composers: pick a saved template to insert it
 * (with `{name}` filled from the recipient), or manage templates in a dialog.
 * Shared between Messages and Reviews so both tabs use the same library.
 */
export function ReplyTemplatePicker({
  onInsert,
  recipientName,
  disabled,
  className,
}: {
  onInsert: (text: string) => void;
  recipientName?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { templates, saveTemplate, deleteTemplate } = useReplyTemplates();
  const [manageOpen, setManageOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  function openEditor(template?: ReplyTemplate) {
    setEditor(template ? { id: template.id, name: template.name, body: template.body } : { name: "", body: "" });
  }

  function handleSave() {
    if (!editor) return;
    saveTemplate(editor);
    setEditor(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled} className={className}>
            <BookMarked className="h-4 w-4 mr-2" />
            Mallar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs">Svarsmallar</DropdownMenuLabel>
          {templates.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Inga mallar ännu — skapa en nedan.
            </p>
          ) : (
            templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onSelect={() => onInsert(renderTemplate(template.body, { name: recipientName }))}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="text-sm font-medium">{template.name}</span>
                <span className="text-xs text-muted-foreground line-clamp-1">{template.body}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Hantera mallar…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Svarsmallar</DialogTitle>
            <DialogDescription>
              Sparas per företagsprofil och finns i Meddelanden och Recensioner. Använd{" "}
              <code className="rounded bg-muted px-1">{"{name}"}</code> för att infoga mottagarens namn.
            </DialogDescription>
          </DialogHeader>

          {editor ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Namn</Label>
                <Input
                  id="template-name"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="t.ex. Tack för feedbacken"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-body">Meddelande</Label>
                <Textarea
                  id="template-body"
                  value={editor.body}
                  onChange={(e) => setEditor({ ...editor, body: e.target.value })}
                  placeholder="Hej {name}, tack för att du hörde av dig…"
                  className="min-h-[96px] text-sm"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setEditor(null)}>
                  Avbryt
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!editor.name.trim() || !editor.body.trim()}>
                  Spara mall
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Inga mallar ännu.</p>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{template.body}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEditor(template)}
                        aria-label={`Redigera mall ${template.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTemplate(template.id)}
                        aria-label={`Ta bort mall ${template.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <Button variant="outline" size="sm" onClick={() => openEditor()}>
                <Plus className="h-4 w-4 mr-2" />
                Ny mall
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
