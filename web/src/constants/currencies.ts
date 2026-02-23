/**
 * Shared currency definitions, symbols, and country-to-currency mapping.
 * Single source of truth — all pages import from here.
 */

export interface CurrencyDef {
  code: string;   // ISO 4217
  name: string;
  symbol: string;
}

export const CURRENCIES: CurrencyDef[] = [
  // Africa
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "XOF", name: "CFA Franc (BCEAO)", symbol: "CFA" },
  { code: "XAF", name: "CFA Franc (BEAC)", symbol: "FCFA" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "\u20B5" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "NGN", name: "Nigerian Naira", symbol: "\u20A6" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E\u00A3" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD" },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh" },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br" },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT" },
  { code: "MUR", name: "Mauritian Rupee", symbol: "\u20A8" },
  { code: "NAD", name: "Namibian Dollar", symbol: "N$" },
  { code: "BWP", name: "Botswana Pula", symbol: "P" },
  // Global / export
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "\u20AC" },
  { code: "GBP", name: "British Pound", symbol: "\u00A3" },
  { code: "CNY", name: "Chinese Yuan", symbol: "\u00A5" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00A5" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "INR", name: "Indian Rupee", symbol: "\u20B9" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
];

// Fast lookup by code
export const CURRENCY_MAP: Record<string, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
);

export function getCurrencySymbol(code: string): string {
  return CURRENCY_MAP[code]?.symbol ?? code;
}

export function getCurrencyLabel(code: string): string {
  const c = CURRENCY_MAP[code];
  return c ? `${c.code} (${c.name})` : code;
}

export function formatCurrency(amount: number | null, code: string): string {
  if (amount == null) return "\u2014";
  const symbol = getCurrencySymbol(code);
  return `${symbol} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Common export currencies shown as checkboxes in wizard Step 8
export const COMMON_EXPORT_CURRENCIES = ["USD", "EUR", "GBP", "CNY", "AED", "SAR"];

// Country name (lowercase) → default currency code
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  "south africa": "ZAR",
  "ivory coast": "XOF",
  "cote d'ivoire": "XOF",
  "cote divoire": "XOF",
  "côte d'ivoire": "XOF",
  ghana: "GHS",
  kenya: "KES",
  nigeria: "NGN",
  egypt: "EGP",
  morocco: "MAD",
  tanzania: "TZS",
  uganda: "UGX",
  ethiopia: "ETB",
  mozambique: "MZN",
  mauritius: "MUR",
  namibia: "NAD",
  botswana: "BWP",
  senegal: "XOF",
  mali: "XOF",
  "burkina faso": "XOF",
  benin: "XOF",
  togo: "XOF",
  niger: "XOF",
  cameroon: "XAF",
  gabon: "XAF",
  chad: "XAF",
  "united states": "USD",
  usa: "USD",
  "united kingdom": "GBP",
  uk: "GBP",
  china: "CNY",
  japan: "JPY",
  india: "INR",
  uae: "AED",
  "united arab emirates": "AED",
  "saudi arabia": "SAR",
  canada: "CAD",
  australia: "AUD",
  france: "EUR",
  germany: "EUR",
  netherlands: "EUR",
  spain: "EUR",
  italy: "EUR",
  belgium: "EUR",
  portugal: "EUR",
};

export function getDefaultCurrency(country: string): string | undefined {
  return COUNTRY_CURRENCY_MAP[country.toLowerCase().trim()];
}
