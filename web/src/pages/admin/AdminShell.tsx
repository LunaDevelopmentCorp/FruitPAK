import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

const ADMIN_TABS = [
  { to: "/admin/overview", label: "Overview" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/activity", label: "Activity" },
  { to: "/admin/deleted-items", label: "Deleted Items" },
];

export default function AdminShell() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user && user.role !== "administrator") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  if (user && user.role !== "administrator") return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Administration</h1>

      {/* Sub-nav tabs */}
      <div className="flex gap-1 mb-6 border-b pb-2">
        {ADMIN_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              location.pathname.startsWith(tab.to)
                ? "bg-green-50 text-green-700 border-b-2 border-green-600"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
