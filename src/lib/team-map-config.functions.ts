import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { TeamMapTreeConfig } from "@/lib/team-map-config";

const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["dev", "qa", "support", "web"]),
  status: z.enum(["existing", "new_joinee"]),
  offerSent: z.boolean().optional(),
});

const requirementsSchema = z.object({
  dev: z.number().int().min(0).max(999),
  qa: z.number().int().min(0).max(999),
  support: z.number().int().min(0).max(999),
});

const projectSchema = z.object({
  id: z.string().min(1),
  sourceProjectId: z.string().min(1).optional(),
  name: z.string().min(1),
  category: z.enum(["education", "internal_tools", "b2c", "websites", "untagged"]),
  hidden: z.boolean(),
  people: z.array(personSchema),
  requirements: requirementsSchema,
});

const orgNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  status: z.string().optional(),
  tone: z.enum(["candidate", "manager", "vacancy"]),
});

const configSchema: z.ZodType<TeamMapTreeConfig> = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
  pmVacancies: z.array(orgNodeSchema),
  qualityLead: orgNodeSchema,
  qualityReports: z.array(orgNodeSchema),
  updatedAt: z.number().int().nonnegative(),
});

export const getTeamMapTreeConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server");
  await requirePermission("teams:view");
  const server = await import("./team-map-config.server");
  return server.getTeamMapTreeConfig();
});

export const saveTeamMapTreeConfig = createServerFn({ method: "POST" })
  .validator((config: TeamMapTreeConfig) => configSchema.parse(config))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const server = await import("./team-map-config.server");
    return server.saveTeamMapTreeConfig(data);
  });
