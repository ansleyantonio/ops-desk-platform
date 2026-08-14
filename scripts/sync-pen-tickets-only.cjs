const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { mergeTicketNotes } = require("./pen-status-history.cjs");

const API_BASE = process.env.PEN_API_BASE || "https://ticketing-system.pengroup.com";
const API_TOKEN = process.env.PEN_API_TOKEN;
const DATABASE_NAME = process.env.MYSQL_DATABASE || "project-pal";
const OUTPUT_DIR = path.resolve("outputs");
const REQUESTED_PROJECT = String(process.env.PEN_PROJECT || "").trim();

if (!API_TOKEN) {
  console.error("Missing PEN_API_TOKEN.");
  process.exit(1);
}

async function apiGet(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${endpoint} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error(`${endpoint} did not return JSON.`);
  }
  return JSON.parse(text);
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeModuleStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["done", "live", "completed", "closed", "archived"].includes(status)) return "completed";
  if (["blocked", "stuck"].includes(status)) return "blocked";
  if (["in progress", "in review", "testing", "qa", "review"].includes(status)) {
    return "in_progress";
  }
  return "not_started";
}

function normalizeReviewStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["done", "live", "completed", "closed", "archived"].includes(status)) return "passed";
  if (["blocked", "failed", "rejected"].includes(status)) return "failed";
  if (["in review", "testing", "qa", "review"].includes(status)) return "in_progress";
  return "pending";
}

function isReviewStage(value) {
  return normalizeReviewStatus(value) === "in_progress";
}

function normalizeProjectKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function ticketModuleGroup(ticket) {
  const candidate =
    ticket.module ??
    ticket.moduleName ??
    ticket.module_name ??
    ticket.moduleTag ??
    ticket.module_tag;

  if (typeof candidate === "string") return candidate.trim() || null;
  if (candidate && typeof candidate === "object") {
    const value = candidate.name ?? candidate.label ?? candidate.value ?? candidate.title;
    return typeof value === "string" ? value.trim() || null : null;
  }
  return null;
}

function ticketSprintGroup(ticket) {
  const candidate = ticket.sprint ?? ticket.sprintName ?? ticket.sprint_name;
  if (typeof candidate === "string") return candidate.trim() || null;
  if (candidate && typeof candidate === "object") {
    const value = candidate.name ?? candidate.label ?? candidate.value ?? candidate.title;
    return typeof value === "string" ? value.trim() || null : null;
  }
  return null;
}

function ticketNotes(ticket, project) {
  const assignee = ticket.assignee;
  return [
    "Source: PEN ticketing API",
    ticket.ticketId ? `API ticket: ${ticket.ticketId}` : null,
    ticket.id ? `API ticket id: ${ticket.id}` : null,
    ticket.status ? `API status: ${ticket.status}` : null,
    ticket.priority ? `Priority: ${ticket.priority}` : null,
    ticket.type ? `Type: ${ticket.type}` : null,
    ticketModuleGroup(ticket) ? `Module: ${ticketModuleGroup(ticket)}` : null,
    ticketSprintGroup(ticket) ? `Sprint: ${ticketSprintGroup(ticket)}` : null,
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

function buildTicket(project, ticket, index, previousNotes) {
  const plannedStart = dateOnly(ticket.startDate || ticket.createdAt);
  const plannedEnd = dateOnly(ticket.dueDate || ticket.closedAt);
  const uat = normalizeReviewStatus(ticket.status);
  const isPassed = uat === "passed";
  const notes = ticketNotes(ticket, project);

  return {
    id: ticket.id,
    projectId: project.id,
    name: `${ticket.ticketId || ticket.id}: ${ticket.title || "Untitled ticket"}`,
    moduleGroup: ticketModuleGroup(ticket),
    sprintGroup: ticketSprintGroup(ticket),
    assignee: ticket.assignee?.name || null,
    effortDays: Number.isFinite(ticket.storyPoints)
      ? Math.max(0, Number(ticket.storyPoints))
      : null,
    status: normalizeModuleStatus(ticket.status),
    plannedStart,
    plannedEnd,
    uat,
    uatPlannedStart: isReviewStage(ticket.status) || isPassed ? plannedStart : null,
    uatPlannedEnd: isReviewStage(ticket.status) || isPassed ? plannedEnd : null,
    uatActualStart: isPassed ? plannedStart : null,
    uatActualEnd: isPassed ? dateOnly(ticket.closedAt || ticket.updatedAt || ticket.dueDate) : null,
    notes: previousNotes ? mergeTicketNotes(previousNotes, notes, new Date().toISOString()) : notes,
    sortOrder: index,
  };
}

async function main() {
  const fetchedProjects = (await apiGet("/api/v1/projects")).data || [];
  const requestedProjectKey = normalizeProjectKey(REQUESTED_PROJECT);
  const selectedProjects = requestedProjectKey
    ? fetchedProjects.filter((project) =>
        [project.id, project.name, project.slug].some(
          (value) => normalizeProjectKey(value) === requestedProjectKey,
        ),
      )
    : fetchedProjects;

  if (requestedProjectKey && selectedProjects.length !== 1) {
    throw new Error(
      `Expected exactly one project matching "${REQUESTED_PROJECT}", found ${selectedProjects.length}.`,
    );
  }

  const rawProjects = [];
  for (const project of selectedProjects) {
    const tickets = (await apiGet(`/api/v1/projects/${project.id}/tickets`)).data || [];
    rawProjects.push({ project, tickets });
  }

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || undefined,
    database: DATABASE_NAME,
    charset: "utf8mb4",
  });
  const connection = await pool.getConnection();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const projectSuffix = REQUESTED_PROJECT ? `-${normalizeProjectKey(REQUESTED_PROJECT)}` : "";
  const backupPath = path.join(
    OUTPUT_DIR,
    `pre-pen-tickets-only-sync${projectSuffix}-${timestamp}.json`,
  );
  const rawPath = path.join(OUTPUT_DIR, `pen-tickets-only-sync${projectSuffix}-raw.json`);

  try {
    await connection.beginTransaction();
    const [moduleGroupColumns] = await connection.query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_modules' AND COLUMN_NAME = 'module_group'
      `,
      [DATABASE_NAME],
    );
    if (moduleGroupColumns.length === 0) {
      await connection.execute(
        "ALTER TABLE project_modules ADD COLUMN module_group VARCHAR(255) NULL AFTER name",
      );
    }
    const [sprintGroupColumns] = await connection.query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'project_modules' AND COLUMN_NAME = 'sprint_group'
      `,
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
    const [existingProjects] = await connection.query(
      "SELECT id, name FROM projects WHERE deleted_at IS NULL",
    );
    const existingProjectIds = new Set(existingProjects.map((project) => project.id));
    const selectedProjectIds = rawProjects.map(({ project }) => project.id);
    const selectedPlaceholders = selectedProjectIds.map(() => "?").join(", ");
    const [existingTickets] = await connection.query(
      `SELECT * FROM project_modules WHERE project_id IN (${selectedPlaceholders}) ORDER BY project_id, sort_order`,
      selectedProjectIds,
    );
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify(existingTickets, null, 2));

    const previousNotesById = new Map(
      existingTickets.map((ticket) => [ticket.id, ticket.notes || ""]),
    );
    let projectsUpdated = 0;
    let ticketsUpdated = 0;
    const skippedProjects = [];

    for (const { project, tickets } of rawProjects) {
      if (!existingProjectIds.has(project.id)) {
        skippedProjects.push({ id: project.id, name: project.name, tickets: tickets.length });
        continue;
      }

      const nextTickets = tickets
        .filter((ticket) => ticket.id)
        .map((ticket, index) =>
          buildTicket(project, ticket, index, previousNotesById.get(ticket.id)),
        );
      await connection.execute("DELETE FROM project_modules WHERE project_id = ?", [project.id]);

      for (const ticket of nextTickets) {
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
            ticket.id,
            ticket.projectId,
            ticket.name,
            ticket.moduleGroup,
            ticket.sprintGroup,
            ticket.assignee,
            ticket.effortDays,
            ticket.status,
            ticket.plannedStart,
            ticket.plannedEnd,
            ticket.uat,
            ticket.uatPlannedStart,
            ticket.uatPlannedEnd,
            ticket.uatActualStart,
            ticket.uatActualEnd,
            ticket.notes,
            ticket.sortOrder,
          ],
        );
      }

      projectsUpdated += 1;
      ticketsUpdated += nextTickets.length;
    }

    await connection.commit();
    fs.writeFileSync(rawPath, JSON.stringify(rawProjects, null, 2));
    console.log(
      JSON.stringify(
        {
          syncedAt: new Date().toISOString(),
          requestedProject: REQUESTED_PROJECT || null,
          projectsUpdated,
          ticketsUpdated,
          skippedProjects,
          untouched: [
            "projects",
            "project_risks",
            "project_tags",
            "project_members",
            "team_members",
            "project_teams",
            "team_assignments",
          ],
          backupPath,
          rawPath,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
