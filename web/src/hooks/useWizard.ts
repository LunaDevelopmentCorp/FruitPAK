import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../api/client";
import {
  completeWizard,
  getWizardProgress,
  saveWizardStep,
  WizardProgress,
} from "../api/wizard";

const STEP_LABELS: Record<number, string> = {
  1: "Company & Exporter",
  2: "Packhouse Setup",
  3: "Suppliers",
  4: "Growers",
  5: "Harvest Teams",
  6: "Product & Packing",
  7: "Transport & Containers",
  8: "Financial Basics",
};

const STEP_PREREQUISITES: Record<number, number[]> = {
  1: [],
  2: [1],
  3: [1],
  4: [1],
  5: [4],
  6: [2, 4],
  7: [2],
  8: [2],
};

const TOTAL_STEPS = 8;

export function useWizard() {
  const [progress, setProgress] = useState<WizardProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWizardProgress();
      setProgress(data);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load wizard progress"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const save = useCallback(
    async (step: number, data: Record<string, unknown>, complete = false) => {
      setSaving(true);
      try {
        const updated = await saveWizardStep(step, data, complete);
        setProgress(updated);
        setError(null);
        return updated;
      } catch (err: unknown) {
        const detail = getErrorMessage(err, "Failed to save");
        setError(detail);
        throw new Error(detail);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await completeWizard();
      setProgress(updated);
      setError(null);
      return updated;
    } catch (err: unknown) {
      const detail = getErrorMessage(err, "Failed to complete wizard");
      setError(detail);
      throw new Error(detail);
    } finally {
      setSaving(false);
    }
  }, []);

  const canAccessStep = useCallback(
    (step: number): boolean => {
      if (!progress) return step === 1;
      const prereqs = STEP_PREREQUISITES[step] || [];
      return prereqs.every((p) => progress.completed_steps.includes(p));
    },
    [progress]
  );

  const isStepComplete = useCallback(
    (step: number): boolean => {
      return progress?.completed_steps.includes(step) ?? false;
    },
    [progress]
  );

  return {
    progress,
    loading,
    saving,
    error,
    save,
    finish,
    canAccessStep,
    isStepComplete,
    stepLabels: STEP_LABELS,
    totalSteps: TOTAL_STEPS,
    refetch: fetchProgress,
  };
}
