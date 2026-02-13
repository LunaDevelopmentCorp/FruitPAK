import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const NAV_ITEMS_FULL = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/setup", label: "Setup Wizard" },
  { to: "/grn-intake", label: "GRN Intake" },
  { to: "/batches", label: "Batches" },
  { to: "/pallets", label: "Pallets" },
  { to: "/containers", label: "Containers" },
  { to: "/payments", label: "Payments" },
  { to: "/reconciliation", label: "Reconciliation" },
];

const NAV_ITEMS_SETUP = [
  { to: "/setup", label: "Setup Wizard" },
];

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = user?.is_onboarded ? NAV_ITEMS_FULL : NAV_ITEMS_SETUP;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-8">
              <Link to="/dashboard" className="text-lg font-bold text-green-700">
                FruitPAK
              </Link>
              <nav className="hidden sm:flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`px-3 py-2 rounded text-sm font-medium ${
                      location.pathname === item.to
                        ? "bg-green-50 text-green-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{user?.full_name}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-red-600"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
