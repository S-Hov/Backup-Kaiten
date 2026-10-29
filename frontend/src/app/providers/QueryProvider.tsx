import { useState } from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { ApiError, ApiContractError } from "@/shared/api";
import { Notifications, notify } from "@/shared/ui/notifications";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (
              query.meta?.silent ||
              (error instanceof ApiError && error.status === 401)
            )
              return;
            notify.error(
              typeof query.meta?.errorTitle === "string"
                ? query.meta.errorTitle
                : "Не удалось загрузить данные",
              {
                id: "query-error",
                description: error.message,
              },
            );
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.silent) return;
            notify.error("Не удалось сохранить изменения", {
              description: error.message,
            });
          },
        }),
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
  return (
    <QueryClientProvider client={client}>
      {children}
      <Notifications />
    </QueryClientProvider>
  );
}
