import { useEffect, useState } from "react";
import { getFinancialSummary, FinancialSummary } from "../api/config";

let cachedConfig: FinancialSummary | null = null;

export function useFinancialConfig() {
  const [config, setConfig] = useState<FinancialSummary | null>(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig) return;
    getFinancialSummary()
      .then((data) => {
        cachedConfig = data;
        setConfig(data);
      })
      .catch(() => {
        const fallback: FinancialSummary = { base_currency: "ZAR", export_currencies: [] };
        cachedConfig = fallback;
        setConfig(fallback);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    baseCurrency: config?.base_currency ?? "ZAR",
    exportCurrencies: config?.export_currencies ?? [],
    loading,
  };
}

export function invalidateFinancialConfigCache() {
  cachedConfig = null;
}
