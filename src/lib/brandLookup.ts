// Client helper for "Найти по сайту" (SettingsDrawer) — see
// /api/brand-lookup for the full pipeline (web search → fetch → extract →
// vision analysis).
import { apiFetch } from "./api-client";

export type BrandLookupResult = {
  site_url: string;
  brand_name: string;
  logo_data_url: string;
  accent_color_hex: string;
  palette: string[];
  style: string;
  is_clean_logo: boolean;
};

export class BrandLookupError extends Error {}

/** Throws BrandLookupError with a user-facing Russian message on failure. */
export async function lookupBrand(query: string): Promise<BrandLookupResult> {
  const res = await apiFetch("/api/brand-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = (await res.json().catch(() => null)) as
    | { result?: BrandLookupResult; error?: string }
    | null;
  if (!res.ok || !data?.result) {
    if (res.status === 401) throw new BrandLookupError("Войдите, чтобы найти бренд по сайту");
    throw new BrandLookupError(data?.error || "Не удалось найти бренд");
  }
  return data.result;
}
