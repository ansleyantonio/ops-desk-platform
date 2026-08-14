import { createServerFn } from "@tanstack/react-start";

export const getTechRadar = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server");
  await requirePermission("projects:view");
  const { loadTechRadar } = await import("./tech-radar.server");
  return loadTechRadar();
});
