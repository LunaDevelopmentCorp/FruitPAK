import api from "./client";

export interface WizardProgress {
  current_step: number;
  completed_steps: number[];
  is_complete: boolean;
  draft_data: Record<string, unknown> | null;
  completed_data: Record<string, Record<string, unknown>>;
}

export async function getWizardProgress(): Promise<WizardProgress> {
  const { data } = await api.get<WizardProgress>("/wizard/");
  return data;
}

export async function saveWizardStep(
  step: number,
  body: Record<string, unknown>,
  complete: boolean = false
): Promise<WizardProgress> {
  const { data } = await api.patch<WizardProgress>(
    `/wizard/step/${step}?complete=${complete}`,
    body
  );
  return data;
}

export async function completeWizard(): Promise<WizardProgress> {
  const { data } = await api.post<WizardProgress>("/wizard/complete");
  return data;
}
