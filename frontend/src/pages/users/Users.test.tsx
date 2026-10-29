import { expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionContext } from "@/entities/session";
import { userApi } from "@/entities/user";
import { UsersPage } from "./index";
afterEach(() => vi.restoreAllMocks());
it("shows imported profiles separately from account access and issues a selected invitation", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  vi.spyOn(userApi, "list").mockResolvedValue([
    {
      userId: id,
      name: "Участник",
      email: "member@example.test",
      sourceId: "123",
      sourceActive: true,
      timezone: "Europe/Moscow",
      language: "ru",
      initials: "У",
      accountId: null,
      role: null,
      status: "no-access",
      hasPassword: false,
    },
  ]);
  const invite = vi
    .spyOn(userApi, "invite")
    .mockResolvedValue({
      accountId: id,
      email: "member@example.test",
      token: "test-token",
      expiresInHours: 24,
    });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <SessionContext.Provider
          value={{
            id,
            userId: id,
            name: "Администратор",
            email: "admin@example.test",
            role: "admin",
            initials: "А",
            timezone: null,
            language: null,
            sourceId: null,
          }}
        >
          <UsersPage />
        </SessionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Нет учётной записи")).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Роль: Участник" }),
    "viewer",
  );
  await userEvent.click(screen.getByRole("button", { name: "Выдать доступ" }));
  await waitFor(() =>
    expect(invite).toHaveBeenCalledWith("member@example.test", "viewer"),
  );
  expect(
    await screen.findByRole("textbox", { name: "Ссылка установки пароля" }),
  ).toHaveValue(`${window.location.origin}/activate#token=test-token`);
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Поиск пользователей" }),
    "неизвестный",
  );
  expect(screen.getByText("Пользователи не найдены")).toBeInTheDocument();
});
