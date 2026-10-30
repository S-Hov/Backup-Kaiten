import { expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, Routes, Route } from "react-router-dom";
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

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  email: "user@example.test",
  name: "Участник",
  role: "member" as const,
  initials: null,
  timezone: null,
  language: null,
  sourceId: null,
};
function mountGuestRoute(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <AuthGate>
          <Routes>
            <Route path="/" element={<h1>Рабочая доска</h1>} />
            <Route path="/login" element={<h1>Вход</h1>} />
            <Route path="/activate" element={<h1>Установка пароля</h1>} />
          </Routes>
        </AuthGate>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it.each(["/login", "/activate#token=test-invitation-token"])(
  "redirects an authenticated user away from the guest page %s",
  async (path) => {
    let finish!: (value: typeof user) => void;
    const me = vi.spyOn(authApi, "me").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mountGuestRoute(path);
    expect(screen.getByText("Проверяем вход…")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    await waitFor(() => expect(me).toHaveBeenCalled());
    finish(user);
    expect(
      await screen.findByRole("heading", { name: "Рабочая доска" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Вход|Установка пароля/ }),
    ).not.toBeInTheDocument();
  },
);
it.each([
  ["/login", "Вход"],
  ["/activate#token=test-invitation-token", "Установка пароля"],
])(
  "allows a guest to open %s after checking the session",
  async (path, title) => {
    vi.spyOn(authApi, "me").mockRejectedValue(new ApiError(401, "Войдите"));
    mountGuestRoute(path);
    expect(
      await screen.findByRole("heading", { name: title }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Рабочая доска" }),
    ).not.toBeInTheDocument();
  },
);
it("does not show guest forms when checking the session fails", async () => {
  vi.spyOn(authApi, "me").mockRejectedValue(
    new ApiError(503, "Сервер недоступен"),
  );
  mountGuestRoute("/login");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Сервер недоступен",
  );
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
});
