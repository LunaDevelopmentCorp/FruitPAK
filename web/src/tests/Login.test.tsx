import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../pages/Login";

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: "/login" }),
  };
});

// Mock auth store
vi.mock("../store/authStore", () => ({
  useAuthStore: (selector: (s: any) => any) =>
    selector({ setAuth: vi.fn() }),
}));

// Mock login API
const mockLogin = vi.fn();
vi.mock("../api/auth", () => ({
  login: (...args: any[]) => mockLogin(...args),
}));

describe("Login Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email and password fields", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByText("FruitPAK")).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("admin@testfarm.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows error on invalid credentials", async () => {
    mockLogin.mockRejectedValueOnce({
      response: { status: 401, data: { detail: "Invalid credentials" } },
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("admin@testfarm.com"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrongpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
    });
  });

  it("navigates to dashboard on successful login", async () => {
    mockLogin.mockResolvedValueOnce({
      access_token: "fake-token",
      refresh_token: "fake-refresh",
      user: {
        id: "user-1",
        email: "admin@testfarm.com",
        full_name: "Admin",
        phone: null,
        role: "administrator",
        is_active: true,
        enterprise_id: "ent-1",
        permissions: ["*"],
        assigned_packhouses: null,
      },
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("admin@testfarm.com"), {
      target: { value: "admin@testfarm.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows loading state while submitting", async () => {
    // Never-resolving promise to keep loading state active
    mockLogin.mockReturnValueOnce(new Promise(() => {}));

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("admin@testfarm.com"), {
      target: { value: "admin@testfarm.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });
  });
});
