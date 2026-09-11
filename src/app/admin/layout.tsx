import type { Metadata } from "next";

export const metadata: Metadata = { title: "Админ — GenGO" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
