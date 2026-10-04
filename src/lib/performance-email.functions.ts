import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPerformanceEmailConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server");
  await requirePermission("teams:manage");
  const { getPerformanceEmailSettings } = await import("./performance-email.server");
  return getPerformanceEmailSettings();
});

export const updatePerformanceEmailConfig = createServerFn({ method: "POST" })
  .validator((data: { enabled: boolean; recipients: string; targetHours: number }) => z.object({
    enabled: z.boolean(), recipients: z.string().max(8000), targetHours: z.number().positive().max(24),
  }).parse(data))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const { savePerformanceEmailSettings } = await import("./performance-email.server");
    return savePerformanceEmailSettings(data);
  });

export const dispatchPerformanceEmail = createServerFn({ method: "POST" })
  .validator((data: { date: string; testTo?: string }) => z.object({ date: z.string(), testTo: z.string().email().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const { sendPerformanceEmail } = await import("./performance-email.server");
    return sendPerformanceEmail({ ...data, manual: true });
  });
