import type { Metadata } from "next";

// Covers /history and /history/[cardId].
export const metadata: Metadata = { title: "История — Gen Go" };

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
