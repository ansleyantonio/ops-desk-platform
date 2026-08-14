const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const DATABASE_NAME = "project-pal";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required field: ${label}`);
  }
  return value;
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePriority(value) {
  const priority = String(value || "").toLowerCase();
  if (priority === "critical" || priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function normalizeDashboardStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status === "done" || status === "live" || status === "completed" || status === "archived") return "completed";
  if (status === "blocked") return "blocked";
  if (status === "in progress" || status === "in review" || status === "testing") {
    return "in_progress";
  }
  return "not_started";
}

function normalizeReviewStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status === "done" || status === "live" || status === "completed" || status === "archived") return "passed";
  if (status === "blocked") return "failed";
  if (status === "in review" || status === "testing") return "in_progress";
  return "pending";
}

function isReviewStage(value) {
  const status = String(value || "").toLowerCase();
  return status === "in review" || status === "testing";
}

function isRegressedStage(value) {
  const status = String(value || "").toLowerCase();
  return status === "in progress" || status === "not started" || status === "blocked";
}

function countReviewRegressions(tickets) {
  let count = 0;
  const examples = [];

  for (const ticket of tickets) {
    const history = Array.isArray(ticket.statusHistory) ? ticket.statusHistory : [];
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1]?.status;
      const current = history[index]?.status;
      if (isReviewStage(previous) && isRegressedStage(current)) {
        count += 1;
        if (examples.length < 5) {
          examples.push(`${ticket.number || ticket.id || ticket.title}: ${previous} -> ${current}`);
        }
      }
    }
  }

  return { count, examples };
}

function noteFromTicket(ticket, projectUrl) {
  const lines = [
    "Source: Notion project board",
    ticket.number ? `Notion ticket number: ${ticket.number}` : null,
    ticket.status ? `Notion status: ${ticket.status}` : null,
    ticket.priority ? `Priority: ${ticket.priority}` : null,
    ticket.team ? `Team: ${ticket.team}` : null,
    ticket.type ? `Ticket type: ${ticket.type}` : null,
    ticket.text ? `Description: ${ticket.text}` : null,
    ticket.url ? `Notion URL: ${ticket.url}` : null,
    projectUrl ? `Notion project page: ${projectUrl}` : null,
  ].filter(Boolean);

  const history = Array.isArray(ticket.statusHistory) ? ticket.statusHistory : [];
  if (history.length > 0) {
    lines.push(
      `Status history: ${history
        .map((entry) => `${entry.at || "unknown"} ${entry.status || "unknown"}`)
        .join(" | ")}`,
    );
  }

  return lines.join("\n");
}

function buildImport(payload) {
  const rawProject = required(payload.project, "project");
  const projectId = slug(required(rawProject.id || rawProject.name, "project.id or project.name"));
  const projectUrl = rawProject.url || payload.source?.projectUrl;
  const tickets = required(payload.tickets, "tickets");

  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error("Payload must contain at least one ticket.");
  }

  const project = {
    id: projectId,
    name: required(rawProject.name, "project.name"),
    description:
      rawProject.description ||
      `Synced from Notion${projectUrl ? ` (${projectUrl})` : ""}. Phase 1 is complete; delivery is tracked by tickets.`,
    notionUrl: projectUrl || null,
    owner: rawProject.owner || "Notion Team",
    phase: rawProject.initialPhaseComplete === false ? rawProject.phase || "build" : "complete",
    startDate: rawProject.startDate || "2026-06-01",
    targetDate: rawProject.targetDate || "2026-06-15",
    priority: normalizePriority(rawProject.priority || "high"),
    status: rawProject.status || "active",
    replaceTickets: rawProject.replaceTickets !== false,
  };

  const modules = tickets
    .filter((ticket) => ticket && (ticket.title || ticket.name))
    .map((ticket, index) => {
      const number = ticket.number || ticket.ticketNumber || ticket.id || index + 1;
      const title = ticket.title || ticket.name;
      return {
        id: `${project.id}-${slug(number)}`,
        name: `#${number} - ${title}`,
        assignee: ticket.assignee || ticket.team || null,
        effortDays: ticket.effortDays ?? null,
        status: normalizeDashboardStatus(ticket.status),
        plannedStart: ticket.startDate || null,
        plannedEnd: ticket.endDate || null,
        uat: normalizeReviewStatus(ticket.status),
        uatPlannedStart: ticket.startDate || null,
        uatPlannedEnd: ticket.endDate || null,
        uatActualStart: null,
        uatActualEnd: null,
        notes: noteFromTicket(ticket, projectUrl),
        sortOrder: index,
      };
    });

  const openTickets = modules.filter((module) => module.status !== "completed");
  const reviewTickets = tickets.filter((ticket) => isReviewStage(ticket.status));
  const regressions = countReviewRegressions(tickets);
  const failedReviews = modules.filter((module) => module.uat === "failed");
  const risks = [];
  const now = Date.now();

  if (openTickets.length > 0) {
    risks.push({
      id: `risk-${project.id}-open-tickets`,
      projectId: project.id,
      title: `${openTickets.length} ${project.name} ticket(s) remain open`,
      severity: "medium",
      mitigation: `Keep current review tickets moving through QA. Current in-review/testing count: ${reviewTickets.length}.`,
      resolved: 0,
      createdAt: now,
    });
  }

  if (regressions.count >= 3 || (modules.length > 0 && regressions.count / modules.length >= 0.15)) {
    risks.push({
      id: `risk-${project.id}-review-regression`,
      projectId: project.id,
      title: `${regressions.count} review regression/testing churn event(s) detected`,
      severity: "high",
      mitigation: `Tickets are moving back from review/testing. Examples: ${regressions.examples.join("; ") || "See ticket status history."}`,
      resolved: 0,
      createdAt: now,
    });
  }

  if (failedReviews.length >= 3 && failedReviews.length / modules.length >= 0.15) {
    risks.push({
      id: `risk-${project.id}-failed-review-pressure`,
      projectId: project.id,
      title: `${failedReviews.length} ticket(s) are currently failed at review`,
      severity: "high",
      mitigation: "Review failed tickets before adding more in-review work.",
      resolved: 0,
      createdAt: now,
    });
  }

  return { project, modules, risks };
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("Usage: node scripts/import-notion-project.cjs <payload.json>");
  }

  const payload = JSON.parse(fs.readFileSync(path.resolve(payloadPath), "utf8"));
  const { project, modules, risks } = buildImport(payload);

  const pool = mysql.createPool({
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: process.env.MYSQL_PASSWORD || undefined,
    database: DATABASE_NAME,
    charset: "utf8mb4",
    multipleStatements: true,
  });

  const connection = await pool.getConnection();
  const now = Date.now();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `
        INSERT INTO projects (
          id, name, description, notion_url, owner, team_id, pm_id, phase, start_date, target_date,
          uat_start_date, uat_end_date, priority, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        project.startDate,
        project.targetDate,
        project.priority,
        project.status,
        now,
        now,
      ],
    );

    if (project.replaceTickets) {
      await connection.execute("DELETE FROM project_modules WHERE project_id = ?", [project.id]);
    }
    await connection.execute("DELETE FROM project_risks WHERE project_id = ? AND id LIKE ?", [
      project.id,
      `risk-${project.id}-%`,
    ]);

    const moduleSql = `
      INSERT INTO project_modules (
        id, project_id, name, assignee, effort_days, status,
        planned_start, planned_end, uat, uat_planned_start,
        uat_planned_end, uat_actual_start, uat_actual_end, notes, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        assignee = VALUES(assignee),
        effort_days = VALUES(effort_days),
        status = VALUES(status),
        planned_start = VALUES(planned_start),
        planned_end = VALUES(planned_end),
        uat = VALUES(uat),
        uat_planned_start = VALUES(uat_planned_start),
        uat_planned_end = VALUES(uat_planned_end),
        uat_actual_start = VALUES(uat_actual_start),
        uat_actual_end = VALUES(uat_actual_end),
        notes = VALUES(notes),
        sort_order = VALUES(sort_order)
    `;

    for (const module of modules) {
      await connection.execute(moduleSql, [
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
      ]);
    }

    const riskSql = `
      INSERT INTO project_risks (
        id, project_id, title, severity, mitigation, resolved, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (const risk of risks) {
      await connection.execute(riskSql, [
        risk.id,
        project.id,
        risk.title,
        risk.severity,
        risk.mitigation,
        risk.resolved,
        risk.createdAt,
      ]);
    }

    await connection.commit();
    console.log(
      JSON.stringify(
        {
          projectId: project.id,
          ticketsImported: modules.length,
          risksImported: risks.length,
          statusCounts: modules.reduce((counts, module) => {
            counts[module.status] = (counts[module.status] || 0) + 1;
            return counts;
          }, {}),
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
