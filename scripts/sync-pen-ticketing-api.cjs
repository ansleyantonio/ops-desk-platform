const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { applyStoredStatusHistory } = require("./pen-status-history.cjs");

const API_BASE = process.env.PEN_API_BASE || "https://ticketing-system.pengroup.com";
const API_TOKEN = process.env.PEN_API_TOKEN;
const DATABASE_NAME = process.env.MYSQL_DATABASE || "project-pal";
const OUTPUT_DIR = path.resolve("outputs");
const DAY_MS = 86400000;

if (!API_TOKEN) {
  console.error("Missing PEN_API_TOKEN.");
  process.exit(1);
}

function apiUrl(endpoint) {
  return `${API_BASE}${endpoint}`;
}

async function apiGet(endpoint) {
  const response = await fetch(apiUrl(endpoint), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${endpoint} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
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

function normalizeProjectStatus(apiStatus, tickets) {
  const status = String(apiStatus || "").toLowerCase();
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
  if (["live", "done", "completed", "closed", "archived"].includes(status)) return "completed";
  if (["paused", "on_hold", "on hold", "blocked"].includes(status)) return "on_hold";
  if (["planning", "planned", "backlog"].includes(status)) return "planning";
  return "active";
}

function normalizeProjectPhase(projectStatus, tickets) {
  if (projectStatus === "completed") return "complete";
  if (projectStatus === "on_hold") return "paused";
  if (projectStatus === "planning") return "discovery";
  if (tickets.some((ticket) => normalizeReviewStatus(ticket.status) === "in_progress"))
    return "uat";
  return "build";
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

function noteFromTicket(ticket, project) {
  const assignee = ticket.assignee;
  return [
    "Source: PEN ticketing API",
    ticket.ticketId ? `API ticket: ${ticket.ticketId}` : null,
    ticket.id ? `API ticket id: ${ticket.id}` : null,
    ticket.status ? `API status: ${ticket.status}` : null,
    ticket.priority ? `Priority: ${ticket.priority}` : null,
    ticket.type ? `Type: ${ticket.type}` : null,
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
  const status = normalizeProjectStatus(apiProject.status, tickets);
  const phase = normalizeProjectPhase(status, tickets);
  const startDate =
    earliestDate(tickets.map((ticket) => ticket.startDate || ticket.createdAt)) ||
    dateOnly(new Date().toISOString());
  const targetDate =
    latestDate(tickets.map((ticket) => ticket.dueDate || ticket.closedAt || ticket.updatedAt)) ||
    startDate;
  const uatStartDate = earliestDate(
    tickets
      .filter(
        (ticket) =>
          isReviewStage(ticket.status) || normalizeReviewStatus(ticket.status) === "passed",
      )
      .map((ticket) => ticket.startDate || ticket.updatedAt || ticket.createdAt),
  );
  const uatEndDate = latestDate(
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
  const createdAt = createdAtValues.length ? Math.min(...createdAtValues) : Date.now();
  const owner = dominantAssignee(tickets);
  const teamId = tickets.some((ticket) => ticket.assignee?.id) ? `team-${apiProject.id}` : null;
  const project = {
    id: apiProject.id,
    name: apiProject.name,
    description:
      apiProject.description ||
      `Synced from PEN ticketing API. API status: ${apiProject.status || "unknown"}. Tickets: ${tickets.length}.`,
    notionUrl: apiProject.projectUrl || null,
    owner,
    teamId,
    pmId: null,
    phase,
    startDate,
    targetDate,
    uatStartDate: uatStartDate || null,
    uatEndDate: uatEndDate || null,
    priority: maxPriority(tickets),
    status,
    createdAt,
    modules,
    risks: [],
  };

  project.risks = buildRisks(project, tickets, modules);
  return project;
}

function collectMembersAndTeams(projects) {
  const members = new Map();
  const ticketCounts = new Map();
  const teams = [];

  for (const project of projects) {
    const memberIds = new Set();
    for (const module of project.modules) {
      const assigneeLine = module.notes
        .split("\n")
        .find((line) => line.startsWith("Assignee id: "));
      const assigneeId = assigneeLine ? assigneeLine.replace("Assignee id: ", "").trim() : "";
      if (!assigneeId || !module.assignee) continue;
      memberIds.add(assigneeId);
      ticketCounts.set(assigneeId, (ticketCounts.get(assigneeId) || 0) + 1);
      if (!members.has(assigneeId)) {
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

    if (project.teamId) {
      teams.push({
        id: project.teamId,
        name: `${project.name} delivery team`,
        description: `Derived from assignees on ${project.name} tickets.`,
        pmId: null,
        devIds: [...memberIds].sort((a, b) => {
          const countDiff = (ticketCounts.get(b) || 0) - (ticketCounts.get(a) || 0);
          if (countDiff !== 0) return countDiff;
          return (members.get(a)?.name || "").localeCompare(members.get(b)?.name || "");
        }),
        qaIds: [],
        createdAt: Date.now(),
      });
    }
  }

  return {
    members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name)),
    teams,
  };
}

function summarize(projects, members, teams) {
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
    teamMemberCount: members.length,
    teamCount: teams.length,
    statusCounts,
    reviewCounts,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      phase: project.phase,
      owner: project.owner,
      tickets: project.modules.length,
      risks: project.risks.length,
      teamId: project.teamId,
    })),
  };
}

async function backupTables(connection, timestamp) {
  const tables = [
    "projects",
    "project_modules",
    "project_risks",
    "project_tags",
    "project_members",
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
  const backupPath = path.join(OUTPUT_DIR, `pre-pen-api-sync-backup-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  return backupPath;
}

async function writeRows(connection, projects, members, teams) {
  await connection.execute("DELETE FROM team_assignments");
  await connection.execute("DELETE FROM project_modules");
  await connection.execute("DELETE FROM project_risks");
  await connection.execute("DELETE FROM projects");
  await connection.execute("DELETE FROM project_teams");
  await connection.execute("DELETE FROM team_members");

  const now = Date.now();

  for (const member of members) {
    await connection.execute(
      `
        INSERT INTO team_members (id, name, role, title, manager_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [member.id, member.name, member.role, member.title, member.managerId, member.createdAt, now],
    );
  }

  for (const team of teams) {
    await connection.execute(
      `
        INSERT INTO project_teams (id, name, description, pm_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [team.id, team.name, team.description, team.pmId, team.createdAt, now],
    );

    const assignments = [
      ...(team.pmId ? [{ memberId: team.pmId, role: "pm" }] : []),
      ...team.devIds.map((memberId) => ({ memberId, role: "dev" })),
      ...team.qaIds.map((memberId) => ({ memberId, role: "qa" })),
    ];

    for (let index = 0; index < assignments.length; index += 1) {
      const assignment = assignments[index];
      await connection.execute(
        `
          INSERT INTO team_assignments (team_id, member_id, role, sort_order)
          VALUES (?, ?, ?, ?)
        `,
        [team.id, assignment.memberId, assignment.role, index],
      );
    }
  }

  for (const project of projects) {
    await connection.execute(
      `
        INSERT INTO projects (
          id, name, description, notion_url, owner, team_id, pm_id, phase, start_date, target_date,
          uat_start_date, uat_end_date, priority, status, deleted_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [
        project.id,
        project.name,
        project.description,
        project.notionUrl,
        project.owner,
        project.teamId,
        project.pmId,
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

    for (const module of project.modules) {
      await connection.execute(
        `
          INSERT INTO project_modules (
            id, project_id, name, assignee, effort_days, status,
            planned_start, planned_end, uat, uat_planned_start,
            uat_planned_end, uat_actual_start, uat_actual_end, notes, sort_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          module.id,
          project.id,
          module.name,
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
}

function writeReports(raw, summary, timestamp, backupPath) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const rawPath = path.join(OUTPUT_DIR, "pen-ticketing-api-sync-raw.json");
  const summaryPath = path.join(OUTPUT_DIR, "pen-ticketing-api-sync-summary.json");
  const markdownPath = path.join(OUTPUT_DIR, "pen-ticketing-api-sync-summary.md");

  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify({ ...summary, backupPath }, null, 2));

  const lines = [
    "# PEN Ticketing API Sync",
    `Synced: ${summary.syncedAt}`,
    "",
    `Backup: ${backupPath}`,
    "",
    `Projects: ${summary.projectCount}`,
    `Tickets: ${summary.ticketCount}`,
    `Risks: ${summary.riskCount}`,
    `Team members: ${summary.teamMemberCount}`,
    `Project teams: ${summary.teamCount}`,
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
  const rawProjects = [];

  for (const project of fetchedProjects) {
    const tickets = (await apiGet(`/api/v1/projects/${project.id}/tickets`)).data || [];
    rawProjects.push({ project, tickets });
  }

  const projects = rawProjects.map(({ project, tickets }) => transformProject(project, tickets));
  const { members, teams } = collectMembersAndTeams(projects);
  const summary = summarize(projects, members, teams);
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

  try {
    await connection.beginTransaction();
    backupPath = await backupTables(connection, timestamp);
    await applyStoredStatusHistory(connection, projects, new Date().toISOString());
    await writeRows(connection, projects, members, teams);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }

  const reportPaths = writeReports(rawProjects, summary, timestamp, backupPath);
  console.log(JSON.stringify({ ...summary, ...reportPaths, backupPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
