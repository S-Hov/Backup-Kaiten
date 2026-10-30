import { expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  authApi,
  SessionContext,
  sessionKey,
  type SessionUser,
} from "@/entities/session";
import { EditAvatar } from "./index";
afterEach(() => vi.restoreAllMocks());

it("uploads the selected file, refreshes avatar data, and can restore the imported portrait", async () => {
  const user: SessionUser = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Анна",
    email: "anna@example.test",
    role: "viewer",
    initials: "А",
    timezone: null,
    language: null,
    sourceId: null,
  };
  const url = `/api/v1/users/${user.id}/avatar?v=22222222-2222-4222-8222-222222222222`;
  const upload = vi
    .spyOn(authApi, "avatar")
    .mockResolvedValue({ avatarUrl: url });
  const restore = vi
    .spyOn(authApi, "resetAvatar")
    .mockResolvedValue({ avatarUrl: null });
  const client = new QueryClient();
  client.setQueryData(sessionKey, user);
  render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={user}>
        <EditAvatar />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Сохранить аватарку" }),
  ).toBeDisabled();
  const file = new File(["picture"], "avatar.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText("Выбрать изображение"), file);
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить аватарку" }),
  );
  await waitFor(() => expect(upload).toHaveBeenCalledWith(file));
  await waitFor(() =>
    expect(client.getQueryData<SessionUser>(sessionKey)?.avatarUrl).toBe(url),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Вернуть из Kaiten" }),
  );
  await waitFor(() => expect(restore).toHaveBeenCalledWith("imported"));
});
