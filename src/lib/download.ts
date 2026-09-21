import { track } from "@/lib/analytics";
// Trigger a client-side file download from an in-memory string (HTML, SVG, …).
export function downloadText(filename: string, content: string, mime = "text/html;charset=utf-8") {
  // Every landing builder ends here, so one call covers all of them.
  track("landing_exported", { bytes: content.length });
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Slugify a brand/title into a safe filename stem. */
export function slugify(s: string, fallback = "landing"): string {
  const out = (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return out || fallback;
}
