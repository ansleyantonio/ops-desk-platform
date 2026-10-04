import { createServerFn } from "@tanstack/react-start";

export const listLiveWork = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:view");
    const { getLiveWorkSnapshot } = await import("./live-work.server");
    return getLiveWorkSnapshot(
      user.role === "admin" ? undefined : user.projectIds,
    );
  },
);
