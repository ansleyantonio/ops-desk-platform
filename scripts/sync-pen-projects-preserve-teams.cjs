const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { applyStoredStatusHistory } = require("./pen-status-history.cjs");

const API_BASE = process.env.PEN_API_BASE || "https://ticketing-system.pengroup.com";
const API_TOKEN = process.env.PEN_API_TOKEN;
const DATABASE_NAME = process.env.MYSQL_DATABASE || "project-pal";
const OUTPUT_DIR = path.resolve("outputs");
const DAY_MS = 86400000;
const REQUESTED_PROJECTS = String(process.env.PEN_PROJECTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const SYNC_TEAM_MEMBERS = process.env.PEN_SYNC_TEAM_MEMBERS === "1";
const RECONCILE_DUPLICATE_PROJECTS = process.env.PEN_RECONCILE_DUPLICATES === "1";

if (!API_TOKEN) {
  console.error("Missing PEN_API_TOKEN.");
  process.exit(1);
}

function apiUrl(endpoint) {
  return `${API_BASE}${endpoint}`;
}

async function apiGet(endpoint) {
  for (let attempt = 0; ; attempt++) {
    try { return await apiGetOnce(endpoint); }
    catch (error) {
      if (error.status === 404 || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

async function apiGetOnce(endpoint) {
  const response = await fetch(apiUrl(endpoint), {
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${endpoint} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${endpoint} returned ${contentType || "unknown content type"}`);
  }

  return JSON.parse(text);
}

function dateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function earliestDate(values) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));
  if (!times.length) return "";
  return new Date(Math.min(...times)).toISOString().slice(0, 10);
}

function latestDate(values) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));
  if (!times.length) return "";
  return new Date(Math.max(...times)).toISOString().slice(0, 10);
}

function normalizePriority(value) {
  const priority = String(value || "").toLowerCase();
  if (priority === "critical" || priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function priorityRank(priority) {
  return { low: 1, medium: 2, high: 3 }[priority] || 2;
}

function maxPriority(tickets) {
  return tickets.reduce((current, ticket) => {
    const next = normalizePriority(ticket.priority);
    return priorityRank(next) > priorityRank(current) ? next : current;
  }, "medium");
}

function normalizeModuleStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["done", "live", "completed", "closed", "archived"].includes(status)) return "completed";
  if (["blocked", "stuck"].includes(status)) return "blocked";
  if (["in progress", "in review", "testing", "qa", "review"].includes(status))
    return "in_progress";
  return "not_started";
}

function normalizeReviewStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["done", "live", "completed", "closed", "archived"].includes(status)) return "passed";
  if (["blocked", "failed", "rejected"].includes(status)) return "failed";
  if (["in review", "testing", "qa", "review"].includes(status)) return "in_progress";
  return "pending";
}

function normalizeProjectStatus(apiStatus, tickets, currentStage) {
  const status = `${apiStatus || ""} ${currentStage?.label || ""}`.toLowerCase();
  if (["paused", "on_hold", "on hold", "blocked"].some((value) => status.includes(value))) {
    return "on_hold";
  }
  if (
    ["pipeline", "planning", "planned", "backlog", "discovery"].some((value) =>
      status.includes(value),
    )
  ) {
    return "planning";
  }
  if (["live", "done", "completed", "closed", "archived"].some((value) => status.includes(value))) {
    return "completed";
  }
  if (currentStage) return "active";
  if (
    tickets.length > 0 &&
    tickets.every((ticket) => normalizeModuleStatus(ticket.status) === "completed")
  ) {
    return "completed";
  }
  if (
    tickets.length > 0 &&
    tickets.some((ticket) => normalizeModuleStatus(ticket.status) !== "completed")
  ) {
    return "active";
  }
  return "active";
}

function normalizeProjectPhase(projectStatus, tickets, currentStage) {
  if (projectStatus === "completed") return "complete";
  if (projectStatus === "on_hold") return "paused";
  if (projectStatus === "planning") return "discovery";
  const stage = `${currentStage?.id || ""} ${currentStage?.label || ""}`.toLowerCase();
  if (stage.includes("hypercare")) return "hypercare";
  if (stage.includes("go live") || stage.includes("go-live") || stage.includes("live")) {
    return "go_live";
  }
  if (stage.includes("uat") || stage.includes("test") || stage.includes("review")) return "uat";
  if (stage.includes("pipeline") || stage.includes("discovery") || stage.includes("planning")) {
    return "discovery";
  }
  if (stage.includes("develop") || stage.includes("build")) return "build";
  if (tickets.some((ticket) => normalizeReviewStatus(ticket.status) === "in_progress"))
    return "uat";
  return "build";
}

function projectStages(apiProject) {
  if (!Array.isArray(apiProject.stages)) return [];
  return apiProject.stages
    .filter((stage) => stage && stage.id && stage.label)
    .map((stage) => ({
      id: String(stage.id),
      label: String(stage.label),
      color: typeof stage.color === "string" ? stage.color : null,
      startDate: dateOnly(stage.startDate) || null,
      endDate: dateOnly(stage.endDate) || null,
    }));
}

function isReviewStage(value) {
  return normalizeReviewStatus(value) === "in_progress";
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeProjectName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function ticketClassification(ticket, field) {
  const candidate = ticket[field];
  if (typeof candidate === "string") return candidate.trim() || null;
  if (candidate && typeof candidate === "object") {
    const value = candidate.name ?? candidate.label ?? candidate.value ?? candidate.title;
    return typeof value === "string" ? value.trim() || null : null;
  }
  return null;
}

function noteFromTicket(ticket, project) {
  const assignee = ticket.assignee;
  return [
    "Source: PEN ticketing API",
    ticket.ticketId ? `API ticket: ${ticket.ticketId}` : null,
    ticket.id ? `API ticket id: ${ticket.id}` : null,
    ticket.status ? `API status: ${ticket.status}` : null,
    ticket.priority ? `Priority: ${ticket.priority}` : null,
    ticket.type ? `Type: ${ticket.type}` : null,
    ticketClassification(ticket, "module")
      ? `Module: ${ticketClassification(ticket, "module")}`
      : null,
    ticketClassification(ticket, "sprint")
      ? `Sprint: ${ticketClassification(ticket, "sprint")}`
      : null,
    Array.isArray(ticket.labels) && ticket.labels.length
      ? `Labels: ${ticket.labels.join(", ")}`
      : null,
    ticket.storyPoints !== null && ticket.storyPoints !== undefined
      ? `Story points: ${ticket.storyPoints}`
      : null,
    assignee?.name ? `Assignee: ${assignee.name}` : null,
    assignee?.id ? `Assignee id: ${assignee.id}` : null,
    ticket.createdAt ? `Created: ${ticket.createdAt}` : null,
    ticket.updatedAt ? `Updated: ${ticket.updatedAt}` : null,
    ticket.closedAt ? `Closed: ${ticket.closedAt}` : null,
    project.projectUrl ? `Project URL: ${project.projectUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function dominantAssignee(tickets) {
  const counts = new Map();
  for (const ticket of tickets) {
    const name = ticket.assignee?.name;
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  let winner = "";
  let max = 0;
  for (const [name, count] of counts.entries()) {
    if (count > max || (count === max && name.localeCompare(winner) < 0)) {
      winner = name;
      max = count;
    }
  }

  return winner || "Unassigned";
}

function buildModules(project, tickets) {
  return tickets.map((ticket, index) => {
    const ticketNumber = ticket.ticketId || ticket.id || String(index + 1);
    const plannedStart = dateOnly(ticket.startDate || ticket.createdAt);
    const plannedEnd = dateOnly(ticket.dueDate || ticket.closedAt);
    const uat = normalizeReviewStatus(ticket.status);
    const isPassed = uat === "passed";

    return {
      id: ticket.id || `${project.id}-${slug(ticketNumber)}`,
      projectId: project.id,
      name: `${ticketNumber}: ${ticket.title || "Untitled ticket"}`,
      moduleGroup: ticketClassification(ticket, "module"),
      sprintGroup: ticketClassification(ticket, "sprint"),
      assignee: ticket.assignee?.name || null,
      effortDays: Number.isFinite(ticket.storyPoints)
        ? Math.max(0, Number(ticket.storyPoints))
        : null,
      status: normalizeModuleStatus(ticket.status),
      plannedStart: plannedStart || null,
      plannedEnd: plannedEnd || null,
      uat,
      uatPlannedStart: isReviewStage(ticket.status) || isPassed ? plannedStart || null : null,
      uatPlannedEnd: isReviewStage(ticket.status) || isPassed ? plannedEnd || null : null,
      uatActualStart: isPassed ? plannedStart || null : null,
      uatActualEnd: isPassed
        ? dateOnly(ticket.closedAt || ticket.updatedAt || ticket.dueDate) || null
        : null,
      notes: noteFromTicket(ticket, project),
      sortOrder: index,
    };
  });
}

function buildRisks(project, tickets, modules) {
  const now = Date.now();
  const openTickets = modules.filter((module) => module.status !== "completed");
  const blockedTickets = modules.filter((module) => module.status === "blocked");
  const failedReviews = modules.filter((module) => module.uat === "failed");
  const reviewTickets = tickets.filter((ticket) => isReviewStage(ticket.status));
  const overdueTickets = tickets.filter((ticket) => {
    if (!ticket.dueDate || normalizeModuleStatus(ticket.status) === "completed") return false;
    const due = new Date(ticket.dueDate).getTime();
    return !Number.isNaN(due) && due < now;
  });
  const staleReviewTickets = reviewTickets.filter((ticket) => {
    const since = new Date(
      ticket.updatedAt || ticket.startDate || ticket.createdAt || "",
    ).getTime();
    return !Number.isNaN(since) && now - since > 3 * DAY_MS;
  });

  const risks = [];

  if (openTickets.length > 0) {
    risks.push({
      id: `risk-${project.id}-open-tickets`,
      projectId: project.id,
      title: `${openTickets.length} ticket(s) remain open`,
      severity: openTickets.length / Math.max(modules.length, 1) > 0.5 ? "high" : "medium",
      mitigation: `Keep active tickets moving. Current in-review/testing count: ${reviewTickets.length}.`,
      resolved: 0,
      createdAt: now,
    });
  }

  if (blockedTickets.length > 0) {
    risks.push({
      id: `risk-${project.id}-blocked-tickets`,
      projectId: project.id,
      title: `${blockedTickets.length} ticket(s) are blocked`,
      severity: "high",
      mitigation: "Assign an unblock owner and decision date before adding more delivery work.",
      resolved: 0,
      createdAt: now,
    });
  }

  if (overdueTickets.length > 0) {
    risks.push({
      id: `risk-${project.id}-overdue-tickets`,
      projectId: project.id,
      title: `${overdueTickets.length} open ticket(s) are past due`,
      severity: "high",
      mitigation: `Oldest examples: ${overdueTickets
        .slice(0, 5)
        .map((ticket) => ticket.ticketId || ticket.id)
        .join(", ")}.`,
      resolved: 0,
      createdAt: now,
    });
  }

  if (staleReviewTickets.length > 0) {
    risks.push({
      id: `risk-${project.id}-stale-review`,
      projectId: project.id,
      title: `${staleReviewTickets.length} ticket(s) have been in review/testing for over 3 days`,
      severity: staleReviewTickets.length >= 3 ? "high" : "medium",
      mitigation: "Run focused QA triage and move accepted tickets to done/live.",
      resolved: 0,
      createdAt: now,
    });
  }

  if (failedReviews.length >= 3 && failedReviews.length / Math.max(modules.length, 1) >= 0.15) {
    risks.push({
      id: `risk-${project.id}-failed-review-pressure`,
      projectId: project.id,
      title: `${failedReviews.length} ticket(s) are currently failed at review`,
      severity: "high",
      mitigation: "Review failed tickets before accepting more work into review.",
      resolved: 0,
      createdAt: now,
    });
  }

  return risks;
}

function transformProject(apiProject, tickets) {
  const modules = buildModules(apiProject, tickets);
  const stages = projectStages(apiProject);
  const currentStageId = apiProject.currentStage?.id || apiProject.status || null;
  const currentStage =
    stages.find((stage) => stage.id === currentStageId) || apiProject.currentStage || null;
  const status = normalizeProjectStatus(apiProject.status, tickets, currentStage);
  const phase = normalizeProjectPhase(status, tickets, currentStage);
  const uatStage = stages.find((stage) => /\buat\b|testing|review/i.test(stage.label));
  const liveStage = stages.find((stage) => /go[- ]?live|\blive\b/i.test(stage.label));
  const stageStartDate = earliestDate(stages.map((stage) => stage.startDate));
  const stageEndDate = latestDate(stages.map((stage) => stage.endDate));
  const startDate =
    stageStartDate ||
    earliestDate(tickets.map((ticket) => ticket.startDate || ticket.createdAt)) ||
    dateOnly(apiProject.createdAt) ||
    dateOnly(new Date().toISOString());
  const targetDate =
    liveStage?.endDate ||
    stageEndDate ||
    latestDate(tickets.map((ticket) => ticket.dueDate || ticket.closedAt || ticket.updatedAt)) ||
    startDate;
  const uatStartDate =
    uatStage?.startDate ||
    earliestDate(
      tickets
        .filter(
          (ticket) =>
            isReviewStage(ticket.status) || normalizeReviewStatus(ticket.status) === "passed",
        )
        .map((ticket) => ticket.startDate || ticket.updatedAt || ticket.createdAt),
    );
  const uatEndDate =
    uatStage?.endDate ||
    latestDate(
      tickets
        .filter(
          (ticket) =>
            isReviewStage(ticket.status) || normalizeReviewStatus(ticket.status) === "passed",
        )
        .map((ticket) => ticket.dueDate || ticket.closedAt || ticket.updatedAt),
    );
  const createdAtValues = tickets
    .map((ticket) => (ticket.createdAt ? new Date(ticket.createdAt).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));
  const apiCreatedAt = apiProject.createdAt ? new Date(apiProject.createdAt).getTime() : NaN;
  const createdAt = createdAtValues.length
    ? Math.min(...createdAtValues)
    : Number.isNaN(apiCreatedAt)
      ? Date.now()
      : apiCreatedAt;

  const project = {
    id: apiProject.id,
    name: apiProject.name,
    description:
      apiProject.description ||
      `Synced from PEN ticketing API. API status: ${apiProject.status || "unknown"}. Tickets: ${tickets.length}.`,
    notionUrl: apiProject.projectUrl || null,
    owner: dominantAssignee(tickets),
    phase,
    startDate,
    targetDate,
    uatStartDate: uatStartDate || null,
    uatEndDate: uatEndDate || null,
    currentStageId,
    stages,
    priority: maxPriority(tickets),
    status,
    createdAt,
    modules,
    risks: [],
  };

  project.risks = buildRisks(project, tickets, modules);
  return project;
}

function collectMembers(projects) {
  const members = new Map();
  for (const project of projects) {
    for (const module of project.modules) {
      const assigneeLine = module.notes
        .split("\n")
        .find((line) => line.startsWith("Assignee id: "));
      const assigneeId = assigneeLine ? assigneeLine.replace("Assignee id: ", "").trim() : "";
      if (!assigneeId || !module.assignee || members.has(assigneeId)) continue;
      members.set(assigneeId, {
        id: assigneeId,
        name: module.assignee,
        role: "dev",
        title: null,
        managerId: null,
        createdAt: Date.now(),
      });
    }
  }

  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function backupTables(connection, timestamp) {
  const tables = [
    "projects",
    "project_modules",
    "ticket_api_details",
    "project_risks",
    "project_tags",
    "project_members",
    "project_stages",
    "team_members",
    "project_teams",
    "team_assignments",
  ];
  const backup = {};
  for (const table of tables) {
    const [rows] = await connection.query(`SELECT * FROM ${table}`);
    backup[table] = rows;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const backupPath = path.join(
    OUTPUT_DIR,
    `pre-pen-projects-preserve-teams-sync-${timestamp}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  return backupPath;
}

async function upsertTeamMembers(connection, members) {
  const [existingRows] = await connection.query("SELECT id, name FROM team_members");
  const existingIds = new Set(existingRows.map((row) => row.id));
  const existingNames = new Set(existingRows.map((row) => row.name.trim().toLowerCase()));
  const now = Date.now();
  const inserted = [];

  for (const member of members) {
    if (existingIds.has(member.id) || existingNames.has(member.name.trim().toLowerCase())) continue;
    await connection.execute(
      `
        INSERT INTO team_members (id, name, role, title, manager_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [member.id, member.name, member.role, member.title, member.managerId, member.createdAt, now],
    );
    inserted.push(member);
    existingIds.add(member.id);
    existingNames.add(member.name.trim().toLowerCase());
  }

  return inserted;
}

async function collectDuplicateProjectLinks(connection, projects) {
  const incomingIds = new Set(projects.map((project) => project.id));
  const [existingRows] = await connection.query(
    "SELECT id, name, team_id, pm_id FROM projects WHERE deleted_at IS NULL",
  );
  const rowsByName = new Map();

  for (const row of existingRows) {
    const key = normalizeProjectName(row.name);
    const rows = rowsByName.get(key) ?? [];
    rows.push(row);
    rowsByName.set(key, rows);
  }

  const duplicateLinks = new Map();

  for (const project of projects) {
    const duplicates = (rowsByName.get(normalizeProjectName(project.name)) ?? []).filter(
      (row) => row.id !== project.id && !incomingIds.has(row.id),
    );
    if (!duplicates.length) continue;

    duplicateLinks.set(project.id, {
      duplicates,
      pmId: duplicates.find((row) => row.pm_id)?.pm_id ?? null,
      teamId: duplicates.find((row) => row.team_id)?.team_id ?? null,
    });
  }

  return duplicateLinks;
}

async function upsertProjects(connection, projects) {
  const now = Date.now();
  const duplicateLinks = RECONCILE_DUPLICATE_PROJECTS
    ? await collectDuplicateProjectLinks(connection, projects)
    : new Map();
  const softDeletedDuplicates = [];

  for (const project of projects) {
    await connection.execute(
      `
        INSERT INTO projects (
          id, name, description, notion_url, owner, team_id, pm_id, phase, start_date, target_date,
          uat_start_date, uat_end_date, priority, status, deleted_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          notion_url = VALUES(notion_url),
          owner = VALUES(owner),
          phase = VALUES(phase),
          start_date = VALUES(start_date),
          target_date = VALUES(target_date),
          uat_start_date = VALUES(uat_start_date),
          uat_end_date = VALUES(uat_end_date),
          priority = VALUES(priority),
          status = VALUES(status),
          deleted_at = NULL,
          updated_at = VALUES(updated_at)
      `,
      [
        project.id,
        project.name,
        project.description,
        project.notionUrl,
        project.owner,
        project.phase,
        project.startDate,
        project.targetDate,
        project.uatStartDate,
        project.uatEndDate,
        project.priority,
        project.status,
        project.createdAt,
        now,
      ],
    );

    const duplicateLink = duplicateLinks.get(project.id);
    if (duplicateLink?.teamId || duplicateLink?.pmId) {
      await connection.execute(
        `
          UPDATE projects
          SET team_id = COALESCE(team_id, ?),
              pm_id = COALESCE(pm_id, ?),
              updated_at = ?
          WHERE id = ?
        `,
        [duplicateLink.teamId, duplicateLink.pmId, now, project.id],
      );
    }

    if (duplicateLink?.duplicates.length) {
      for (const duplicate of duplicateLink.duplicates) {
        await connection.execute(
          "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?",
          [now, now, duplicate.id],
        );
        softDeletedDuplicates.push({
          id: duplicate.id,
          name: duplicate.name,
          replacementId: project.id,
          replacementName: project.name,
        });
      }
    }

    await connection.execute("DELETE FROM project_modules WHERE project_id = ?", [project.id]);
    await connection.execute("DELETE FROM project_risks WHERE project_id = ?", [project.id]);
    await connection.execute("DELETE FROM project_stages WHERE project_id = ?", [project.id]);

    for (let index = 0; index < project.stages.length; index += 1) {
      const stage = project.stages[index];
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
          stage.color,
          stage.startDate,
          stage.endDate,
          stage.id === project.currentStageId ? 1 : 0,
          index,
        ],
      );
    }

    for (const module of project.modules) {
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
          module.moduleGroup,
          module.sprintGroup,
          module.assignee,
          module.effortDays,
          module.status,
          module.plannedStart,
          module.plannedEnd,
          module.uat,
          module.uatPlannedStart,
          module.uatPlannedEnd,
          module.uatActualStart,
          module.uatActualEnd,
          module.notes,
          module.sortOrder,
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
          risk.mitigation,
          risk.resolved,
          risk.createdAt,
        ],
      );
    }
  }

  return softDeletedDuplicates;
}

function summarize(projects, insertedMembers, softDeletedDuplicateProjects) {
  const statusCounts = {};
  const reviewCounts = {};
  let totalTickets = 0;
  for (const project of projects) {
    totalTickets += project.modules.length;
    for (const module of project.modules) {
      statusCounts[module.status] = (statusCounts[module.status] || 0) + 1;
      reviewCounts[module.uat] = (reviewCounts[module.uat] || 0) + 1;
    }
  }

  return {
    syncedAt: new Date().toISOString(),
    projectCount: projects.length,
    ticketCount: totalTickets,
    riskCount: projects.reduce((sum, project) => sum + project.risks.length, 0),
    stageCount: projects.reduce((sum, project) => sum + project.stages.length, 0),
    teamMemberWritesEnabled: SYNC_TEAM_MEMBERS,
    duplicateProjectReconciliationEnabled: RECONCILE_DUPLICATE_PROJECTS,
    addedTeamMemberCount: insertedMembers.length,
    addedTeamMembers: insertedMembers.map((member) => ({ id: member.id, name: member.name })),
    softDeletedDuplicateProjectCount: softDeletedDuplicateProjects.length,
    softDeletedDuplicateProjects,
    statusCounts,
    reviewCounts,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      phase: project.phase,
      owner: project.owner,
      tickets: project.modules.length,
      sprints: [...new Set(project.modules.map((module) => module.sprintGroup).filter(Boolean))]
        .length,
      ticketsWithoutSprint: project.modules.filter((module) => !module.sprintGroup).length,
      currentStage:
        project.stages.find((stage) => stage.id === project.currentStageId)?.label || null,
      stages: project.stages.length,
      risks: project.risks.length,
    })),
  };
}

function writeReports(raw, summary, timestamp, backupPath) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const rawPath = path.join(OUTPUT_DIR, "pen-projects-preserve-teams-sync-raw.json");
  const summaryPath = path.join(OUTPUT_DIR, "pen-projects-preserve-teams-sync-summary.json");
  const markdownPath = path.join(OUTPUT_DIR, "pen-projects-preserve-teams-sync-summary.md");

  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify({ ...summary, backupPath }, null, 2));

  const lines = [
    "# PEN Project Sync (Teams Preserved)",
    `Synced: ${summary.syncedAt}`,
    "",
    `Backup: ${backupPath}`,
    "",
    `Projects upserted: ${summary.projectCount}`,
    `Tickets synced: ${summary.ticketCount}`,
    `Pipeline stages synced: ${summary.stageCount}`,
    `Risks synced: ${summary.riskCount}`,
    `Team member writes enabled: ${summary.teamMemberWritesEnabled ? "yes" : "no"}`,
    `Duplicate project reconciliation enabled: ${summary.duplicateProjectReconciliationEnabled ? "yes" : "no"}`,
    `Team members added: ${summary.addedTeamMemberCount}`,
    `Duplicate project rows soft-deleted: ${summary.softDeletedDuplicateProjectCount}`,
    "",
    "Existing project teams and team assignments were not deleted or updated.",
    "",
    "## Projects",
    "",
  ];

  for (const project of summary.projects) {
    lines.push(
      `- ${project.name}: ${project.tickets} ticket(s), ${project.risks} risk(s), ${project.status}/${project.phase}, owner ${project.owner}.`,
    );
  }

  fs.writeFileSync(markdownPath, lines.join("\n"));
  return { rawPath, summaryPath, markdownPath, timestamp };
}

async function main() {
  const fetchedProjects = (await apiGet("/api/v1/projects")).data || [];
  const requestedKeys = REQUESTED_PROJECTS.map(normalizeProjectName);
  const selectedProjects = requestedKeys.length
    ? fetchedProjects.filter((project) =>
        requestedKeys.some((key) =>
          [project.id, project.name, project.slug].some(
            (value) => normalizeProjectName(value) === key,
          ),
        ),
      )
    : fetchedProjects;

  if (requestedKeys.length && selectedProjects.length !== requestedKeys.length) {
    throw new Error(
      `Expected ${requestedKeys.length} requested project(s), found ${selectedProjects.length}.`,
    );
  }
  const rawProjects = [];
  const unavailableTicketIds = new Set();

  for (const project of selectedProjects) {
    const tickets = (await apiGet(`/api/v1/projects/${project.id}/tickets`)).data || [];
    // Fetch complete detail snapshots before any database changes. A failed
    // request aborts the import instead of replacing history with empty data.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, tickets.length) }, async () => {
      while (next < tickets.length) {
        const index = next++;
        let detail;
        try {
          detail = await apiGet(`/api/v1/tickets/${encodeURIComponent(tickets[index].id)}`);
        } catch (error) {
          if (error.status !== 404) throw error;
          unavailableTicketIds.add(tickets[index].id);
          console.warn(`Ticket details unavailable (404): ${tickets[index].id}; preserving stored history.`);
          continue;
        }
        if (detail.id !== tickets[index].id || !Array.isArray(detail.activities?.data) ||
            !Array.isArray(detail.timeEntries?.data)) {
          throw new Error(`Incomplete activity/time-entry response for ${tickets[index].id}`);
        }
        tickets[index] = { ...tickets[index], ...detail };
      }
    }));
    rawProjects.push({ project, tickets });
    console.log(`Fetched ${rawProjects.length}/${selectedProjects.length} projects; ${tickets.length} ticket details.`);
  }

  const projects = rawProjects.map(({ project, tickets }) => transformProject(project, tickets));
  const members = collectMembers(projects);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || undefined,
    database: DATABASE_NAME,
    charset: "utf8mb4",
    multipleStatements: true,
  });

  const connection = await pool.getConnection();
  let backupPath = "";
  let insertedMembers = [];
  let softDeletedDuplicateProjects = [];

  try {
    await connection.query(fs.readFileSync(path.join(__dirname, "../src/lib/migrations/0017_add_ticket_api_details.sql"), "utf8"));
    await connection.beginTransaction();
    const [moduleGroupColumns] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_modules' AND COLUMN_NAME = 'module_group'`,
      [DATABASE_NAME],
    );
    if (moduleGroupColumns.length === 0) {
      await connection.execute(
        "ALTER TABLE project_modules ADD COLUMN module_group VARCHAR(255) NULL AFTER name",
      );
    }
    const [sprintGroupColumns] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_modules' AND COLUMN_NAME = 'sprint_group'`,
      [DATABASE_NAME],
    );
    if (sprintGroupColumns.length === 0) {
      await connection.execute(
        "ALTER TABLE project_modules ADD COLUMN sprint_group VARCHAR(255) NULL AFTER module_group",
      );
    }
    await connection.execute(
      "INSERT IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
      ["0009_add_ticket_module_group", Date.now()],
    );
    await connection.execute(
      "INSERT IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
      ["0010_add_ticket_sprint_group", Date.now()],
    );
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS project_stages (
        project_id VARCHAR(64) NOT NULL,
        stage_id VARCHAR(64) NOT NULL,
        label VARCHAR(255) NOT NULL,
        color VARCHAR(32) NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        is_current TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, stage_id),
        INDEX idx_project_stages_current (project_id, is_current),
        CONSTRAINT fk_project_stages_project
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
    await connection.execute(
      "INSERT IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
      ["0011_add_project_stages", Date.now()],
    );
    backupPath = await backupTables(connection, timestamp);
    await applyStoredStatusHistory(connection, projects, new Date().toISOString());
    insertedMembers = SYNC_TEAM_MEMBERS ? await upsertTeamMembers(connection, members) : [];
    softDeletedDuplicateProjects = await upsertProjects(connection, projects);
    for (const { project, tickets } of rawProjects) {
      for (const ticket of tickets) {
        if (unavailableTicketIds.has(ticket.id)) continue;
        // Stable ticket IDs replace snapshots on repeat syncs; entries never accumulate duplicates.
        await connection.execute(`INSERT INTO ticket_api_details
          (ticket_id, project_id, activities, time_entries, synced_at) VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE project_id=VALUES(project_id), activities=VALUES(activities),
            time_entries=VALUES(time_entries), synced_at=VALUES(synced_at)`,
          [ticket.id, project.id, JSON.stringify(ticket.activities.data),
           JSON.stringify(ticket.timeEntries.data), Date.now()]);
      }
    }
    await connection.execute("INSERT IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
      ["0017_add_ticket_api_details", Date.now()]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }

  const summary = summarize(projects, insertedMembers, softDeletedDuplicateProjects);
  summary.activities = rawProjects.reduce((n, p) => n + p.tickets.reduce((m, t) => m + (t.activities?.data?.length || 0), 0), 0);
  summary.timeEntries = rawProjects.reduce((n, p) => n + p.tickets.reduce((m, t) => m + (t.timeEntries?.data?.length || 0), 0), 0);
  summary.unavailableTicketIds = [...unavailableTicketIds];
  const reportPaths = writeReports(rawProjects, summary, timestamp, backupPath);
  console.log(JSON.stringify({ ...summary, ...reportPaths, backupPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
