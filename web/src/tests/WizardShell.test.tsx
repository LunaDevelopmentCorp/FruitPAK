import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WizardShell from "../pages/wizard/WizardShell";

// Mock useWizard hook
const mockSave = vi.fn();
const mockFinish = vi.fn();

vi.mock("../../hooks/useWizard", () => ({
  useWizard: () => ({
    progress: {
      current_step: 1,
      completed_steps: [],
      is_complete: false,
      draft_data: null,
      completed_data: {},
    },
    loading: false,
    saving: false,
    error: null,
    save: mockSave,
    finish: mockFinish,
    canAccessStep: (step: number) => step <= 1,
    isStepComplete: () => false,
    stepLabels: {
      1: "Company & Exporter",
      2: "Packhouse Setup",
      3: "Suppliers",
      4: "Grower Registration",
      5: "Harvest Teams",
      6: "Product & Packing",
      7: "Transport",
      8: "Financial Config",
    },
    totalSteps: 8,
  }),
}));

// Mock all step components
vi.mock("../pages/wizard/steps/Step1Company", () => ({
  default: ({ onSave }: any) => (
    <div data-testid="step1">
      <button onClick={() => onSave({ trading_name: "Test" }, true)}>
        Complete Step 1
      </button>
    </div>
  ),
}));
vi.mock("../pages/wizard/steps/Step2Packhouse", () => ({
  default: () => <div data-testid="step2">Step 2</div>,
}));
vi.mock("../pages/wizard/steps/Step3Suppliers", () => ({
  default: () => <div data-testid="step3">Step 3</div>,
}));
vi.mock("../pages/wizard/steps/Step4Growers", () => ({
  default: () => <div data-testid="step4">Step 4</div>,
}));
vi.mock("../pages/wizard/steps/Step5HarvestTeams", () => ({
  default: () => <div data-testid="step5">Step 5</div>,
}));
vi.mock("../pages/wizard/steps/Step6ProductPacking", () => ({
  default: () => <div data-testid="step6">Step 6</div>,
}));
vi.mock("../pages/wizard/steps/Step7Transport", () => ({
  default: () => <div data-testid="step7">Step 7</div>,
}));
vi.mock("../pages/wizard/steps/Step8Financial", () => ({
  default: () => <div data-testid="step8">Step 8</div>,
}));

describe("Wizard Shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the wizard header and progress bar", async () => {
    render(
      <MemoryRouter>
        <WizardShell />
      </MemoryRouter>,
    );

    expect(screen.getByText("FruitPAK Setup")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 8")).toBeInTheDocument();
    expect(screen.getByText("0 of 8 steps complete")).toBeInTheDocument();
  });

  it("renders step 1 component", async () => {
    render(
      <MemoryRouter>
        <WizardShell />
      </MemoryRouter>,
    );

    expect(screen.getByText("Company & Exporter")).toBeInTheDocument();
    expect(screen.getByTestId("step1")).toBeInTheDocument();
  });

  it("shows Complete Setup button in sidebar", () => {
    render(
      <MemoryRouter>
        <WizardShell />
      </MemoryRouter>,
    );

    expect(screen.getByText("Complete Setup")).toBeInTheDocument();
  });
});
