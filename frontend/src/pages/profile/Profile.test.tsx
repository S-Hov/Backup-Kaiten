import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  authApi,
  SessionContext,
  sessionKey,
  type SessionUser,
} from "@/entities/session";
import { AccountMenu } from "@/features/account-menu";
import { ProfilePage } from "./index";

const user: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  name: "Иван Петров",
  email: "ivan@example.test",
  role: "member",
  initials: "ИП",
  timezone: "Europe/Moscow",
  language: "ru",
  sourceId: "123",
};
function open(section = "profile", menu = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/profile?section=${section}`]}>
        <ProfileSession menu={menu} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function ProfileSession({ menu }: { menu: boolean }) {
  const { data } = useQuery({
    queryKey: sessionKey,
    queryFn: authApi.me,
    initialData: user,
    enabled: false,
  });
  return (
    <SessionContext.Provider value={data}>
      {menu && <AccountMenu />}
      <ProfilePage />
    </SessionContext.Provider>
  );
}
beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
});
afterEach(() => vi.restoreAllMocks());

it("saves the profile name and immediately updates the account menu", async () => {
  const save = vi
    .spyOn(authApi, "updateProfile")
    .mockResolvedValue({ ...user, name: "Анна Петрова", initials: "АП" });
  open("profile", true);
  expect(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  ).toBeDisabled();
  await userEvent.clear(screen.getByLabelText("Полное имя"));
  await userEvent.type(
    screen.getByLabelText("Полное имя"),
    "  Анна   Петрова  ",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledWith("Анна Петрова"));
  expect(await screen.findByRole("status")).toHaveTextContent("Имя сохранено");
  expect(screen.getByLabelText("Полное имя")).toHaveValue("Анна Петрова");
  expect(screen.getByLabelText("Аккаунт: Анна Петрова")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  ).toBeDisabled();
});

it("rejects whitespace names and keeps the draft when saving fails", async () => {
  const save = vi
    .spyOn(authApi, "updateProfile")
    .mockRejectedValue(new Error("Не удалось сохранить имя"));
  open();
  const input = screen.getByLabelText("Полное имя");
  await userEvent.clear(input);
  await userEvent.type(input, "   ");
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Укажите имя");
  expect(save).not.toHaveBeenCalled();
  await userEvent.clear(input);
  await userEvent.type(input, "Новое имя");
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить изменения" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Не удалось сохранить имя",
  );
  expect(input).toHaveValue("Новое имя");
});

it("keeps the theme pickers in account menu and profile synchronized", async () => {
  open("appearance", true);
  await userEvent.click(
    screen.getByText("Иван Петров", { selector: "summary strong" }),
  );
  const pickers = screen.getAllByRole("group", { name: "Оформление" });
  expect(pickers).toHaveLength(2);
  await userEvent.click(
    within(pickers[1]).getByRole("radio", { name: "Тёмная" }),
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("kaiten-theme")).toBe("dark");
  expect(
    within(pickers[0]).getByRole("radio", { name: "Тёмная" }),
  ).toBeChecked();
  await userEvent.click(
    within(pickers[0]).getByRole("radio", { name: "Бумажная" }),
  );
  expect(
    within(pickers[1]).getByRole("radio", { name: "Бумажная" }),
  ).toBeChecked();
});

it("loads and saves the existing board and card display preferences", async () => {
  localStorage.setItem("board-view", "lists");
  localStorage.setItem("card-modal.fullscreen", "true");
  localStorage.setItem("card-modal.panel-hidden", "true");
  const page = open("display");
  expect(screen.getByRole("radio", { name: /Списки/ })).toBeChecked();
  expect(screen.getByRole("switch", { name: /На весь экран/ })).toBeChecked();
  expect(
    screen.getByRole("switch", { name: /Панель комментариев/ }),
  ).not.toBeChecked();
  await userEvent.click(screen.getByRole("radio", { name: /Канбан/ }));
  await userEvent.click(screen.getByRole("switch", { name: /На весь экран/ }));
  await userEvent.click(
    screen.getByRole("switch", { name: /Панель комментариев/ }),
  );
  expect(localStorage.getItem("board-view")).toBe("board");
  expect(localStorage.getItem("card-modal.fullscreen")).toBe("false");
  expect(localStorage.getItem("card-modal.panel-hidden")).toBe("false");
  page.unmount();
  open("display");
  expect(screen.getByRole("radio", { name: /Канбан/ })).toBeChecked();
  expect(
    screen.getByRole("switch", { name: /Панель комментариев/ }),
  ).toBeChecked();
});

it("navigates between profile sections and requests sessions only in security", async () => {
  const sessions = vi.spyOn(authApi, "sessions").mockResolvedValue([]);
  open();
  expect(
    screen.getByText("ivan@example.test", { selector: "dd" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Вернуть из Kaiten" }),
  ).toBeInTheDocument();
  expect(sessions).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("link", { name: /Безопасность/ }));
  expect(await screen.findByText("Активных входов нет.")).toBeInTheDocument();
  expect(sessions).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: /Безопасность/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("validates password confirmation before submitting the existing password API", async () => {
  vi.spyOn(authApi, "sessions").mockResolvedValue([]);
  const password = vi
    .spyOn(authApi, "password")
    .mockRejectedValue(new Error("Текущий пароль неверен"));
  open("security");
  await userEvent.type(
    screen.getByLabelText("Текущий пароль"),
    "current-password",
  );
  await userEvent.type(
    screen.getByLabelText("Новый пароль"),
    "new-password-123",
  );
  await userEvent.type(
    screen.getByLabelText("Повторите новый пароль"),
    "different-password",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить новый пароль" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
  expect(password).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText("Повторите новый пароль"));
  await userEvent.type(
    screen.getByLabelText("Повторите новый пароль"),
    "new-password-123",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить новый пароль" }),
  );
  await waitFor(() =>
    expect(password).toHaveBeenCalledWith(
      "current-password",
      "new-password-123",
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Текущий пароль неверен",
  );
});
