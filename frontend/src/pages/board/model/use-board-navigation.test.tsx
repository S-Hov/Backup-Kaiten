import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useBoardNavigation } from "./use-board-navigation";

function Controls() {
  const nav = useBoardNavigation();
  const location = useLocation();
  return (
    <>
      <button
        onClick={() => {
          nav.update({ search: "" }, true);
          nav.toggleArchive();
        }}
      >
        Очистить и открыть архив
      </button>
      <output aria-label="Адрес">{location.search}</output>
    </>
  );
}
it("merges consecutive updates without restoring the old search query", async () => {
  render(
    <MemoryRouter initialEntries={["/?q=old&view=lists&board=b"]}>
      <Controls />
    </MemoryRouter>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Очистить и открыть архив" }),
  );
  const params = new URLSearchParams(
    screen.getByLabelText("Адрес").textContent || "",
  );
  expect(params.has("q")).toBe(false);
  expect(params.get("archived")).toBe("1");
  expect(params.get("view")).toBe("lists");
  expect(params.get("board")).toBe("b");
});
