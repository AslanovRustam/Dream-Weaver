import type { Metadata } from "next";

export const metadata: Metadata = { title: "Админ — Gen Go" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
