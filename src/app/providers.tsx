"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AuthProvider } from "@/lib/auth-context";
import { AuthGateProvider } from "@/components/AuthGate";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { GenerationProvider } from "@/lib/generation-context";
import { EditorHistoryProvider } from "@/lib/editor-history";
import { ConfirmProvider } from "@/components/ui/confirm";
import { LocaleProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";

// Replaces TanStack's src/router.tsx (QueryClient creation) + the provider
// wrapping that lived in __root.tsx's RootComponent. A single stable
// QueryClient per browser session (useState initializer).
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <AuthGateProvider>
            <WorkspaceProvider>
              <GenerationProvider>
                <EditorHistoryProvider>
                  <ConfirmProvider>{children}</ConfirmProvider>
                </EditorHistoryProvider>
              </GenerationProvider>
            </WorkspaceProvider>
            <DevRoleSwitcher />
          </AuthGateProvider>
        </AuthProvider>
        <OfflineBanner />
        <Toaster position="top-center" />
      </LocaleProvider>
    </QueryClientProvider>
  );
}
