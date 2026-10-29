import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { pageRoutes } from "./AppRouter";
vi.mock("@/pages/board", () => ({ BoardPage: () => <h1>Доска</h1> }));
vi.mock("@/pages/archive", () => ({ ArchivePage: () => <h1>Архив копий</h1> }));

it("keeps bookmarked archive links and their query parameters", async () => {
  const router = createMemoryRouter(pageRoutes, {
    initialEntries: ["/?snapshot=s&card=42"],
  });
  render(<RouterProvider router={router} />);
  expect(
    await screen.findByRole("heading", { name: "Архив копий" }),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/archive");
  expect(router.state.location.search).toBe("?snapshot=s&card=42");
  router.dispose();
});
it("opens working board query states without redirecting them to the legacy archive", async () => {
  const router = createMemoryRouter(pageRoutes, {
    initialEntries: ["/?view=lists&archived=1&cardId=uuid&q=test"],
  });
  render(<RouterProvider router={router} />);
  expect(
    await screen.findByRole("heading", { name: "Доска" }),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/");
  router.dispose();
});
