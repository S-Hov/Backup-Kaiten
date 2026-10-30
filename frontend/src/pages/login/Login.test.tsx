import { beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
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
  const login = vi.spyOn(authApi, "login").mockResolvedValue({
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

it("uses the changed URL token when the fragment changes without a page reload", async () => {
  const activate = vi
    .spyOn(authApi, "activate")
    .mockRejectedValue(new Error("Ссылка недействительна"));
  mount(
    <>
      <ActivatePage />
      <Link to="/activate#token=modified-invitation-token">Изменить токен</Link>
    </>,
    "/activate#token=original-invitation-token",
  );
  await userEvent.click(screen.getByRole("link", { name: "Изменить токен" }));
  await userEvent.type(
    screen.getByLabelText("Новый пароль"),
    "test-password-123",
  );
  await userEvent.type(
    screen.getByLabelText("Повторите пароль"),
    "test-password-123",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Установить пароль" }),
  );
  await waitFor(() => expect(activate).toHaveBeenCalled());
  expect(activate).toHaveBeenCalledWith(
    "modified-invitation-token",
    "test-password-123",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Ссылка недействительна");
  expect(
    screen.queryByRole("heading", { name: "Пароль установлен" }),
  ).not.toBeInTheDocument();
});

it.each([
  "/activate",
  "/activate#token=first-invitation-token&token=second-invitation-token",
])(
  "does not retain a valid credential when the fragment becomes invalid: %s",
  async (target) => {
    const activate = vi.spyOn(authApi, "activate");
    mount(
      <>
        <ActivatePage />
        <Link to={target}>Изменить ссылку</Link>
      </>,
      "/activate#token=original-invitation-token",
    );
    await userEvent.type(
      screen.getByLabelText("Новый пароль"),
      "test-password-123",
    );
    await userEvent.click(
      screen.getByRole("link", { name: "Изменить ссылку" }),
    );
    expect(screen.queryByLabelText("Новый пароль")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ссылка установки пароля некорректна",
    );
    expect(activate).not.toHaveBeenCalled();
  },
);

it("discards the previous draft and ignores a late success after changing the token", async () => {
  let finish!: (result: { email: string }) => void;
  const activate = vi.spyOn(authApi, "activate").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mount(
    <>
      <ActivatePage />
      <Link to="/activate#token=modified-invitation-token">Изменить токен</Link>
    </>,
    "/activate#token=original-invitation-token",
  );
  await userEvent.type(
    screen.getByLabelText("Новый пароль"),
    "test-password-123",
  );
  await userEvent.type(
    screen.getByLabelText("Повторите пароль"),
    "test-password-123",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Установить пароль" }),
  );
  await waitFor(() => expect(activate).toHaveBeenCalled());
  await userEvent.click(screen.getByRole("link", { name: "Изменить токен" }));
  expect(screen.getByLabelText("Новый пароль")).toHaveValue("");
  expect(screen.getByLabelText("Повторите пароль")).toHaveValue("");
  await act(async () => finish({ email: "user@example.test" }));
  expect(
    screen.getByRole("heading", { name: "Установка пароля" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Пароль установлен" }),
  ).not.toBeInTheDocument();
});
