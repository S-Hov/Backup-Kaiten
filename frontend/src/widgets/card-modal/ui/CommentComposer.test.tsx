import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardApi } from "@/entities/card";
import { CommentComposer } from "./CommentComposer";

beforeEach(() => vi.restoreAllMocks());
function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const onSent = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CommentComposer cardId="card-id" disabled={false} onSent={onSent} />
    </QueryClientProvider>,
  );
  return onSent;
}
it("sends text, a link and a file together and clears the composer on success", async () => {
  const send = vi
    .spyOn(cardApi, "comment")
    .mockResolvedValue({ id: "comment-id" });
  const onSent = mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Текст комментария" }),
    "Макет готов",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Добавить ссылку" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Ссылка" }),
    "https://example.com",
  );
  await userEvent.upload(
    screen.getByLabelText("Прикрепить файл"),
    new File(["abc"], "макет.txt", { type: "text/plain" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Отправить комментарий" }),
  );
  await waitFor(() => expect(onSent).toHaveBeenCalled());
  expect(send).toHaveBeenCalledWith("card-id", {
    requestId: expect.any(String),
    text: "Макет готов\n\nhttps://example.com",
    files: [{ name: "макет.txt", data: "YWJj" }],
  });
  expect(
    screen.getByRole("textbox", { name: "Текст комментария" }),
  ).toHaveValue("");
  expect(screen.queryByText("макет.txt")).not.toBeInTheDocument();
});
it("preserves the draft and request ID after an error for a safe manual retry", async () => {
  const send = vi
    .spyOn(cardApi, "comment")
    .mockRejectedValueOnce(new Error("Нет связи"))
    .mockResolvedValue({ id: "comment-id" });
  mount();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Текст комментария" }),
    "Не терять",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Отправить комментарий" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Нет связи");
  expect(
    screen.getByRole("textbox", { name: "Текст комментария" }),
  ).toHaveValue("Не терять");
  await userEvent.click(
    screen.getByRole("button", { name: "Отправить комментарий" }),
  );
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[0][1].requestId).toBe(send.mock.calls[1][1].requestId);
});
