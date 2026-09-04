"use client";

import { Coins } from "lucide-react";

// Format a USD cost with enough precision for tiny AI-generation amounts.
// $0 → "$0", sub-cent → 4 decimals, otherwise 2.
export function fmtCostUsd(n: number): string {
  if (!n || n <= 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

// Small "себестоимость" (self-cost) readout — the real OpenRouter spend for the
// generations done in this session. Renders nothing until there is a cost.
export function CostMeter({ total, className = "" }: { total: number; className?: string }) {
  if (!total || total <= 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-accent-green/25 bg-accent-green/[0.08] px-2.5 py-1 text-xs font-medium text-accent-green tabular-nums ${className}`}
      title="Реальная себестоимость генераций (OpenRouter)"
    >
      <Coins className="h-3.5 w-3.5" />
      Себестоимость: {fmtCostUsd(total)}
    </span>
  );
}
