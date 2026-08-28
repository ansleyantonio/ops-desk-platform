import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { APP_ROLES } from "./auth";

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("./auth.server");
  return getSessionUser();
});

export const login = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) =>
    z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(8).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { loginWithPassword } = await import("./auth.server");
    const user = await loginWithPassword(data.email, data.password);
    return user ? { ok: true as const, user } : { ok: false as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutSession } = await import("./auth.server");
  await logoutSession();
  return { ok: true as const };
});

export const listAppUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { listUsers } = await import("./auth.server");
  return listUsers();
});

export const createAppUser = createServerFn({ method: "POST" })
  .validator((data: { name: string; email: string; password: string; role: string }) =>
    z
      .object({
        name: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(255),
        password: z.string().min(12).max(200),
        role: z.enum(APP_ROLES),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createUser } = await import("./auth.server");
    return createUser(data);
  });

export const updateAppUser = createServerFn({ method: "POST" })
  .validator((data: { id: string; role: string; status: string }) =>
    z
      .object({
        id: z.string().min(1).max(64),
        role: z.enum(APP_ROLES),
        status: z.enum(["active", "suspended"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { updateUser } = await import("./auth.server");
    return updateUser(data);
  });

export const resetAppUserPassword = createServerFn({ method: "POST" })
  .validator((data: { id: string; password: string }) =>
    z.object({ id: z.string().min(1).max(64), password: z.string().min(12).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { resetUserPassword } = await import("./auth.server");
    await resetUserPassword(data.id, data.password);
    return { ok: true as const };
  });

export const updateAppUserProjects = createServerFn({ method: "POST" })
  .validator((data: { id: string; projectIds: string[] }) =>
    z.object({ id: z.string().min(1).max(64), projectIds: z.array(z.string().min(1).max(64)).max(500) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { updateUserProjects } = await import("./auth.server");
    return updateUserProjects(data.id, data.projectIds);
  });
