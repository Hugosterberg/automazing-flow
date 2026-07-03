import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchAutomationSettings,
  saveAutomationSettings,
  type AutomationSettings,
} from "./automationService";
import {
  defaultScheduleForKey,
  type JobSchedulesMap,
  type ProfileJobSchedule,
} from "@/lib/profileJobSchedule";

export function useAutomationSchedules(businessProfileId: string | null) {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [draftSchedules, setDraftSchedules] = useState<JobSchedulesMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!businessProfileId) {
      setSettings(null);
      setDraftSchedules(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAutomationSettings(businessProfileId)
      .then((payload) => {
        if (cancelled) return;
        setSettings(payload.settings);
        setDraftSchedules(payload.settings.jobSchedules);
        setDirtyKeys(new Set());
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Kunde inte ladda scheman.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessProfileId]);

  const patchSchedule = useCallback((cronKey: string, next: ProfileJobSchedule) => {
    setDraftSchedules((prev) => {
      const base = prev ?? settings?.jobSchedules ?? {};
      return { ...base, [cronKey]: next };
    });
    setDirtyKeys((prev) => new Set(prev).add(cronKey));
  }, [settings?.jobSchedules]);

  const scheduleFor = useCallback(
    (cronKey: string): ProfileJobSchedule => {
      return (
        draftSchedules?.[cronKey] ??
        settings?.jobSchedules?.[cronKey] ??
        defaultScheduleForKey(cronKey)
      );
    },
    [draftSchedules, settings?.jobSchedules]
  );

  const saveSchedule = useCallback(
    async (cronKey: string) => {
      if (!businessProfileId || !draftSchedules || !settings) return;
      setSavingKey(cronKey);
      try {
        const schedule = draftSchedules[cronKey] ?? scheduleFor(cronKey);
        const payload = await saveAutomationSettings(businessProfileId, {
          ...(settings as AutomationSettings),
          jobSchedules: { [cronKey]: schedule },
        });
        setSettings(payload.settings);
        setDraftSchedules(payload.settings.jobSchedules);
        setDirtyKeys((prev) => {
          const next = new Set(prev);
          next.delete(cronKey);
          return next;
        });
        toast.success("Schema sparat");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Kunde inte spara schema.");
      } finally {
        setSavingKey(null);
      }
    },
    [businessProfileId, draftSchedules, scheduleFor, settings]
  );

  return {
    loading,
    settings,
    scheduleFor,
    patchSchedule,
    saveSchedule,
    savingKey,
    isDirty: (cronKey: string) => dirtyKeys.has(cronKey),
  };
}
