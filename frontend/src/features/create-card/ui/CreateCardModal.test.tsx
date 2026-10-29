import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardApi } from "@/entities/card";
import { CreateCardModal } from "./CreateCardModal";

const id = "11111111-1111-4111-8111-111111111111";
const dialogPrototype = HTMLDialogElement.prototype;
const oldShow = Object.getOwnPropertyDescriptor(dialogPrototype, "showModal");
beforeEach(() =>
  Object.defineProperty(dialogPrototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  if (oldShow) Object.defineProperty(dialogPrototype, "showModal", oldShow);
  else Reflect.deleteProperty(dialogPrototype, "showModal");
});
function mount(onCreated = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CreateCardModal
        structure={{
          board: {
            id,
            title: "Производство",
            description: null,
            sourceId: null,
          },
          columns: [
            {
              id,
              title: "Печать",
              parentId: null,
              sortOrder: "0",
              type: 2,
              wipLimit: null,
            },
          ],
          lanes: [{ id, title: "Основная", sortOrder: "0" }],
        }}
        onClose={onClose}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
}
it("creates with trimmed title and selected location and prevents another submit while saving", async () => {
  let finish!: (value: { id: string }) => void;
  const create = vi.spyOn(cardApi, "create").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const created = vi.fn();
  mount(created);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Название" }),
    "  Новый заказ  ",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Создать карточку" }),
  );
  expect(create).toHaveBeenCalledWith(
    id,
    expect.objectContaining({
      title: "Новый заказ",
      columnId: id,
      laneId: id,
      requestId: expect.any(String),
    }),
  );
  expect(screen.getByRole("button", { name: "Создаём…" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Закрыть создание карточки" }),
  ).toBeDisabled();
  finish({ id });
  await waitFor(() => expect(created).toHaveBeenCalledWith(id));
  expect(create).toHaveBeenCalledTimes(1);
});
it("keeps the form after a failure and reuses its request ID on a manual retry", async () => {
  const create = vi
    .spyOn(cardApi, "create")
    .mockRejectedValueOnce(new Error("Нет связи"))
    .mockResolvedValueOnce({ id });
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Название" }),
    "Заказ",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Создать карточку" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Нет связи");
  expect(screen.getByRole("textbox", { name: "Название" })).toHaveValue(
    "Заказ",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Создать карточку" }),
  );
  expect(create.mock.calls[1][1].requestId).toBe(
    create.mock.calls[0][1].requestId,
  );
});
