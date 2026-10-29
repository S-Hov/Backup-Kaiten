import { createContext, useContext } from "react";
import { z } from "zod";
import { apiClient } from "@/shared/api";

export const sessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["admin", "member", "viewer"]),
  initials: z.string().nullable(),
  timezone: z.string().nullable(),
  language: z.string().nullable(),
  sourceId: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionSchema>;
export const SessionContext = createContext<SessionUser | null>(null);
export const useSession = () => useContext(SessionContext);
const ok = z.object({ ok: z.boolean() });
export const sessionKey = ["auth", "me"] as const;
export const authApi = {
  me: () => apiClient("/auth/me", sessionSchema),
  login: (email: string, password: string) =>
    apiClient("/auth/login", sessionSchema, {
      method: "POST",
      body: { email, password },
    }),
  activate: (token: string, password: string) =>
    apiClient("/auth/activate", z.object({ email: z.string() }), {
      method: "POST",
      body: { token, password },
    }),
  logout: (all = false) =>
    apiClient(all ? "/auth/logout-all" : "/auth/logout", ok, {
      method: "POST",
    }),
  password: (currentPassword: string, newPassword: string) =>
    apiClient("/auth/password", ok, {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  sessions: () =>
    apiClient(
      "/auth/sessions",
      z.array(
        z.object({
          id: z.uuid(),
          created: z.string(),
          expires: z.string(),
          userAgent: z.string(),
          current: z.boolean(),
        }),
      ),
    ),
};
