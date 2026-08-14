import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const domainIdSchema = z.object({ id: z.string().min(1).max(64) });

export const listDomainMonitors = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server");
  await requirePermission("domains:view");
  const { listDomainMonitors } = await import("./domain-monitor.server");
  return listDomainMonitors();
});

export const addDomainMonitor = createServerFn({ method: "POST" })
  .validator((data: { hostname: string }) =>
    z.object({ hostname: z.string().trim().min(1).max(500) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("domains:manage");
    const { addDomainMonitor } = await import("./domain-monitor.server");
    return addDomainMonitor(data.hostname);
  });

export const refreshDomainMonitor = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => domainIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("domains:manage");
    const { refreshDomainMonitor } = await import("./domain-monitor.server");
    return refreshDomainMonitor(data.id);
  });

export const deleteDomainMonitor = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => domainIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("domains:manage");
    const { deleteDomainMonitor } = await import("./domain-monitor.server");
    return deleteDomainMonitor(data.id);
  });
