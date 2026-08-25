"use client";

import { AppSidebar } from "@/components/AppSidebar";

// Shared page shell: the collapsible sidebar + the page content beside it.
// Render it directly under <AppHeader /> so the sidebar sits below the sticky
// top bar. The content column is `relative` so page backdrops can anchor to it.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <AppSidebar />
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}
