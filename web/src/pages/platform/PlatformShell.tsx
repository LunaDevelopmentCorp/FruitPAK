import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

export default function PlatformShell() {
  const { t } = useTranslation("platform");
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  const PLATFORM_TABS = [
    { to: "/platform/stats", label: t("tabs.stats") },
    { to: "/platform/enterprises", label: t("tabs.enterprises") },
    { to: "/platform/users", label: t("tabs.users") },
  ];

  useEffect(() => {
    if (user && user.role !== "platform_admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  if (user && user.role !== "platform_admin") return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-6">Cross-tenant administration</p>

      <div className="flex gap-1 mb-6 border-b pb-2">
        {PLATFORM_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              location.pathname.startsWith(tab.to)
                ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
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
