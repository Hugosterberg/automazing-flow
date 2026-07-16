import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CalendarEventFormValues = {
  title: string;
  date: string;
  time: string;
  description: string;
  isAutomated: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEventId: string | null;
  values: CalendarEventFormValues;
  onChange: (patch: Partial<CalendarEventFormValues>) => void;
  onSave: () => void;
};

/** Create / edit dialog for local calendar events. */
export function CalendarEventDialog({
  open,
  onOpenChange,
  editingEventId,
  values,
  onChange,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>{editingEventId ? "Redigera aktivitet" : "Lägg till aktivitet"}</DialogTitle>
          <DialogDescription>
            {editingEventId
              ? "Uppdatera den här kalenderposten."
              : "Lägg till en aktivitet eller automatiserad uppgift i kalendern"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="cal-date">Datum</Label>
            <Input
              id="cal-date"
              type="date"
              value={values.date}
              onChange={(e) => onChange({ date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-title">Titel</Label>
            <Input
              id="cal-title"
              placeholder="T.ex. teammöte, schemalagt inlägg"
              value={values.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-time">Tid (valfritt)</Label>
            <Input
              id="cal-time"
              type="time"
              value={values.time}
              onChange={(e) => onChange({ time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-description">Beskrivning (valfritt)</Label>
            <Textarea
              id="cal-description"
              value={values.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
              placeholder="Anteckningar eller agenda"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="cal-auto" className="font-medium">
                Automatiserad uppgift
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Körs automatiskt vid angiven tid
              </p>
            </div>
            <Switch
              id="cal-auto"
              checked={values.isAutomated}
              onCheckedChange={(checked) => onChange({ isAutomated: checked })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={onSave} disabled={!values.title.trim()}>
            {editingEventId ? "Spara" : "Lägg till"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
