import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardApi } from "@/entities/card";
import { ApiError } from "@/shared/api";
import { SessionContext, type SessionUser } from "@/entities/session";
import { cardDetailFixture } from "@/test/card-detail-fixture";
import { CardEditingProvider } from "./CardEditing";
import { InlineField } from "./InlineField";
import { InlineSelection } from "./InlineSelection";

afterEach(() => vi.restoreAllMocks());
const tag1 = { id: "tag-1", name: "Печать", color: null };
const tag2 = { id: "tag-2", name: "Срочно", color: null };
const user1 = { id: "user-1", name: "Анна", avatarUrl: null };
const user2 = { id: "user-2", name: "Борис", avatarUrl: null };

function mount(viewer = false) {
  const model = cardDetailFixture();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const options = vi
    .spyOn(cardApi, "editOptions")
    .mockResolvedValue({
      tags: [tag1, tag2],
      users: [user1, user2],
      types: [],
      properties: [],
    });
  render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider
        value={viewer ? ({ role: "viewer" } as SessionUser) : null}
      >
        <CardEditingProvider model={model} onClose={vi.fn()}>
          <InlineField
            id="title"
            label="Название"
            kind="title"
            value={model.card.title}
            toChanges={(title) => ({ title })}
          >
            <h1>{model.card.title}</h1>
          </InlineField>
          <InlineField
            id="description"
            label="Описание"
            kind="rich"
            value={model.card.description}
            toChanges={(description) => ({ description })}
          >
            <p>Описание заказа</p>
          </InlineField>
          <InlineSelection kind="tags" label="Теги" selected={[tag1]} />
          <InlineSelection
            kind="members"
            label="Участники"
            selected={[{ ...user1, role: 2 }]}
          />
        </CardEditingProvider>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { model, options };
}

it("saves only the clicked field and returns to its normal presentation", async () => {
  const update = vi.spyOn(cardApi, "update").mockResolvedValue({ id: "one" });
  const { model } = mount();
  await userEvent.click(
    screen.getByRole("heading", { name: model.card.title }),
  );
  const title = screen.getByRole("textbox", { name: "Название" });
  expect(title).toHaveFocus();
  await userEvent.clear(title);
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  await userEvent.type(title, "Новое название");
  await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("textbox", { name: "Название" }),
    ).not.toBeInTheDocument(),
  );
  expect(update).toHaveBeenCalledExactlyOnceWith(model.card.id, {
    version: 1,
    title: "Новое название",
  });
});

it("edits rich description in place and cancels without writing", async () => {
  const update = vi.spyOn(cardApi, "update");
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Изменить: Описание" }),
  );
  const description = screen.getByRole("textbox", { name: "Описание" });
  expect(description).toContainHTML("<strong>Описание заказа</strong>");
  description.innerHTML = "<p>Черновик</p>";
  fireEvent.input(description);
  await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(
    screen.queryByRole("textbox", { name: "Описание" }),
  ).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});

it("searches tags, removes a selected tag with a cross and saves the selection", async () => {
  const update = vi.spyOn(cardApi, "update").mockResolvedValue({ id: "one" });
  const { model } = mount();
  await userEvent.click(screen.getByRole("button", { name: "+ Добавить тег" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Поиск тегов" }),
    "Сро",
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "+ Срочно" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Убрать тег «Печать»" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledExactlyOnceWith(model.card.id, {
      version: 1,
      tagIds: [tag2.id],
    }),
  );
});

it("creates a tag from search then assigns it only on save", async () => {
  const update = vi.spyOn(cardApi, "update").mockResolvedValue({ id: "one" });
  const create = vi
    .spyOn(cardApi, "createTag")
    .mockResolvedValue({ id: "new-tag", name: "Новая метка", color: null });
  mount();
  await userEvent.click(screen.getByRole("button", { name: "+ Добавить тег" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Поиск тегов" }),
    "Новая метка",
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Создать тег «Новая метка»" }),
  );
  await screen.findByRole("button", { name: "Убрать тег «Новая метка»" });
  expect(create).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      tagIds: [tag1.id, "new-tag"],
    }),
  );
});

it("searches users and changes the responsible person without dropping another member", async () => {
  const update = vi.spyOn(cardApi, "update").mockResolvedValue({ id: "one" });
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "+ Добавить участника" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Поиск участников" }),
    "Бор",
  );
  await userEvent.click(await screen.findByRole("button", { name: "+ Борис" }));
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Роль: Борис" }),
    "2",
  );
  expect(screen.getByRole("combobox", { name: "Роль: Анна" })).toHaveValue("1");
  await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      members: [
        { id: user1.id, role: 1 },
        { id: user2.id, role: 2 },
      ],
    }),
  );
});

it("keeps the draft after a conflict and does not overwrite a newer version", async () => {
  const update = vi
    .spyOn(cardApi, "update")
    .mockRejectedValue(new ApiError(409, "Карточка уже изменилась"));
  mount();
  await userEvent.click(screen.getByRole("heading"));
  const title = screen.getByRole("textbox", { name: "Название" });
  await userEvent.clear(title);
  await userEvent.type(title, "Мой вариант");
  await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Карточка уже изменилась",
  );
  expect(title).toHaveValue("Мой вариант");
  expect(update).toHaveBeenCalledTimes(1);
});

it("keeps viewer fields read only", () => {
  mount(true);
  expect(
    screen.queryByRole("button", { name: /Изменить:/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Добавить/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Убрать/ }),
  ).not.toBeInTheDocument();
});
