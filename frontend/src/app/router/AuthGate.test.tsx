import { expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { authApi } from "@/entities/session";
import { ApiError } from "@/shared/api";
import { AuthGate } from "./AuthGate";
beforeEach(() => vi.restoreAllMocks());
function Location() {
  const location = useLocation();
  return <output>{location.pathname + location.search}</output>;
}
it("blocks private content and preserves the requested board URL for login", async () => {
  vi.spyOn(authApi, "me").mockRejectedValue(new ApiError(401, "Войдите"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/?view=lists"]}>
        <AuthGate>
          <p>Закрытые данные</p>
        </AuthGate>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Закрытые данные")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText(/\/login\?returnTo=/)).toHaveTextContent(
      "%2F%3Fview%3Dlists",
    ),
  );
});
