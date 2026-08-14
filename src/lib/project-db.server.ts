import mysql from "mysql2/promise";

import {
  type ProjectPhase,
  normalizeModule,
  normalizeProject,
  normalizeProjectTeam,
  normalizeRisk,
  normalizeTeamMember,
  type Module,
  type Project,
  type ProjectTag,
  type ProjectTeam,
  type Risk,
  type TeamMember,
  type TeamRole,
} from "@/lib/tracker-types";
import initialMigrationSql from "./migrations/0001_initial.sql?raw";
import extendModuleNamesSql from "./migrations/0002_extend_project_module_names.sql?raw";
import addTeamsSql from "./migrations/0003_add_teams.sql?raw";
import softDeleteProjectsSql from "./migrations/0004_soft_delete_projects.sql?raw";
import addProjectNotionUrlSql from "./migrations/0005_add_project_notion_url.sql?raw";
import addProjectTagsSql from "./migrations/0006_add_project_tags.sql?raw";
import addProjectMembersSql from "./migrations/0007_add_project_members.sql?raw";
import removeProjectTeamLinksSql from "./migrations/0008_remove_project_team_links.sql?raw";
import addTicketModuleGroupSql from "./migrations/0009_add_ticket_module_group.sql?raw";
import addTicketSprintGroupSql from "./migrations/0010_add_ticket_sprint_group.sql?raw";
import addProjectStagesSql from "./migrations/0011_add_project_stages.sql?raw";
import addProjectDraftFlagSql from "./migrations/0012_add_project_draft_flag.sql?raw";
import addDomainMonitorsSql from "./migrations/0013_add_domain_monitors.sql?raw";
import addTeamMapTreeConfigSql from "./migrations/0014_add_team_map_tree_config.sql?raw";
import addAuthRbacSql from "./migrations/0015_add_auth_rbac.sql?raw";

export const DATABASE_NAME = "project-pal";
export const DATABASE_HOST = "127.0.0.1";
export const DATABASE_PORT = 3306;
export const DATABASE_USER = "root";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  notion_url: string | null;
  owner: string;
  team_id: string | null;
  pm_id: string | null;
  phase: string;
  start_date: string;
  target_date: string;
  uat_start_date: string | null;
  uat_end_date: string | null;
  priority: "low" | "medium" | "high";
  status: "planning" | "active" | "on_hold" | "completed";
  is_draft: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
};

type ModuleRow = {
  id: string;
  project_id: string;
  name: string;
  module_group: string | null;
  sprint_group: string | null;
  assignee: string | null;
  effort_days: number | null;
  status: Module["status"];
  planned_start: string | null;
  planned_end: string | null;
  uat: Module["uat"];
  uat_planned_start: string | null;
  uat_planned_end: string | null;
  uat_actual_start: string | null;
  uat_actual_end: string | null;
  notes: string | null;
  sort_order: number;
};

type RiskRow = {
  id: string;
  project_id: string;
  title: string;
  severity: Risk["severity"];
  mitigation: string | null;
  resolved: number;
  created_at: number;
};

type ProjectTagRow = {
  project_id: string;
  tag: ProjectTag;
};

type ProjectMemberRow = {
  project_id: string;
  member_id: string;
};

type ProjectStageRow = {
  project_id: string;
  stage_id: string;
  label: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: number;
  sort_order: number;
};

type TeamMemberRow = {
  id: string;
  name: string;
  role: TeamRole;
  title: string | null;
  manager_id: string | null;
  created_at: number;
};

type ProjectTeamRow = {
  id: string;
  name: string;
  description: string | null;
  pm_id: string | null;
  created_at: number;
};

type TeamAssignmentRow = {
  team_id: string;
  member_id: string;
  role: TeamRole;
  sort_order: number;
};

const baseConfig = {
  host: DATABASE_HOST,
  port: DATABASE_PORT,
  user: DATABASE_USER,
  password: process.env.MYSQL_PASSWORD || undefined,
  charset: "utf8mb4",
  multipleStatements: true,
  namedPlaceholders: false,
};

const adminPool = mysql.createPool({
  ...baseConfig,
  database: undefined,
});

const appPool = mysql.createPool({
  ...baseConfig,
  database: DATABASE_NAME,
});

async function ensureDatabase() {
  await adminPool.query(
    `
      CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\`
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
    `,
  );
}

export async function ensureSchema() {
  await ensureDatabase();
  await appPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(255) PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const migrations = [
    { id: "0001_initial", sql: initialMigrationSql },
    { id: "0002_extend_project_module_names", sql: extendModuleNamesSql },
    { id: "0003_add_teams", sql: addTeamsSql },
    { id: "0004_soft_delete_projects", sql: softDeleteProjectsSql },
    { id: "0005_add_project_notion_url", sql: addProjectNotionUrlSql },
    { id: "0006_add_project_tags", sql: addProjectTagsSql },
    { id: "0007_add_project_members", sql: addProjectMembersSql },
    { id: "0008_remove_project_team_links", sql: removeProjectTeamLinksSql },
    { id: "0009_add_ticket_module_group", sql: addTicketModuleGroupSql },
    { id: "0010_add_ticket_sprint_group", sql: addTicketSprintGroupSql },
    { id: "0011_add_project_stages", sql: addProjectStagesSql },
    { id: "0012_add_project_draft_flag", sql: addProjectDraftFlagSql },
    { id: "0013_add_domain_monitors", sql: addDomainMonitorsSql },
    { id: "0014_add_team_map_tree_config", sql: addTeamMapTreeConfigSql },
    { id: "0015_add_auth_rbac", sql: addAuthRbacSql },
  ] as const;

  const [appliedRows] = await appPool.query<Array<{ migration_id: string }>>(
    `SELECT migration_id FROM schema_migrations ORDER BY migration_id ASC`,
  );
  const applied = new Set(appliedRows.map((row) => row.migration_id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await appPool.query(migration.sql);
    await appPool.query(`INSERT INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)`, [
      migration.id,
      Date.now(),
    ]);
  }
}

function rowsToProjects(
  projects: ProjectRow[],
  modules: ModuleRow[],
  risks: RiskRow[],
  tags: ProjectTagRow[],
  projectMembers: ProjectMemberRow[],
  stages: ProjectStageRow[],
): Project[] {
  const modulesByProject = new Map<string, ModuleRow[]>();
  const risksByProject = new Map<string, RiskRow[]>();
  const tagsByProject = new Map<string, ProjectTag[]>();
  const membersByProject = new Map<string, string[]>();
  const stagesByProject = new Map<string, ProjectStageRow[]>();

  for (const module of modules) {
    const list = modulesByProject.get(module.project_id) ?? [];
    list.push(module);
    modulesByProject.set(module.project_id, list);
  }

  for (const risk of risks) {
    const list = risksByProject.get(risk.project_id) ?? [];
    list.push(risk);
    risksByProject.set(risk.project_id, list);
  }

  for (const row of tags) {
    const list = tagsByProject.get(row.project_id) ?? [];
    list.push(row.tag);
    tagsByProject.set(row.project_id, list);
  }

  for (const row of projectMembers) {
    const list = membersByProject.get(row.project_id) ?? [];
    list.push(row.member_id);
    membersByProject.set(row.project_id, list);
  }

  for (const stage of stages) {
    const list = stagesByProject.get(stage.project_id) ?? [];
    list.push(stage);
    stagesByProject.set(stage.project_id, list);
  }

  return projects.map((project) =>
    normalizeProject({
      id: project.id,
      name: project.name,
      description: project.description,
      notionUrl: project.notion_url ?? undefined,
      owner: project.owner,
      teamId: project.team_id ?? undefined,
      pmId: project.pm_id ?? undefined,
      phase: project.phase,
      startDate: project.start_date,
      targetDate: project.target_date,
      uatStartDate: project.uat_start_date ?? undefined,
      uatEndDate: project.uat_end_date ?? undefined,
      currentStageId: stagesByProject.get(project.id)?.find((stage) => Boolean(stage.is_current))
        ?.stage_id,
      stages: (stagesByProject.get(project.id) ?? []).map((stage) => ({
        id: stage.stage_id,
        label: stage.label,
        color: stage.color ?? undefined,
        startDate: stage.start_date ?? undefined,
        endDate: stage.end_date ?? undefined,
      })),
      priority: project.priority,
      status: project.status,
      isDraft: Boolean(project.is_draft),
      tags: tagsByProject.get(project.id) ?? [],
      memberIds: membersByProject.get(project.id) ?? [],
      createdAt: project.created_at,
      modules: (modulesByProject.get(project.id) ?? []).map((module) =>
        normalizeModule({
          id: module.id,
          name: module.name,
          moduleGroup: module.module_group ?? undefined,
          sprintGroup: module.sprint_group ?? undefined,
          assignee: module.assignee ?? undefined,
          effortDays: module.effort_days ?? undefined,
          status: module.status,
          plannedStart: module.planned_start ?? undefined,
          plannedEnd: module.planned_end ?? undefined,
          uat: module.uat,
          uatPlannedStart: module.uat_planned_start ?? undefined,
          uatPlannedEnd: module.uat_planned_end ?? undefined,
          uatActualStart: module.uat_actual_start ?? undefined,
          uatActualEnd: module.uat_actual_end ?? undefined,
          notes: module.notes ?? undefined,
        }),
      ),
      risks: (risksByProject.get(project.id) ?? []).map((risk) =>
        normalizeRisk({
          id: risk.id,
          title: risk.title,
          severity: risk.severity,
          mitigation: risk.mitigation ?? undefined,
          resolved: Boolean(risk.resolved),
          createdAt: risk.created_at,
        }),
      ),
    }),
  );
}

function makeDemoProject(project: Project): Project {
  return normalizeProject(project);
}

const demoProjects: Project[] = [
  makeDemoProject({
    id: "demo-portal-refresh",
    name: "Customer Portal Refresh",
    description:
      "Modernize the customer portal with improved onboarding, self-service, and reporting.",
    owner: "Ava Patel",
    phase: "build" satisfies ProjectPhase,
    startDate: "2026-05-18",
    targetDate: "2026-07-12",
    uatStartDate: "2026-06-24",
    uatEndDate: "2026-07-02",
    priority: "high",
    status: "active",
    tags: [],
    memberIds: [],
    modules: [
      {
        id: "demo-portal-auth",
        name: "Authentication",
        assignee: "Milo Grant",
        effortDays: 8,
        status: "completed",
        plannedStart: "2026-05-18",
        plannedEnd: "2026-05-29",
        uat: "passed",
        uatPlannedStart: "2026-06-24",
        uatPlannedEnd: "2026-06-26",
        uatActualStart: "2026-06-24",
        uatActualEnd: "2026-06-25",
      },
      {
        id: "demo-portal-billing",
        name: "Billing workspace",
        assignee: "Nina Shah",
        effortDays: 12,
        status: "in_progress",
        plannedStart: "2026-06-01",
        plannedEnd: "2026-06-28",
        uat: "pending",
      },
      {
        id: "demo-portal-analytics",
        name: "Analytics dashboard",
        assignee: "Ava Patel",
        effortDays: 10,
        status: "not_started",
        plannedStart: "2026-06-15",
        plannedEnd: "2026-07-08",
        uat: "pending",
      },
    ],
    risks: [
      {
        id: "demo-risk-portal-design",
        title: "Design sign-off still pending",
        severity: "medium",
        mitigation: "Use the approved component library and lock the review date this week.",
        resolved: false,
        createdAt: Date.now() - 2 * 86400000,
      },
    ],
    createdAt: Date.now() - 21 * 86400000,
  }),
  makeDemoProject({
    id: "demo-data-sync",
    name: "Data Sync Stabilization",
    description: "Reduce sync failures and expose reconciliation status to support teams.",
    owner: "Jordan Lee",
    phase: "uat" satisfies ProjectPhase,
    startDate: "2026-04-22",
    targetDate: "2026-06-28",
    uatStartDate: "2026-06-03",
    uatEndDate: "2026-06-21",
    priority: "medium",
    status: "active",
    tags: [],
    memberIds: [],
    modules: [
      {
        id: "demo-sync-api",
        name: "Sync API hardening",
        status: "completed",
        uat: "passed",
      },
      {
        id: "demo-sync-ui",
        name: "Reconciliation UI",
        status: "in_progress",
        uat: "in_progress",
      },
    ],
    risks: [
      {
        id: "demo-risk-sync-load",
        title: "Peak load could expose retry gaps",
        severity: "high",
        mitigation: "Run a 5x load test before UAT signoff.",
        resolved: false,
        createdAt: Date.now() - 5 * 86400000,
      },
    ],
    createdAt: Date.now() - 32 * 86400000,
  }),
  makeDemoProject({
    id: "demo-ops-complete",
    name: "Ops Workflow Cleanup",
    description: "Close out the remaining workflow improvements and hand over to BAU.",
    owner: "Samira Ahmed",
    phase: "complete" satisfies ProjectPhase,
    startDate: "2026-02-10",
    targetDate: "2026-05-03",
    priority: "low",
    status: "completed",
    tags: [],
    memberIds: [],
    modules: [
      {
        id: "demo-ops-routing",
        name: "Routing rules",
        status: "completed",
        uat: "passed",
      },
      {
        id: "demo-ops-automation",
        name: "Automation scripts",
        status: "completed",
        uat: "passed",
      },
    ],
    risks: [],
    createdAt: Date.now() - 76 * 86400000,
  }),
];

async function seedDemoData() {
  const [rows] = await appPool.query<[{ count: number }]>("SELECT COUNT(*) AS count FROM projects");
  if ((rows[0]?.count ?? 0) > 0) return;

  for (const project of demoProjects) {
    await saveProject(project);
  }
}

export async function listProjects() {
  await ensureSchema();
  await seedDemoData();

  const [projectRows] = await appPool.query<ProjectRow[]>(
    `
      SELECT
        id,
        name,
        description,
        notion_url,
        owner,
        team_id,
        pm_id,
        phase,
        start_date,
        target_date,
        uat_start_date,
        uat_end_date,
        priority,
        status,
        is_draft,
        deleted_at,
        created_at,
        updated_at
      FROM projects
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC
    `,
  );

  if (projectRows.length === 0) return [];

  const ids = projectRows.map((project) => project.id);
  const placeholders = ids.map(() => "?").join(", ");

  const [moduleRows] = await appPool.query<ModuleRow[]>(
    `
      SELECT
        id,
        project_id,
        name,
        module_group,
        sprint_group,
        assignee,
        effort_days,
        status,
        planned_start,
        planned_end,
        uat,
        uat_planned_start,
        uat_planned_end,
        uat_actual_start,
        uat_actual_end,
        notes,
        sort_order
      FROM project_modules
      WHERE project_id IN (${placeholders})
      ORDER BY sort_order ASC, id ASC
    `,
    ids,
  );

  const [riskRows] = await appPool.query<RiskRow[]>(
    `
      SELECT
        id,
        project_id,
        title,
        severity,
        mitigation,
        resolved,
        created_at
      FROM project_risks
      WHERE project_id IN (${placeholders})
      ORDER BY created_at DESC
    `,
    ids,
  );

  const [tagRows] = await appPool.query<ProjectTagRow[]>(
    `
      SELECT project_id, tag
      FROM project_tags
      WHERE project_id IN (${placeholders})
      ORDER BY tag ASC
    `,
    ids,
  );

  const [projectMemberRows] = await appPool.query<ProjectMemberRow[]>(
    `
      SELECT project_id, member_id
      FROM project_members
      WHERE project_id IN (${placeholders})
      ORDER BY sort_order ASC, member_id ASC
    `,
    ids,
  );

  const [projectStageRows] = await appPool.query<ProjectStageRow[]>(
    `
      SELECT project_id, stage_id, label, color, start_date, end_date, is_current, sort_order
      FROM project_stages
      WHERE project_id IN (${placeholders})
      ORDER BY sort_order ASC, stage_id ASC
    `,
    ids,
  );

  return rowsToProjects(
    projectRows,
    moduleRows,
    riskRows,
    tagRows,
    projectMemberRows,
    projectStageRows,
  );
}

export async function saveProject(project: Project) {
  await ensureSchema();
  const connection = await appPool.getConnection();
  const now = Date.now();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `
        INSERT INTO projects (
          id, name, description, notion_url, owner, team_id, pm_id, phase, start_date, target_date,
          uat_start_date, uat_end_date, priority, status, is_draft, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          notion_url = VALUES(notion_url),
          owner = VALUES(owner),
          team_id = VALUES(team_id),
          pm_id = VALUES(pm_id),
          phase = VALUES(phase),
          start_date = VALUES(start_date),
          target_date = VALUES(target_date),
          uat_start_date = VALUES(uat_start_date),
          uat_end_date = VALUES(uat_end_date),
          priority = VALUES(priority),
          status = VALUES(status),
          is_draft = VALUES(is_draft),
          deleted_at = NULL,
          updated_at = VALUES(updated_at)
      `,
      [
        project.id,
        project.name,
        project.description,
        project.notionUrl ?? null,
        project.owner,
        project.teamId ?? null,
        project.pmId ?? null,
        project.phase,
        project.startDate,
        project.targetDate,
        project.uatStartDate ?? null,
        project.uatEndDate ?? null,
        project.priority,
        project.status,
        project.isDraft ? 1 : 0,
        project.createdAt,
        now,
      ],
    );

    await connection.execute("DELETE FROM project_modules WHERE project_id = ?", [project.id]);
    await connection.execute("DELETE FROM project_risks WHERE project_id = ?", [project.id]);
    await connection.execute("DELETE FROM project_tags WHERE project_id = ?", [project.id]);
    await connection.execute("DELETE FROM project_members WHERE project_id = ?", [project.id]);
    await connection.execute("DELETE FROM project_stages WHERE project_id = ?", [project.id]);

    for (const tag of project.tags) {
      await connection.execute(
        "INSERT INTO project_tags (project_id, tag, created_at) VALUES (?, ?, ?)",
        [project.id, tag, now],
      );
    }

    for (let index = 0; index < project.memberIds.length; index += 1) {
      await connection.execute(
        "INSERT INTO project_members (project_id, member_id, sort_order, created_at) VALUES (?, ?, ?, ?)",
        [project.id, project.memberIds[index], index, now],
      );
    }

    for (let index = 0; index < (project.stages ?? []).length; index += 1) {
      const stage = project.stages![index];
      await connection.execute(
        `
          INSERT INTO project_stages (
            project_id, stage_id, label, color, start_date, end_date, is_current, sort_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          project.id,
          stage.id,
          stage.label,
          stage.color ?? null,
          stage.startDate ?? null,
          stage.endDate ?? null,
          stage.id === project.currentStageId ? 1 : 0,
          index,
        ],
      );
    }

    for (let index = 0; index < project.modules.length; index += 1) {
      const module = project.modules[index];
      await connection.execute(
        `
          INSERT INTO project_modules (
            id, project_id, name, module_group, sprint_group, assignee, effort_days, status,
            planned_start, planned_end, uat, uat_planned_start,
            uat_planned_end, uat_actual_start, uat_actual_end, notes, sort_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          module.id,
          project.id,
          module.name,
          module.moduleGroup ?? null,
          module.sprintGroup ?? null,
          module.assignee ?? null,
          module.effortDays ?? null,
          module.status,
          module.plannedStart ?? null,
          module.plannedEnd ?? null,
          module.uat,
          module.uatPlannedStart ?? null,
          module.uatPlannedEnd ?? null,
          module.uatActualStart ?? null,
          module.uatActualEnd ?? null,
          module.notes ?? null,
          index,
        ],
      );
    }

    for (const risk of project.risks) {
      await connection.execute(
        `
          INSERT INTO project_risks (
            id, project_id, title, severity, mitigation, resolved, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          risk.id,
          project.id,
          risk.title,
          risk.severity,
          risk.mitigation ?? null,
          risk.resolved ? 1 : 0,
          risk.createdAt,
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

  return project;
}

export async function deleteProject(id: string) {
  await ensureSchema();
  const now = Date.now();
  await appPool.execute("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?", [
    now,
    now,
    id,
  ]);
  return { id };
}

export async function listTeamData() {
  await ensureSchema();

  const [memberRows] = await appPool.query<TeamMemberRow[]>(
    `
      SELECT id, name, role, title, manager_id, created_at
      FROM team_members
      ORDER BY role ASC, name ASC
    `,
  );

  const [teamRows] = await appPool.query<ProjectTeamRow[]>(
    `
      SELECT id, name, description, pm_id, created_at
      FROM project_teams
      ORDER BY name ASC
    `,
  );

  const [assignmentRows] = await appPool.query<TeamAssignmentRow[]>(
    `
      SELECT team_id, member_id, role, sort_order
      FROM team_assignments
      ORDER BY sort_order ASC, member_id ASC
    `,
  );

  const assignmentsByTeam = new Map<string, TeamAssignmentRow[]>();
  for (const assignment of assignmentRows) {
    const assignments = assignmentsByTeam.get(assignment.team_id) ?? [];
    assignments.push(assignment);
    assignmentsByTeam.set(assignment.team_id, assignments);
  }

  return {
    members: memberRows.map((member) =>
      normalizeTeamMember({
        id: member.id,
        name: member.name,
        role: member.role,
        title: member.title ?? undefined,
        managerId: member.manager_id ?? undefined,
        createdAt: member.created_at,
      }),
    ),
    teams: teamRows.map((team) => {
      const assignments = assignmentsByTeam.get(team.id) ?? [];
      return normalizeProjectTeam({
        id: team.id,
        name: team.name,
        description: team.description ?? undefined,
        pmId: team.pm_id ?? assignments.find((assignment) => assignment.role === "pm")?.member_id,
        devIds: assignments
          .filter((assignment) => assignment.role === "dev")
          .map((assignment) => assignment.member_id),
        qaIds: assignments
          .filter((assignment) => assignment.role === "qa")
          .map((assignment) => assignment.member_id),
        createdAt: team.created_at,
      });
    }),
  };
}

export async function saveTeamMember(member: TeamMember) {
  await ensureSchema();
  const normalized = normalizeTeamMember(member);
  const now = Date.now();

  await appPool.execute(
    `
      INSERT INTO team_members (id, name, role, title, manager_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        role = VALUES(role),
        title = VALUES(title),
        manager_id = VALUES(manager_id),
        updated_at = VALUES(updated_at)
    `,
    [
      normalized.id,
      normalized.name,
      normalized.role,
      normalized.title ?? null,
      normalized.managerId ?? null,
      normalized.createdAt,
      now,
    ],
  );

  await appPool.execute("UPDATE team_assignments SET role = ? WHERE member_id = ?", [
    normalized.role,
    normalized.id,
  ]);

  if (normalized.role !== "pm") {
    await appPool.execute("UPDATE project_teams SET pm_id = NULL WHERE pm_id = ?", [normalized.id]);
  }

  return normalized;
}

export async function deleteTeamMember(id: string) {
  await ensureSchema();
  await appPool.execute("UPDATE projects SET pm_id = NULL WHERE pm_id = ?", [id]);
  await appPool.execute("UPDATE project_teams SET pm_id = NULL WHERE pm_id = ?", [id]);
  await appPool.execute("UPDATE team_members SET manager_id = NULL WHERE manager_id = ?", [id]);
  await appPool.execute("DELETE FROM team_members WHERE id = ?", [id]);
  return { id };
}

export async function saveProjectTeam(team: ProjectTeam) {
  await ensureSchema();
  const normalized = normalizeProjectTeam(team);
  const connection = await appPool.getConnection();
  const now = Date.now();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `
        INSERT INTO project_teams (id, name, description, pm_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          pm_id = VALUES(pm_id),
          updated_at = VALUES(updated_at)
      `,
      [
        normalized.id,
        normalized.name,
        normalized.description ?? null,
        normalized.pmId ?? null,
        normalized.createdAt,
        now,
      ],
    );

    await connection.execute("DELETE FROM team_assignments WHERE team_id = ?", [normalized.id]);

    const assignments = [
      ...(normalized.pmId ? [{ memberId: normalized.pmId, role: "pm" as const }] : []),
      ...normalized.devIds.map((memberId) => ({ memberId, role: "dev" as const })),
      ...normalized.qaIds.map((memberId) => ({ memberId, role: "qa" as const })),
    ];

    for (let index = 0; index < assignments.length; index += 1) {
      const assignment = assignments[index];
      await connection.execute(
        `
          INSERT INTO team_assignments (team_id, member_id, role, sort_order)
          VALUES (?, ?, ?, ?)
        `,
        [normalized.id, assignment.memberId, assignment.role, index],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return normalized;
}

export async function deleteProjectTeam(id: string) {
  await ensureSchema();
  await appPool.execute("UPDATE projects SET team_id = NULL WHERE team_id = ?", [id]);
  await appPool.execute("DELETE FROM project_teams WHERE id = ?", [id]);
  return { id };
}
