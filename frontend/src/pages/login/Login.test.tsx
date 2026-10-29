import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { authApi } from "@/entities/session";
import { LoginPage, ActivatePage } from "./index";
beforeEach(() => vi.restoreAllMocks());
function Location() {
  const location = useLocation();
  return <output aria-label="Адрес">{location.pathname}</output>;
}
function mount(child: React.ReactNode, url = "/login") {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        {child}
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it("logs in with the local account and rejects an external return URL", async () => {
  const login = vi
    .spyOn(authApi, "login")
    .mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "11111111-1111-4111-8111-111111111111",
      name: "Пользователь",
      email: "user@example.test",
      role: "member",
      initials: null,
      timezone: null,
      language: null,
      sourceId: "1",
    });
  mount(<LoginPage />, "/login?returnTo=https://evil.test");
  await userEvent.type(screen.getByLabelText("Почта"), "user@example.test");
  await userEvent.type(screen.getByLabelText("Пароль"), "test-password-123");
  await userEvent.click(screen.getByRole("button", { name: "Войти" }));
  await waitFor(() =>
    expect(login).toHaveBeenCalledWith(
      "user@example.test",
      "test-password-123",
    ),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Адрес")).toHaveTextContent(/^\/$/),
  );
});
it("requires matching passwords and sends the invitation token once", async () => {
  const activate = vi
    .spyOn(authApi, "activate")
    .mockResolvedValue({ email: "user@example.test" });
  mount(<ActivatePage />, "/activate#token=test-invitation-token");
  await userEvent.type(
    screen.getByLabelText("Новый пароль"),
    "test-password-123",
  );
  await userEvent.type(
    screen.getByLabelText("Повторите пароль"),
    "test-password-456",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Установить пароль" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
  expect(activate).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText("Повторите пароль"));
  await userEvent.type(
    screen.getByLabelText("Повторите пароль"),
    "test-password-123",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Установить пароль" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Пароль установлен" }),
  ).toBeInTheDocument();
  expect(activate).toHaveBeenCalledWith(
    "test-invitation-token",
    "test-password-123",
  );
  expect(screen.queryByLabelText("Новый пароль")).not.toBeInTheDocument();
});
