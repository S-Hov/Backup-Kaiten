import { z } from "zod";
import { apiClient } from "@/shared/api";
const role = z.enum(["admin", "member", "viewer"]);
const user = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  sourceId: z.string().nullable(),
  sourceActive: z.boolean(),
  timezone: z.string().nullable(),
  language: z.string().nullable(),
  initials: z.string().nullable(),
  avatarUrl: z.string().nullable().optional(),
  accountId: z.uuid().nullable(),
  role: role.nullable(),
  status: z.enum(["active", "disabled", "pending", "no-access"]),
  hasPassword: z.boolean(),
});
export type DirectoryUser = z.infer<typeof user>;
export type AccountRole = z.infer<typeof role>;
export const userApi = {
  list: () => apiClient("/auth/users", z.array(user)),
  invite: (email: string, role: AccountRole) =>
    apiClient(
      "/auth/invitations",
      z.object({
        token: z.string(),
        email: z.string(),
        expiresInHours: z.number(),
        accountId: z.uuid(),
      }),
      { method: "POST", body: { email, role } },
    ),
  access: (id: string, active: boolean, role: AccountRole, revoke = false) =>
    apiClient(`/auth/accounts/${id}/access`, z.object({ ok: z.boolean() }), {
      method: "POST",
      body: { active, role, revoke },
    }),
};
