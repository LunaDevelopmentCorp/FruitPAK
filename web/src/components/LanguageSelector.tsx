import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";
import { updateMe } from "../api/auth";
import { useAuthStore } from "../store/authStore";

interface Props {
  className?: string;
}

export default function LanguageSelector({ className = "" }: Props) {
  const { i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const handleChange = async (lang: string) => {
    i18n.changeLanguage(lang);

    // Persist to backend if user is logged in
    if (user) {
      try {
        await updateMe({ preferred_language: lang });
      } catch {
        // Silent fail — language still changes locally
      }
    }
  };

  return (
    <select
      value={i18n.language}
      onChange={(e) => handleChange(e.target.value)}
      className={`text-xs border rounded px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500 ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
