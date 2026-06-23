import type { Metadata } from "next";

export const metadata: Metadata = { title: "Админ — Dream Weaver Studio" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
