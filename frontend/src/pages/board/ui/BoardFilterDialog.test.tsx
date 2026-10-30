import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { boardApi } from "@/entities/board";
import { cardApi } from "@/entities/card";
import { BoardPage } from "./BoardPage";
import { BoardFilterDialog } from "./BoardFilterDialog";

const boardId = "11111111-1111-4111-8111-111111111111";
const tagId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const avatarUrl = `/api/v1/users/${userId}/avatar?v=${boardId}`;
const catalog = {
  tags: [
    { id: tagId, name: "Срочно", color: "16" },
    { id: boardId, name: "Печать", color: "1" },
  ],
  users: [
    { id: userId, name: "Анна Иванова", avatarUrl },
    { id: boardId, name: "Борис", avatarUrl: null },
  ],
};
const empty = {
  search: "",
  tags: [],
  users: [],
  dateField: "created" as const,
  dateFrom: "",
  dateTo: "",
  archived: false,
};
const prototype = HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(prototype, "close");
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  vi.spyOn(boardApi, "filterOptions").mockResolvedValue(catalog);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalShow) Object.defineProperty(prototype, "showModal", originalShow);
  else Reflect.deleteProperty(prototype, "showModal");
  if (originalClose) Object.defineProperty(prototype, "close", originalClose);
  else Reflect.deleteProperty(prototype, "close");
});
function mount(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

it("opens from the toolbar, searches choices, applies together, reopens, discards changes and resets", async () => {
  const user = userEvent.setup();
  const summary = {
    id: boardId,
    title: "Доска",
    description: null,
    sourceId: null,
  };
  vi.spyOn(boardApi, "list").mockResolvedValue([summary]);
  vi.spyOn(boardApi, "structure").mockResolvedValue({
    board: summary,
    columns: [
      {
        id: boardId,
        title: "Работа",
        parentId: null,
        sortOrder: "0",
        type: 2,
        wipLimit: null,
      },
    ],
    lanes: [],
  });
  const cell = vi
    .spyOn(cardApi, "cell")
    .mockResolvedValue({ items: [], nextCursor: null, total: 0 });
  mount(<BoardPage />);
  await waitFor(() => expect(cell).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole("button", { name: "Фильтр" }));
  let dialog = within(screen.getByRole("dialog", { name: "Фильтры" }));
  await dialog.findByRole("checkbox", { name: "Срочно" });
  await user.type(
    dialog.getByRole("searchbox", { name: "Поиск меток" }),
    "СРОЧ",
  );
  expect(
    dialog.queryByRole("checkbox", { name: "Печать" }),
  ).not.toBeInTheDocument();
  await user.click(dialog.getByRole("checkbox", { name: "Срочно" }));
  await user.type(
    dialog.getByRole("searchbox", { name: "Поиск участников" }),
    "Анна",
  );
  expect(
    dialog.queryByRole("checkbox", { name: "Борис" }),
  ).not.toBeInTheDocument();
  await user.click(dialog.getByRole("checkbox", { name: "Анна Иванова" }));
  await user.type(
    dialog.getByRole("searchbox", { name: "Поиск карточек" }),
    " Заказ ",
  );
  await user.selectOptions(dialog.getByLabelText("Поле даты"), "due");
  fireEvent.change(dialog.getByLabelText("С", { exact: true }), {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(dialog.getByLabelText("По", { exact: true }), {
    target: { value: "2026-10-30" },
  });
  await user.click(dialog.getByRole("switch"));
  expect(cell).toHaveBeenCalledTimes(1);
  await user.click(dialog.getByRole("button", { name: "Применить" }));
  await waitFor(() =>
    expect(cell).toHaveBeenLastCalledWith(
      boardId,
      boardId,
      null,
      null,
      {
        search: "Заказ",
        tags: [tagId],
        users: [userId],
        archived: true,
        dateField: "due",
        dateFrom: "2026-10-01",
        dateTo: "2026-10-30",
      },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Фильтр" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("Заказ");
  await user.click(screen.getByRole("button", { name: "Настроить фильтры" }));
  dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("checkbox", { name: "Срочно" })).toBeChecked();
  expect(dialog.getByRole("checkbox", { name: "Анна Иванова" })).toBeChecked();
  await user.click(
    dialog.getByRole("button", { name: "Убрать фильтр «Метка: Срочно»" }),
  );
  expect(dialog.getByRole("checkbox", { name: "Срочно" })).not.toBeChecked();
  await user.click(dialog.getByRole("button", { name: "Закрыть фильтры" }));
  expect(
    within(screen.getByRole("region", { name: "Активные фильтры" })).getByRole(
      "button",
      { name: "Убрать фильтр «Метка: Срочно»" },
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Настроить фильтры" }));
  dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("checkbox", { name: "Срочно" })).toBeChecked();
  await user.click(dialog.getByRole("button", { name: "Сбросить" }));
  expect(dialog.getByRole("checkbox", { name: "Срочно" })).not.toBeChecked();
  expect(dialog.getByRole("switch")).not.toBeChecked();
  expect(dialog.getByLabelText("С", { exact: true })).toHaveValue("");
  await user.click(dialog.getByRole("button", { name: "Применить" }));
  expect(
    screen.queryByRole("region", { name: "Активные фильтры" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Фильтр" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("");
});

it("prevents an inverted date range and allows correcting its start", async () => {
  const apply = vi.fn();
  mount(
    <BoardFilterDialog
      boardId={boardId}
      initial={empty}
      onApply={apply}
      onClose={vi.fn()}
    />,
  );
  const from = screen.getByLabelText("С", { exact: true });
  const to = screen.getByLabelText("По", { exact: true });
  fireEvent.change(from, { target: { value: "2026-11-01" } });
  fireEvent.change(to, { target: { value: "2026-10-01" } });
  await userEvent.click(screen.getByRole("button", { name: "Применить" }));
  expect(apply).not.toHaveBeenCalled();
  expect(to).toBeInvalid();
  fireEvent.change(from, { target: { value: "2026-09-01" } });
  await userEvent.click(screen.getByRole("button", { name: "Применить" }));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({ dateFrom: "2026-09-01", dateTo: "2026-10-01" }),
  );
});

it("keeps selected filters removable when loading fails and retries the catalog", async () => {
  vi.mocked(boardApi.filterOptions).mockRejectedValueOnce(new Error("Offline"));
  mount(
    <BoardFilterDialog
      boardId={boardId}
      initial={{ ...empty, tags: [{ id: tagId, name: "Срочно" }] }}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Не удалось загрузить",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Убрать фильтр «Метка: Срочно»" }),
  );
  expect(
    screen.queryByRole("button", { name: "Убрать фильтр «Метка: Срочно»" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(
    await screen.findByRole("checkbox", { name: "Анна Иванова" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
