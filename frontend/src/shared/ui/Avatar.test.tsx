import { expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar } from "./index";

it("falls back on a broken portrait and retries when the avatar changes", () => {
  const src =
    "/api/v1/users/11111111-1111-4111-8111-111111111111/avatar?v=22222222-2222-4222-8222-222222222222";
  const { container, rerender } = render(
    <Avatar label="Анна Иванова" src={src} />,
  );
  expect(container.querySelector("img")).toHaveAttribute("src", src);
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByText("АИ")).toBeInTheDocument();
  rerender(
    <Avatar label="Анна Иванова" src={src.replace("22222222-", "33333333-")} />,
  );
  expect(container.querySelector("img")).toBeInTheDocument();
  rerender(
    <Avatar
      label="Анна Иванова"
      initials="АК"
      src="https://external.test/avatar.png"
    />,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("АК")).toBeInTheDocument();
});
