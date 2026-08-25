// Tiny client-side CSV export. Values are escaped per RFC 4180; a UTF-8 BOM is
// prepended so Excel opens Cyrillic correctly. The download is triggered locally
// in the browser (no data leaves the page).

type Cell = string | number | null | undefined;

function escapeCell(v: Cell): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  if (typeof window === "undefined") return;
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Round to 2 decimals for money/ratio columns in exports. */
export function num2(n: number): number {
  return Math.round(n * 100) / 100;
}
