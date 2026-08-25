import type { Metadata } from "next";

export const metadata: Metadata = { title: "Мой Workspace — Gen Go" };

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
