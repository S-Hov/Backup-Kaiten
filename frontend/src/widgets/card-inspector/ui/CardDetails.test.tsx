import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetails } from "./CardDetails";
import { cardFixture } from "@/test/fixture";

describe("card details", () => {
  it("retains discussion, checklists, unavailable files and unknown JSON fields", async () => {
    const user = userEvent.setup();
    render(<CardDetails model={cardFixture()} onOpen={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "Заказ 123" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Текст заказа")).toBeInTheDocument();
    expect(screen.getByText("Комментарий заказа")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.getByText("Не скачано")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /История/ }));
    expect(
      screen.getByText("Этот раздел не был сохранён в резервной копии"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "JSON" }));
    expect(
      screen.getByText(/Сохранённое неизвестное поле/, { selector: "pre" }),
    ).toBeInTheDocument();
  });
  it("opens related cards through a callback without making API requests", async () => {
    const onOpen = vi.fn();
    render(<CardDetails model={cardFixture()} onOpen={onOpen} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Связанный заказ/ }),
    );
    expect(onOpen).toHaveBeenCalledWith(456);
  });
});
