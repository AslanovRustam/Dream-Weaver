"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AuthProvider } from "@/lib/auth-context";
import { GenerationProvider } from "@/lib/generation-context";

// Replaces TanStack's src/router.tsx (QueryClient creation) + the provider
// wrapping that lived in __root.tsx's RootComponent. A single stable
// QueryClient per browser session (useState initializer).
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GenerationProvider>{children}</GenerationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
