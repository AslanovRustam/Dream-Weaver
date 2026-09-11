import type { Metadata } from "next";

export const metadata: Metadata = { title: "Мой Workspace — GenGO" };

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
