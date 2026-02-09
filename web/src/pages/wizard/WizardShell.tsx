import React, { useState } from "react";
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
  onSave: (data: Record<string, unknown>, complete: boolean) => Promise<void>;
  saving: boolean;
  draftData: Record<string, unknown> | null;
}

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

  // Sync activeStep when progress loads
  React.useEffect(() => {
    if (progress) setActiveStep(progress.current_step);
  }, [progress?.current_step]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading wizard...</p>
      </div>
    );
  }

  if (progress?.is_complete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-green-700">Setup Complete</h1>
          <p className="mt-2 text-gray-600">
            Your enterprise has been configured. You can now start operations.
          </p>
        </div>
      </div>
    );
  }

  const StepComponent = STEP_COMPONENTS[activeStep];
  const draftData =
    activeStep === progress?.current_step ? progress.draft_data : null;

  const handleSave = async (
    data: Record<string, unknown>,
    complete: boolean
  ) => {
    await save(activeStep, data, complete);
  };

  const handleFinish = async () => {
    await finish();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-green-700">FruitPAK Setup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Step {activeStep} of {totalSteps}
        </p>
      </div>

      <div className="flex">
        {/* Sidebar — step navigation */}
        <nav className="w-64 bg-white border-r min-h-screen p-4">
          <ul className="space-y-1">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
              const accessible = canAccessStep(step);
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

          {/* Finish button */}
          <div className="mt-6 pt-4 border-t">
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full bg-green-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Complete Setup
            </button>
          </div>
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
