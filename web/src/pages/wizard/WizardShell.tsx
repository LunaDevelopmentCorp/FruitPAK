import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useWizard } from "../../hooks/useWizard";

import Step1Company from "./steps/Step1Company";
import Step2Packhouse from "./steps/Step2Packhouse";
import Step3Suppliers from "./steps/Step3Suppliers";
import Step4Growers from "./steps/Step4Growers";
import Step5HarvestTeams from "./steps/Step5HarvestTeams";
import Step6ProductPacking from "./steps/Step6ProductPacking";
import Step7Transport from "./steps/Step7Transport";
import Step8Financial from "./steps/Step8Financial";

const STEP_COMPONENTS: Record<number, React.FC<StepProps>> = {
  1: Step1Company,
  2: Step2Packhouse,
  3: Step3Suppliers,
  4: Step4Growers,
  5: Step5HarvestTeams,
  6: Step6ProductPacking,
  7: Step7Transport,
  8: Step8Financial,
};

export interface StepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: any, complete: boolean) => Promise<void>;
  saving: boolean;
  draftData: Record<string, unknown> | null;
}

function Spinner() {
  return (
    <svg
      className="animate-spin -ml-1 mr-1.5 h-4 w-4 inline-block"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export { Spinner };

export default function WizardShell() {
  const {
    progress,
    loading,
    saving,
    error,
    save,
    finish,
    canAccessStep,
    isStepComplete,
    stepLabels,
    totalSteps,
  } = useWizard();

  const [activeStep, setActiveStep] = useState(progress?.current_step ?? 1);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sync activeStep when progress loads
  React.useEffect(() => {
    if (progress) setActiveStep(progress.current_step);
  }, [progress?.current_step]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
        <p className="text-gray-500 ml-2">Loading wizard...</p>
      </div>
    );
  }

  const completedCount = progress?.completed_steps.length ?? 0;
  const progressPct = (completedCount / totalSteps) * 100;

  // Setup Complete — show summary with option to edit
  if (progress?.is_complete && !editMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-green-700">Setup Complete</h1>
          <p className="mt-2 text-gray-600">
            Your enterprise is configured and operational.
          </p>
          <div className="mt-6 flex flex-col gap-3 items-center">
            <button
              onClick={() => setEditMode(true)}
              className="bg-white border border-green-600 text-green-700 px-6 py-2 rounded text-sm font-medium hover:bg-green-50"
            >
              Review & Edit Settings
            </button>
            <Link
              to="/"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const StepComponent = STEP_COMPONENTS[activeStep];
  // Load draft data for current step, or completed data for revisited steps
  const draftData =
    (activeStep === progress?.current_step ? progress.draft_data : null)
    ?? progress?.completed_data?.[String(activeStep)]
    ?? null;

  const handleSave = async (
    data: Record<string, unknown>,
    complete: boolean
  ) => {
    await save(activeStep, data, complete);
    showToast(complete ? "Step completed!" : "Draft saved.");
  };

  const handleFinish = async () => {
    await finish();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded shadow-lg text-sm animate-[slideIn_0.3s_ease-out]">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-green-700">FruitPAK Setup</h1>
            <p className="text-sm text-gray-500 mt-1">
              {editMode
                ? "Editing configuration"
                : `Step ${activeStep} of ${totalSteps}`}
            </p>
          </div>
          {editMode && (
            <Link
              to="/"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back to Dashboard
            </Link>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{completedCount} of {totalSteps} steps complete</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Mobile step indicator */}
      <nav className="md:hidden overflow-x-auto border-b bg-white px-4 py-2">
        <div className="flex gap-2 min-w-max">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
            const accessible = editMode || canAccessStep(step);
            const completed = isStepComplete(step);
            const active = step === activeStep;
            return (
              <button
                key={step}
                onClick={() => accessible && setActiveStep(step)}
                disabled={!accessible}
                className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center ${
                  active
                    ? "bg-green-600 text-white"
                    : completed
                    ? "bg-green-100 text-green-700"
                    : accessible
                    ? "bg-gray-100 text-gray-600"
                    : "bg-gray-50 text-gray-300"
                }`}
              >
                {completed ? "\u2713" : step}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar — desktop only */}
        <nav className="hidden md:block w-64 bg-white border-r min-h-screen p-4">
          <ul className="space-y-1">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
              const accessible = editMode || canAccessStep(step);
              const completed = isStepComplete(step);
              const active = step === activeStep;
              return (
                <li key={step}>
                  <button
                    onClick={() => accessible && setActiveStep(step)}
                    disabled={!accessible}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      active
                        ? "bg-green-50 text-green-700 font-medium"
                        : completed
                        ? "text-green-600"
                        : accessible
                        ? "text-gray-700 hover:bg-gray-50"
                        : "text-gray-300 cursor-not-allowed"
                    }`}
                  >
                    <span className="mr-2">
                      {completed ? "\u2713" : `${step}.`}
                    </span>
                    {stepLabels[step]}
                    {step === 8 && (
                      <span className="ml-1 text-xs text-gray-400">
                        (optional)
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Finish button — only show when not in edit mode */}
          {!editMode && (
            <div className="mt-6 pt-4 border-t">
              <button
                onClick={handleFinish}
                disabled={saving}
                className="w-full bg-green-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? <Spinner /> : null}
                Complete Setup
              </button>
            </div>
          )}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <h2 className="text-lg font-semibold mb-4">
            {stepLabels[activeStep]}
          </h2>

          {StepComponent && (
            <StepComponent
              onSave={handleSave}
              saving={saving}
              draftData={draftData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
