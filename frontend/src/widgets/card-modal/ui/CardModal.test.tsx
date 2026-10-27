import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModal } from "./CardModal";
import { cardDetailFixture } from "@/test/card-detail-fixture";

const dialogPrototype = HTMLDialogElement.prototype;
const oldShow = Object.getOwnPropertyDescriptor(dialogPrototype, "showModal");
const oldClose = Object.getOwnPropertyDescriptor(dialogPrototype, "close");
beforeEach(() => {
  Object.defineProperty(dialogPrototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(dialogPrototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (oldShow) Object.defineProperty(dialogPrototype, "showModal", oldShow);
  else Reflect.deleteProperty(dialogPrototype, "showModal");
  if (oldClose) Object.defineProperty(dialogPrototype, "close", oldClose);
  else Reflect.deleteProperty(dialogPrototype, "close");
});
function wrap(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
it("loads details, renders sections, opens files and does not close the card when an image is closed", async () => {
  const model = cardDetailFixture();
  const fileId = "22222222-2222-4222-8222-222222222222";
  model.files = [
    {
      id: fileId,
      name: "Макет.png",
      size: 100,
      mime: "image/png",
      status: "saved",
      deleted: false,
      cover: true,
      commentId: null,
      propertyId: null,
      url: `/api/v1/attachments/${fileId}/content`,
      downloadUrl: `/api/v1/attachments/${fileId}/content?download=1`,
      sha256: null,
      error: null,
    },
  ];
  model.children = [
    {
      id: fileId,
      number: "43",
      title: "Дочерний заказ",
      available: true,
      archived: false,
    },
  ];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(model)));
  const close = vi.fn(),
    open = vi.fn();
  render(
    wrap(<CardModal cardId={model.card.id} onClose={close} onOpen={open} />),
  );
  const dialog = await screen.findByRole("dialog", { name: "Заказ на кружки" });
  expect(within(dialog).getByText("Описание заказа")).toBeInTheDocument();
  expect(String(fetch.mock.calls[0][0])).toContain(
    `/cards/${model.card.id}/detail`,
  );
  screen.getByRole("tab", { name: /Комментарии/ }).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: /Перемещения/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Открыть изображение Макет.png" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Просмотр вложения" }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Закрыть изображение" }),
  );
  expect(close).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /Дочерний заказ/ }));
  expect(open).toHaveBeenCalledWith(fileId);
  await userEvent.click(
    screen.getByRole("button", { name: "Закрыть карточку" }),
  );
  expect(close).toHaveBeenCalledTimes(1);
});
it("cancels a pending details request on unmount and restores page scrolling", async () => {
  let signal: AbortSignal | null = null;
  vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => {
    signal = options?.signal as AbortSignal;
    return new Promise(() => {});
  });
  const previous = document.body.style.overflow;
  const { unmount } = render(
    wrap(
      <CardModal
        cardId={cardDetailFixture().card.id}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    ),
  );
  await waitFor(() => expect(signal).not.toBeNull());
  expect(document.body.style.overflow).toBe("hidden");
  unmount();
  expect(signal!.aborted).toBe(true);
  expect(document.body.style.overflow).toBe(previous);
});
it("shows an unavailable-card error inside a closable modal", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "Карточка не найдена" }), {
      status: 404,
    }),
  );
  render(
    wrap(
      <CardModal
        cardId={cardDetailFixture().card.id}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Карточка не найдена",
  );
  expect(
    screen.getByRole("button", { name: "Закрыть карточку" }),
  ).toBeInTheDocument();
});
