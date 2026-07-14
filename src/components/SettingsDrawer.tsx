import { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";

const KEY = "webhook_url";
const BRAND_NAME_KEY = "brand_name";
const BRAND_LOGO_KEY = "brand_logo";
const LANGUAGE_KEY = "brand_language";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "Авто (по бренду)" },
  { value: "ru", label: "Русский" },
  { value: "uk", label: "Українська" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "pl", label: "Polski" },
];

export function SettingsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [language, setLanguage] = useState("auto");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUrl(localStorage.getItem(KEY) ?? "");
    setBrandName(localStorage.getItem(BRAND_NAME_KEY) ?? "");
    setBrandLogo(localStorage.getItem(BRAND_LOGO_KEY) ?? "");
    setLanguage(localStorage.getItem(LANGUAGE_KEY) ?? "auto");
  }, [open]);

  const saveUrl = (v: string) => {
    setUrl(v);
    localStorage.setItem(KEY, v);
  };
  const saveBrandName = (v: string) => {
    setBrandName(v);
    localStorage.setItem(BRAND_NAME_KEY, v);
  };
  const saveLanguage = (v: string) => {
    setLanguage(v);
    localStorage.setItem(LANGUAGE_KEY, v);
  };
  const saveBrandLogo = (v: string) => {
    setBrandLogo(v);
    if (v) localStorage.setItem(BRAND_LOGO_KEY, v);
    else localStorage.removeItem(BRAND_LOGO_KEY);
  };

  const onLogoFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert("Логотип слишком большой (макс 1MB)");
      return;
    }
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const maxPx = 256;
    const rasterize = (src: string, asPng: boolean) => {
      const img = new Image();
      img.onload = () => {
        const iw = img.width || maxPx;
        const ih = img.height || maxPx;
        const scale = Math.min(1, maxPx / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          saveBrandLogo(src);
          return;
        }
        if (!asPng) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        saveBrandLogo(asPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => saveBrandLogo(src);
      img.src = src;
    };
    const reader = new FileReader();
    if (isSvg) {
      reader.onload = () => {
        const text = reader.result;
        if (typeof text !== "string") return;
        const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        rasterize(svgUrl, true);
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") rasterize(result, false);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open settings"
        onClick={() => onOpenChange(true)}
        className="fixed left-4 top-4 z-30 rounded-full border border-border bg-card p-2 text-foreground shadow-sm transition hover:bg-accent"
      >
        <Settings size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => onOpenChange(false)} />
      )}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-80 max-w-[90vw] transform border-r border-border bg-card shadow-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Настройки</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 hover:bg-accent"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-4" style={{ maxHeight: "calc(100% - 49px)" }}>
          <div>
            <label className="block text-xs font-medium text-foreground/70">
              Название бренда / проекта
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => saveBrandName(e.target.value)}
              placeholder="Например, Acme"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground/70">
              Логотип (PNG/SVG, до 1MB)
            </label>
            <div className="mt-1 flex items-center gap-3">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt="brand logo"
                  className="h-12 w-12 rounded-md border border-border bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border ds-micro text-foreground/40">
                  нет
                </div>
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/*,.svg"
                  onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                {brandLogo && (
                  <button
                    type="button"
                    onClick={() => saveBrandLogo("")}
                    className="self-start text-xs text-foreground/60 underline hover:text-foreground"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground/70">
              Язык текстов на баннере
            </label>
            <select
              value={language}
              onChange={(e) => saveLanguage(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-border pt-4">
            <label className="block text-xs font-medium text-foreground/70">Webhook URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => saveUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            <p className="mt-2 text-xs text-foreground/60">
              Сохраняется автоматически в localStorage.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

export function getWebhookUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}

export function getBrandSettings(): {
  brand_name: string;
  brand_logo: string;
  language: string;
} {
  if (typeof window === "undefined") {
    return { brand_name: "", brand_logo: "", language: "auto" };
  }
  return {
    brand_name: localStorage.getItem(BRAND_NAME_KEY) ?? "",
    brand_logo: localStorage.getItem(BRAND_LOGO_KEY) ?? "",
    language: localStorage.getItem(LANGUAGE_KEY) ?? "auto",
  };
}
