import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  expandRunTimes,
  formatScheduleSummarySv,
  ISO_WEEKDAYS,
  WEEKDAY_LABELS_SV,
  type ProfileJobSchedule,
} from "@/lib/profileJobSchedule";

interface AutomationScheduleEditorProps {
  cronKey: string;
  schedule: ProfileJobSchedule;
  disabled?: boolean;
  saving?: boolean;
  dirty?: boolean;
  onChange: (next: ProfileJobSchedule) => void;
  onSave: () => void;
}

export function AutomationScheduleEditor({
  schedule,
  disabled,
  saving,
  dirty,
  onChange,
  onSave,
}: AutomationScheduleEditorProps) {
  function toggleDay(day: number) {
    const has = schedule.days.includes(day);
    const days = has
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day].sort((a, b) => a - b);
    onChange({ ...schedule, days: days.length > 0 ? days : [day] });
  }

  const previewTimes = expandRunTimes(schedule);

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-foreground">Aktiverad</p>
          <p className="text-[11px] text-muted-foreground">
            {schedule.enabled ? formatScheduleSummarySv(schedule) : "Av — körs inte"}
          </p>
        </div>
        <Switch
          checked={schedule.enabled}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ ...schedule, enabled: checked })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Dagar</Label>
        <div className="flex flex-wrap gap-1.5">
          {ISO_WEEKDAYS.map((day) => (
            <label
              key={day}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] cursor-pointer"
            >
              <Checkbox
                checked={schedule.days.includes(day)}
                disabled={disabled}
                onCheckedChange={() => toggleDay(day)}
              />
              {WEEKDAY_LABELS_SV[day]}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Gånger per dag</Label>
          <Select
            value={String(schedule.timesPerDay)}
            disabled={disabled}
            onValueChange={(v) => onChange({ ...schedule, timesPerDay: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Första körning</Label>
          <Input
            type="time"
            className="h-8 text-xs"
            value={schedule.startTime}
            disabled={disabled}
            onChange={(e) => onChange({ ...schedule, startTime: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sista körning</Label>
          <Input
            type="time"
            className="h-8 text-xs"
            value={schedule.endTime}
            disabled={disabled || schedule.timesPerDay <= 1}
            onChange={(e) => onChange({ ...schedule, endTime: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tidszon</Label>
          <Input
            className="h-8 text-xs"
            value={schedule.timezone}
            disabled={disabled}
            placeholder="Europe/Stockholm"
            onChange={(e) => onChange({ ...schedule, timezone: e.target.value })}
          />
        </div>
      </div>

      {schedule.timesPerDay > 1 ? (
        <p className="text-[11px] text-muted-foreground">
          Körningar: {previewTimes.join(" · ")}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" disabled={disabled || saving || !dirty} onClick={onSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          Spara schema
        </Button>
      </div>
    </div>
  );
}
