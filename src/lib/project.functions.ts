import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Project, ProjectTeam, TeamMember } from "@/lib/tracker-types";

const moduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  moduleGroup: z.string().optional(),
  sprintGroup: z.string().optional(),
  assignee: z.string().optional(),
  effortDays: z.number().int().nonnegative().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  uat: z.enum(["pending", "in_progress", "passed", "failed"]),
  uatPlannedStart: z.string().optional(),
  uatPlannedEnd: z.string().optional(),
  uatActualStart: z.string().optional(),
  uatActualEnd: z.string().optional(),
  notes: z.string().optional(),
});

const riskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  mitigation: z.string().optional(),
  resolved: z.boolean().optional(),
  createdAt: z.number().int().nonnegative(),
});

const projectStageSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const projectSchema: z.ZodType<Project> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  notionUrl: z.string().optional(),
  owner: z.string(),
  pmId: z.string().optional(),
  teamId: z.string().optional(),
  memberIds: z.array(z.string().min(1)),
  phase: z.enum(["discovery", "build", "uat", "go_live", "hypercare", "complete", "paused"]),
  startDate: z.string(),
  targetDate: z.string(),
  uatStartDate: z.string().optional(),
  uatEndDate: z.string().optional(),
  currentStageId: z.string().optional(),
  stages: z.array(projectStageSchema).optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["planning", "active", "on_hold", "completed"]),
  isDraft: z.boolean().optional(),
  tags: z.array(z.enum(["education", "internal_tools", "b2c", "websites"])),
  modules: z.array(moduleSchema),
  risks: z.array(riskSchema),
  createdAt: z.number().int().nonnegative(),
});

const teamMemberSchema: z.ZodType<TeamMember> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["pm", "dev", "qa"]),
  title: z.string().optional(),
  managerId: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
});

const projectTeamSchema: z.ZodType<ProjectTeam> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  pmId: z.string().optional(),
  devIds: z.array(z.string().min(1)),
  qaIds: z.array(z.string().min(1)),
  createdAt: z.number().int().nonnegative(),
});

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server");
  await requirePermission("projects:view");
  const { listProjects } = await import("./project-db.server");
  return listProjects();
});

export const saveProject = createServerFn({ method: "POST" })
  .validator((project: Project) => projectSchema.parse(project))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("projects:manage");
    const { saveProject } = await import("./project-db.server");
    return saveProject(data);
  });

export const deleteProject = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({
    id: z.string().min(1).parse(data.id),
  }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("projects:manage");
    const { deleteProject } = await import("./project-db.server");
    return deleteProject(data.id);
  });

export const listTeamData = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server");
  await requirePermission("teams:view");
  const { listTeamData } = await import("./project-db.server");
  return listTeamData();
});

export const saveTeamMember = createServerFn({ method: "POST" })
  .validator((member: TeamMember) => teamMemberSchema.parse(member))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const { saveTeamMember } = await import("./project-db.server");
    return saveTeamMember(data);
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({
    id: z.string().min(1).parse(data.id),
  }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const { deleteTeamMember } = await import("./project-db.server");
    return deleteTeamMember(data.id);
  });

export const saveProjectTeam = createServerFn({ method: "POST" })
  .validator((team: ProjectTeam) => projectTeamSchema.parse(team))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const { saveProjectTeam } = await import("./project-db.server");
    return saveProjectTeam(data);
  });

export const deleteProjectTeam = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({
    id: z.string().min(1).parse(data.id),
  }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("teams:manage");
    const { deleteProjectTeam } = await import("./project-db.server");
    return deleteProjectTeam(data.id);
  });
