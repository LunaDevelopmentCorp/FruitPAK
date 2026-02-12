import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GrnIntake from "../pages/GrnIntake";

// Mock batches API
const mockSubmitGRN = vi.fn();
const mockListGrowers = vi.fn();
const mockListPackhouses = vi.fn();

vi.mock("../api/batches", () => ({
  submitGRN: (...args: any[]) => mockSubmitGRN(...args),
  listGrowers: () => mockListGrowers(),
  listPackhouses: () => mockListPackhouses(),
}));

describe("GRN Intake Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGrowers.mockResolvedValue([
      { id: "g1", name: "Test Grower", grower_code: "TG01" },
    ]);
    mockListPackhouses.mockResolvedValue([
      { id: "p1", name: "Main Packhouse" },
    ]);
  });

  it("renders the GRN form after loading reference data", async () => {
    render(
      <MemoryRouter>
        <GrnIntake />
      </MemoryRouter>,
    );

    // Should show loading state first
    expect(screen.getByText("Loading reference data...")).toBeInTheDocument();

    // After growers/packhouses load, form should appear
    await waitFor(() => {
      expect(screen.getByText("GRN Intake")).toBeInTheDocument();
    });

    expect(screen.getByText("Grower *")).toBeInTheDocument();
    expect(screen.getByText("Packhouse *")).toBeInTheDocument();
    expect(screen.getByText("Fruit Type *")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit GRN" })).toBeInTheDocument();
  });

  it("populates grower and packhouse dropdowns", async () => {
    render(
      <MemoryRouter>
        <GrnIntake />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Test Grower (TG01)")).toBeInTheDocument();
      expect(screen.getByText("Main Packhouse")).toBeInTheDocument();
    });
  });

  it("shows error when reference data fails to load", async () => {
    mockListGrowers.mockRejectedValue(new Error("Network error"));

    render(
      <MemoryRouter>
        <GrnIntake />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load growers/packhouses. Is the wizard complete?"),
      ).toBeInTheDocument();
    });
  });
});
