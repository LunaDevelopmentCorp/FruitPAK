import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

interface NavLink {
  to: string;
  label: string;
}

interface NavSection {
  heading: string;
  items: NavLink[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Operations",
    items: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/grn-intake", label: "GRN Intake" },
    ],
  },
  {
    heading: "Inventory",
    items: [
      { to: "/batches", label: "Batches" },
      { to: "/pallets", label: "Pallets" },
      { to: "/containers", label: "Containers" },
      { to: "/packaging", label: "Packaging Stock" },
    ],
  },
  {
    heading: "People & Data",
    items: [
      { to: "/data", label: "Growers & Teams" },
      { to: "/clients", label: "Clients" },
    ],
  },
  {
    heading: "Finance",
    items: [
      { to: "/payments", label: "Grower Payments" },
      { to: "/team-payments", label: "Team Payments" },
      { to: "/reconciliation", label: "Reconciliation" },
    ],
  },
  {
    heading: "System",
    items: [{ to: "/setup", label: "Setup Wizard" }],
  },
];

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = user?.is_onboarded
    ? user?.role === "administrator"
      ? [
          ...NAV_SECTIONS,
          { heading: "", items: [{ to: "/admin", label: "Admin Panel" }] },
        ]
      : NAV_SECTIONS
    : [{ heading: "", items: [{ to: "/setup", label: "Setup Wizard" }] }];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 bg-white border-r flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b shrink-0">
          <Link
            to="/dashboard"
            className="text-lg font-bold text-green-700"
            onClick={() => setSidebarOpen(false)}
          >
            FruitPAK
          </Link>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {sections.map((section, i) => (
            <div key={section.heading || i}>
              {section.heading && (
                <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.heading}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`block px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? "bg-green-50 text-green-700 border-l-[3px] border-green-600 pl-[5px]"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t px-4 py-3 shrink-0">
          <p className="text-sm font-medium text-gray-700 truncate">
            {user?.full_name}
          </p>
          <button
            onClick={handleLogout}
            className="mt-1 text-xs text-gray-400 hover:text-red-600"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile hamburger + breadcrumb area) */}
        <header className="h-14 bg-white border-b flex items-center px-4 lg:px-6 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden mr-3 p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="text-sm text-gray-500">
            {sections
              .flatMap((s) => s.items)
              .find((item) => isActive(item.to))?.label || ""}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
