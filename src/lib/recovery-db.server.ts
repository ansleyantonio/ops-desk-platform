import { randomUUID } from "node:crypto";
import mysql, {
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { ensureSchema } from "@/lib/project-db.server";
import type {
  RecoveryRootCause,
  RecoveryStatus,
  RecoveryTask,
  RecoveryEvent,
  RecoveryProjectMode,
} from "@/lib/recovery-types";
import type { TeamRole } from "@/lib/tracker-types";

type RecoveryTaskRow = RowDataPacket & {
  id: string;
  project_id: string;
  task_id: string;
  owner_id: string | null;
  pm_id: string | null;
  tech_lead_id: string | null;
  original_estimate_days: string | number | null;
  committed_completion_date: string | null;
  actual_completion_date: string | null;
  qa_rejection_count: number;
  scope_changed: number;
  blocker_raised_date: string | null;
  resource_reassigned: number;
  root_cause: RecoveryRootCause | null;
  status: RecoveryStatus;
  created_at: number;
  updated_at: number;
};

type RecoveryModeRow = RowDataPacket & {
  project_id: string;
  active: number;
  reason: string | null;
  enabled_by: string | null;
  enabled_at: number;
  disabled_by: string | null;
  disabled_at: number | null;
  updated_at: number;
};

type RecoveryEventRow = RowDataPacket & {
  id: string;
  project_id: string;
  task_id: string | null;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  details: Record<string, unknown> | string | null;
  created_at: number;
};

type RecoveryActor = { id: string; name: string };

const pool = mysql.createPool({
  host: "127.0.0.1",
  port: 3306,
  user: process.env.MYSQL_USER || "opsdesk",
  password: process.env.MYSQL_PASSWORD || undefined,
  database: "project-pal",
  charset: "utf8mb4",
});

function toRecoveryTask(row: RecoveryTaskRow): RecoveryTask {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    ownerId: row.owner_id ?? undefined,
    pmId: row.pm_id ?? undefined,
    techLeadId: row.tech_lead_id ?? undefined,
    originalEstimateDays:
      row.original_estimate_days === null
        ? undefined
        : Number(row.original_estimate_days),
    committedCompletionDate: row.committed_completion_date ?? undefined,
    actualCompletionDate: row.actual_completion_date ?? undefined,
    qaRejectionCount: Number(row.qa_rejection_count),
    scopeChanged: Boolean(row.scope_changed),
    blockerRaisedDate: row.blocker_raised_date ?? undefined,
    resourceReassigned: Boolean(row.resource_reassigned),
    rootCause: row.root_cause ?? undefined,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toRecoveryMode(row: RecoveryModeRow): RecoveryProjectMode {
  return {
    projectId: row.project_id,
    active: Boolean(row.active),
    reason: row.reason ?? undefined,
    enabledBy: row.enabled_by ?? undefined,
    enabledAt: Number(row.enabled_at),
    disabledBy: row.disabled_by ?? undefined,
    disabledAt: row.disabled_at === null ? undefined : Number(row.disabled_at),
    updatedAt: Number(row.updated_at),
  };
}

function toRecoveryEvent(row: RecoveryEventRow): RecoveryEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id ?? undefined,
    eventType: row.event_type,
    actorId: row.actor_id ?? undefined,
    actorName: row.actor_name ?? undefined,
    details:
      row.details === null
        ? undefined
        : typeof row.details === "string"
          ? row.details
          : JSON.stringify(row.details),
    createdAt: Number(row.created_at),
  };
}

async function synchronizeActiveRecoveryTasks(allowedProjectIds?: string[]) {
  const accessClause = allowedProjectIds
    ? ` AND mode.project_id IN (${allowedProjectIds.map(() => "?").join(", ")})`
    : "";
  const connection = await pool.getConnection();
  const now = Date.now();
  try {
    await connection.beginTransaction();
    const [missing] = await connection.query<
      Array<
        RowDataPacket & {
          project_id: string;
          task_id: string;
          task_name: string;
        }
      >
    >(
      `
        SELECT module.project_id, module.id AS task_id, module.name AS task_name
        FROM project_recovery_modes mode
        INNER JOIN projects project
          ON project.id = mode.project_id AND project.deleted_at IS NULL
        INNER JOIN project_modules module ON module.project_id = project.id
        LEFT JOIN recovery_tasks recovery
          ON recovery.project_id = module.project_id
          AND recovery.task_id = module.id
        WHERE mode.active = 1 AND recovery.id IS NULL
        ${accessClause}
      `,
      allowedProjectIds,
    );

    await connection.execute(
      `
        INSERT IGNORE INTO recovery_tasks (
          id, project_id, task_id, owner_id, pm_id, tech_lead_id,
          original_estimate_days, committed_completion_date,
          actual_completion_date, qa_rejection_count, scope_changed,
          blocker_raised_date, resource_reassigned, root_cause,
          status, created_at, updated_at
        )
        SELECT
          LEFT(CONCAT('recovery-', SHA2(CONCAT(project.id, ':', module.id), 256)), 64),
          project.id,
          module.id,
          (
            SELECT member.id
            FROM team_members member
            WHERE LOWER(TRIM(member.name)) = LOWER(TRIM(module.assignee))
            LIMIT 1
          ),
          project.pm_id,
          (
            SELECT membership.member_id
            FROM project_members membership
            INNER JOIN team_members member
              ON member.id = membership.member_id AND member.role = 'dev'
            WHERE membership.project_id = project.id
            ORDER BY membership.sort_order ASC
            LIMIT 1
          ),
          module.effort_days,
          NULLIF(module.planned_end, ''),
          NULL,
          CASE WHEN module.uat = 'failed' THEN 1 ELSE 0 END,
          0,
          NULL,
          0,
          CASE WHEN module.uat = 'failed' THEN 'qa_issue' ELSE NULL END,
          CASE
            WHEN module.status = 'blocked' OR module.uat = 'failed' THEN 'red'
            WHEN module.planned_end IS NOT NULL
              AND module.planned_end <> ''
              AND module.planned_end < CURRENT_DATE() THEN 'red'
            WHEN module.planned_end IS NULL OR module.planned_end = '' THEN 'amber'
            WHEN DATEDIFF(module.planned_end, CURRENT_DATE()) <= 3 THEN 'amber'
            ELSE 'green'
          END,
          ?,
          ?
        FROM project_recovery_modes mode
        INNER JOIN projects project
          ON project.id = mode.project_id AND project.deleted_at IS NULL
        INNER JOIN project_modules module ON module.project_id = project.id
        WHERE mode.active = 1
        ${accessClause}
      `,
      [now, now, ...(allowedProjectIds ?? [])],
    );

    await connection.execute(
      `
        UPDATE recovery_tasks recovery
        INNER JOIN project_recovery_modes mode
          ON mode.project_id = recovery.project_id AND mode.active = 1
        INNER JOIN project_modules module
          ON module.project_id = recovery.project_id
          AND module.id = recovery.task_id
        SET
          recovery.qa_rejection_count = GREATEST(
            recovery.qa_rejection_count,
            CASE WHEN module.uat = 'failed' THEN 1 ELSE 0 END
          ),
          recovery.root_cause = CASE
            WHEN module.uat = 'failed' AND recovery.root_cause IS NULL THEN 'qa_issue'
            ELSE recovery.root_cause
          END,
          recovery.scope_changed = CASE
            WHEN COALESCE(NULLIF(module.planned_end, ''), '') <>
              COALESCE(recovery.committed_completion_date, '') THEN 1
            ELSE recovery.scope_changed
          END,
          recovery.status = CASE
            WHEN module.status = 'blocked' OR module.uat = 'failed' THEN 'red'
            WHEN recovery.committed_completion_date IS NOT NULL
              AND recovery.committed_completion_date < CURRENT_DATE()
              AND module.status <> 'completed' THEN 'red'
            WHEN recovery.committed_completion_date IS NULL
              AND recovery.status = 'green' THEN 'amber'
            WHEN COALESCE(NULLIF(module.planned_end, ''), '') <>
              COALESCE(recovery.committed_completion_date, '')
              AND recovery.status <> 'red' THEN 'amber'
            ELSE recovery.status
          END
        WHERE 1 = 1
        ${accessClause}
      `,
      allowedProjectIds,
    );

    for (const task of missing) {
      await connection.execute(
        `
          INSERT INTO recovery_events (
            id, project_id, task_id, event_type,
            actor_id, actor_name, details, created_at
          ) VALUES (?, ?, ?, 'task_auto_enrolled', NULL, 'System sync', ?, ?)
        `,
        [
          randomUUID(),
          task.project_id,
          task.task_id,
          JSON.stringify({ taskName: task.task_name }),
          now,
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listRecoveryTasks(allowedProjectIds?: string[]) {
  await ensureSchema();
  if (allowedProjectIds && allowedProjectIds.length === 0) return [];
  await synchronizeActiveRecoveryTasks(allowedProjectIds);

  const accessClause = allowedProjectIds
    ? ` AND r.project_id IN (${allowedProjectIds.map(() => "?").join(", ")})`
    : "";
  const [rows] = await pool.query<RecoveryTaskRow[]>(
    `
      SELECT
        r.id, r.project_id, r.task_id, r.owner_id, r.pm_id, r.tech_lead_id,
        r.original_estimate_days, r.committed_completion_date, r.actual_completion_date,
        r.qa_rejection_count, r.scope_changed, r.blocker_raised_date,
        r.resource_reassigned, r.root_cause, r.status, r.created_at, r.updated_at
      FROM recovery_tasks r
      INNER JOIN projects p ON p.id = r.project_id AND p.deleted_at IS NULL
      LEFT JOIN project_recovery_modes mode ON mode.project_id = r.project_id
      WHERE (mode.project_id IS NULL OR mode.active = 1)
      ${accessClause}
      ORDER BY r.updated_at DESC,
        COALESCE(r.committed_completion_date, '') DESC,
        r.created_at DESC
    `,
    allowedProjectIds,
  );
  return rows.map(toRecoveryTask);
}

export async function listRecoveryModes(allowedProjectIds?: string[]) {
  await ensureSchema();
  if (allowedProjectIds && allowedProjectIds.length === 0) return [];
  const accessClause = allowedProjectIds
    ? ` AND mode.project_id IN (${allowedProjectIds.map(() => "?").join(", ")})`
    : "";
  const [rows] = await pool.query<RecoveryModeRow[]>(
    `
      SELECT mode.*
      FROM project_recovery_modes mode
      INNER JOIN projects p ON p.id = mode.project_id AND p.deleted_at IS NULL
      WHERE 1 = 1
      ${accessClause}
      ORDER BY mode.active DESC, mode.updated_at DESC
    `,
    allowedProjectIds,
  );
  return rows.map(toRecoveryMode);
}

export async function listRecoveryEvents(
  allowedProjectIds?: string[],
  limit = 500,
) {
  await ensureSchema();
  if (allowedProjectIds && allowedProjectIds.length === 0) return [];
  const accessClause = allowedProjectIds
    ? ` AND event.project_id IN (${allowedProjectIds.map(() => "?").join(", ")})`
    : "";
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const [rows] = await pool.query<RecoveryEventRow[]>(
    `
      SELECT event.*
      FROM recovery_events event
      INNER JOIN projects p ON p.id = event.project_id AND p.deleted_at IS NULL
      WHERE 1 = 1
      ${accessClause}
      ORDER BY event.created_at DESC
      LIMIT ${safeLimit}
    `,
    allowedProjectIds,
  );
  return rows.map(toRecoveryEvent);
}

export async function setProjectRecoveryMode(
  projectId: string,
  enabled: boolean,
  reason: string | undefined,
  actor: RecoveryActor,
) {
  await ensureSchema();
  const connection = await pool.getConnection();
  const now = Date.now();
  try {
    await connection.beginTransaction();
    const [projects] = await connection.query<
      Array<RowDataPacket & { id: string }>
    >(
      "SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [projectId],
    );
    if (!projects[0]) throw new Error("Project not found.");

    let enrolledTasks = 0;
    if (enabled) {
      await connection.execute(
        `
          INSERT INTO project_recovery_modes (
            project_id, active, reason, enabled_by, enabled_at,
            disabled_by, disabled_at, updated_at
          )
          VALUES (?, 1, ?, ?, ?, NULL, NULL, ?)
          ON DUPLICATE KEY UPDATE
            active = 1,
            reason = VALUES(reason),
            enabled_by = VALUES(enabled_by),
            enabled_at = VALUES(enabled_at),
            disabled_by = NULL,
            disabled_at = NULL,
            updated_at = VALUES(updated_at)
        `,
        [projectId, reason ?? null, actor.id, now, now],
      );
      const [result] = await connection.execute<ResultSetHeader>(
        `
          INSERT IGNORE INTO recovery_tasks (
            id, project_id, task_id, owner_id, pm_id, tech_lead_id,
            original_estimate_days, committed_completion_date,
            actual_completion_date, qa_rejection_count, scope_changed,
            blocker_raised_date, resource_reassigned, root_cause,
            status, created_at, updated_at
          )
          SELECT
            LEFT(CONCAT('recovery-', SHA2(CONCAT(p.id, ':', module.id), 256)), 64),
            p.id,
            module.id,
            (
              SELECT member.id
              FROM team_members member
              WHERE LOWER(TRIM(member.name)) = LOWER(TRIM(module.assignee))
              LIMIT 1
            ),
            p.pm_id,
            (
              SELECT membership.member_id
              FROM project_members membership
              INNER JOIN team_members member
                ON member.id = membership.member_id AND member.role = 'dev'
              WHERE membership.project_id = p.id
              ORDER BY membership.sort_order ASC
              LIMIT 1
            ),
            module.effort_days,
            NULLIF(module.planned_end, ''),
            NULL,
            CASE WHEN module.uat = 'failed' THEN 1 ELSE 0 END,
            0,
            NULL,
            0,
            CASE WHEN module.uat = 'failed' THEN 'qa_issue' ELSE NULL END,
            CASE
              WHEN module.status = 'blocked' OR module.uat = 'failed' THEN 'red'
              WHEN module.planned_end IS NOT NULL
                AND module.planned_end <> ''
                AND module.planned_end < CURRENT_DATE() THEN 'red'
              WHEN module.planned_end IS NULL OR module.planned_end = '' THEN 'amber'
              WHEN DATEDIFF(module.planned_end, CURRENT_DATE()) <= 3 THEN 'amber'
              ELSE 'green'
            END,
            ?,
            ?
          FROM projects p
          INNER JOIN project_modules module ON module.project_id = p.id
          WHERE p.id = ? AND p.deleted_at IS NULL
        `,
        [now, now, projectId],
      );
      enrolledTasks = result.affectedRows;
    } else {
      const [result] = await connection.execute<ResultSetHeader>(
        `
          UPDATE project_recovery_modes
          SET active = 0, disabled_by = ?, disabled_at = ?, updated_at = ?
          WHERE project_id = ? AND active = 1
        `,
        [actor.id, now, now, projectId],
      );
      if (result.affectedRows === 0) {
        throw new Error("This project is not currently in Recovery mode.");
      }
    }

    await connection.execute(
      `
        INSERT INTO recovery_events (
          id, project_id, task_id, event_type, actor_id, actor_name, details, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        projectId,
        enabled ? "recovery_mode_enabled" : "recovery_mode_disabled",
        actor.id,
        actor.name,
        JSON.stringify({ reason: reason ?? null, enrolledTasks }),
        now,
      ],
    );
    await connection.commit();
    return { projectId, active: enabled, enrolledTasks };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assertMemberRole(
  memberId: string | undefined,
  fieldLabel: string,
  allowedRoles?: TeamRole[],
) {
  if (!memberId) return;
  const [rows] = await pool.query<Array<RowDataPacket & { role: TeamRole }>>(
    "SELECT role FROM team_members WHERE id = ? LIMIT 1",
    [memberId],
  );
  if (!rows[0])
    throw new Error(`${fieldLabel} was not found in the people directory.`);
  if (allowedRoles && !allowedRoles.includes(rows[0].role)) {
    throw new Error(`${fieldLabel} does not have an eligible role.`);
  }
}

export async function saveRecoveryTask(
  task: RecoveryTask,
  actor?: RecoveryActor,
) {
  await ensureSchema();
  const [ticketRows] = await pool.query<Array<RowDataPacket & { id: string }>>(
    `
      SELECT m.id
      FROM project_modules m
      INNER JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
      WHERE m.id = ? AND m.project_id = ?
      LIMIT 1
    `,
    [task.taskId, task.projectId],
  );
  if (!ticketRows[0])
    throw new Error("The selected task does not belong to this project.");

  await Promise.all([
    assertMemberRole(task.ownerId, "Owner"),
    assertMemberRole(task.pmId, "PM", ["pm"]),
    assertMemberRole(task.techLeadId, "Tech Lead", ["dev"]),
  ]);

  const [duplicates] = await pool.query<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM recovery_tasks WHERE project_id = ? AND task_id = ? LIMIT 1",
    [task.projectId, task.taskId],
  );
  if (duplicates[0] && duplicates[0].id !== task.id) {
    throw new Error("This task is already on the recovery dashboard.");
  }

  const now = Date.now();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `
      INSERT INTO recovery_tasks (
        id, project_id, task_id, owner_id, pm_id, tech_lead_id,
        original_estimate_days, committed_completion_date, actual_completion_date,
        qa_rejection_count, scope_changed, blocker_raised_date,
        resource_reassigned, root_cause, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        owner_id = VALUES(owner_id),
        pm_id = VALUES(pm_id),
        tech_lead_id = VALUES(tech_lead_id),
        original_estimate_days = VALUES(original_estimate_days),
        committed_completion_date = VALUES(committed_completion_date),
        actual_completion_date = VALUES(actual_completion_date),
        qa_rejection_count = VALUES(qa_rejection_count),
        scope_changed = VALUES(scope_changed),
        blocker_raised_date = VALUES(blocker_raised_date),
        resource_reassigned = VALUES(resource_reassigned),
        root_cause = VALUES(root_cause),
        status = VALUES(status),
        updated_at = VALUES(updated_at)
      `,
      [
        task.id,
        task.projectId,
        task.taskId,
        task.ownerId ?? null,
        task.pmId ?? null,
        task.techLeadId ?? null,
        task.originalEstimateDays ?? null,
        task.committedCompletionDate ?? null,
        task.actualCompletionDate ?? null,
        task.qaRejectionCount,
        task.scopeChanged ? 1 : 0,
        task.blockerRaisedDate ?? null,
        task.resourceReassigned ? 1 : 0,
        task.rootCause ?? null,
        task.status,
        task.createdAt,
        now,
      ],
    );
    await connection.execute(
      `
        INSERT INTO recovery_events (
          id, project_id, task_id, event_type, actor_id, actor_name, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        task.projectId,
        task.taskId,
        duplicates[0] ? "recovery_task_updated" : "recovery_task_added",
        actor?.id ?? null,
        actor?.name ?? "System",
        JSON.stringify({
          committedCompletionDate: task.committedCompletionDate ?? null,
          status: task.status,
          rootCause: task.rootCause ?? null,
          qaRejectionCount: task.qaRejectionCount,
          scopeChanged: task.scopeChanged,
          resourceReassigned: task.resourceReassigned,
        }),
        now,
      ],
    );
    await connection.commit();
    return { ...task, updatedAt: now };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteRecoveryTask(id: string, actor?: RecoveryActor) {
  await ensureSchema();
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        project_id: string;
        task_id: string;
        active: number | null;
      }
    >
  >(
    `
      SELECT task.project_id, task.task_id, mode.active
      FROM recovery_tasks task
      LEFT JOIN project_recovery_modes mode ON mode.project_id = task.project_id
      WHERE task.id = ?
      LIMIT 1
    `,
    [id],
  );
  const current = rows[0];
  if (!current) throw new Error("Recovery task not found.");
  if (current.active) {
    throw new Error(
      "Every task is mandatory while this project is in Recovery mode. Exit Recovery mode before removing it.",
    );
  }
  const connection = await pool.getConnection();
  const now = Date.now();
  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM recovery_tasks WHERE id = ?", [id]);
    await connection.execute(
      `
        INSERT INTO recovery_events (
          id, project_id, task_id, event_type, actor_id, actor_name, details, created_at
        ) VALUES (?, ?, ?, 'recovery_task_removed', ?, ?, NULL, ?)
      `,
      [
        randomUUID(),
        current.project_id,
        current.task_id,
        actor?.id ?? null,
        actor?.name ?? "System",
        now,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { id };
}

export async function recoveryTaskProjectId(id: string) {
  await ensureSchema();
  const [rows] = await pool.query<
    Array<RowDataPacket & { project_id: string }>
  >("SELECT project_id FROM recovery_tasks WHERE id = ? LIMIT 1", [id]);
  return rows[0]?.project_id;
}
