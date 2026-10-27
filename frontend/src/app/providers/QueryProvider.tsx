import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, ApiContractError } from "@/shared/api";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 120_000,
            refetchOnWindowFocus: false,
            retry: (failures, error) =>
              failures < 1 &&
              !(error instanceof ApiContractError) &&
              !(
                error instanceof ApiError &&
                error.status < 500 &&
                error.status !== 429
              ),
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
