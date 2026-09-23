import { track } from "@/lib/analytics";
import type { AnalyticsEventName } from "@/lib/analyticsEvents";

// Trigger a client-side file download from an in-memory string (HTML, SVG, …).
//
// Every builder ends here, so the export event is recorded in one place — but
// the name is a parameter: the email generator downloads through the same
// helper, and counting its files as landing exports would quietly corrupt the
// funnel in the admin report.
export function downloadText(
  filename: string,
  content: string,
  mime = "text/html;charset=utf-8",
  event: AnalyticsEventName = "landing_exported",
) {
  track(event, { bytes: content.length });
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
