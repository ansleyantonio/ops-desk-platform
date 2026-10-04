import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  RECOVERY_STATUSES,
  ROOT_CAUSE_VALUES,
  type RecoveryTask,
} from "@/lib/recovery-types";

const optionalId = z.string().min(1).max(64).optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const recoveryTaskSchema: z.ZodType<RecoveryTask> = z.object({
  id: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  taskId: z.string().min(1).max(64),
  ownerId: optionalId,
  pmId: optionalId,
  techLeadId: optionalId,
  originalEstimateDays: z.number().nonnegative().max(99999).optional(),
  committedCompletionDate: optionalDate,
  actualCompletionDate: optionalDate,
  qaRejectionCount: z.number().int().nonnegative().max(100000),
  scopeChanged: z.boolean(),
  blockerRaisedDate: optionalDate,
  resourceReassigned: z.boolean(),
  rootCause: z.enum(ROOT_CAUSE_VALUES).optional(),
  status: z.enum(RECOVERY_STATUSES),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

function canAccessProject(
  user: { role: string; projectIds: string[] },
  projectId: string,
) {
  return user.role === "admin" || user.projectIds.includes(projectId);
}

export const listRecoveryTasks = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:view");
    const server = await import("./recovery-db.server");
    return server.listRecoveryTasks(
      user.role === "admin" ? undefined : user.projectIds,
    );
  },
);

export const listRecoveryModes = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:view");
    const server = await import("./recovery-db.server");
    return server.listRecoveryModes(
      user.role === "admin" ? undefined : user.projectIds,
    );
  },
);

export const listRecoveryEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:view");
    const server = await import("./recovery-db.server");
    return server.listRecoveryEvents(
      user.role === "admin" ? undefined : user.projectIds,
    );
  },
);

const recoveryModeSchema = z.object({
  projectId: z.string().min(1).max(64),
  enabled: z.boolean(),
  reason: z.string().trim().max(1000).optional(),
});

export const setProjectRecoveryMode = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; enabled: boolean; reason?: string }) =>
    recoveryModeSchema.parse(data),
  )
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:manage");
    if (!canAccessProject(user, data.projectId)) {
      throw new Error("You do not have access to this project.");
    }
    const server = await import("./recovery-db.server");
    return server.setProjectRecoveryMode(
      data.projectId,
      data.enabled,
      data.reason?.trim() || undefined,
      { id: user.id, name: user.name },
    );
  });

export const saveRecoveryTask = createServerFn({ method: "POST" })
  .validator((task: RecoveryTask) => recoveryTaskSchema.parse(task))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:manage");
    if (!canAccessProject(user, data.projectId)) {
      throw new Error("You do not have access to this project.");
    }
    const server = await import("./recovery-db.server");
    return server.saveRecoveryTask(data, { id: user.id, name: user.name });
  });

export const deleteRecoveryTask = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({
    id: z.string().min(1).max(64).parse(data.id),
  }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./auth.server");
    const user = await requirePermission("projects:manage");
    const server = await import("./recovery-db.server");
    const projectId = await server.recoveryTaskProjectId(data.id);
    if (!projectId) throw new Error("Recovery task not found.");
    if (!canAccessProject(user, projectId)) {
      throw new Error("You do not have access to this project.");
    }
    return server.deleteRecoveryTask(data.id, {
      id: user.id,
      name: user.name,
    });
  });
