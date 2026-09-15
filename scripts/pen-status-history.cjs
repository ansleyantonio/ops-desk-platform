const HISTORY_PREFIX = "Status history:";

function noteValue(notes, label) {
  return String(notes || "")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${label}: `))
    ?.slice(label.length + 2)
    .trim();
}

function normalizeStatus(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function statusesMatch(left, right) {
  return normalizeStatus(left).toLowerCase() === normalizeStatus(right).toLowerCase();
}

function parseStatusHistory(notes) {
  const line = String(notes || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(HISTORY_PREFIX));
  if (!line) return [];

  return line
    .slice(HISTORY_PREFIX.length)
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(\S+)\s+(.+)$/);
      return match
        ? { at: match[1], status: normalizeStatus(match[2]) }
        : { at: "unknown", status: normalizeStatus(entry) };
    })
    .filter((entry) => entry.status);
}

function statusTimestamp(notes, fallbackAt) {
  return (
    noteValue(notes, "Updated") ||
    noteValue(notes, "Created") ||
    fallbackAt ||
    new Date().toISOString()
  );
}

function appendStatus(history, status, at) {
  const normalized = normalizeStatus(status);
  if (!normalized) return history;
  const last = history[history.length - 1];
  if (last && statusesMatch(last.status, normalized)) return history;
  return [...history, { at: at || "unknown", status: normalized }];
}

function writeStatusHistory(notes, history) {
  const base = String(notes || "")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(HISTORY_PREFIX))
    .join("\n")
    .trim();
  if (!history.length) return base;

  const historyLine = `${HISTORY_PREFIX} ${history
    .map((entry) => `${entry.at || "unknown"} ${normalizeStatus(entry.status)}`)
    .join(" | ")}`;
  return base ? `${base}\n${historyLine}` : historyLine;
}

function mergeTicketNotes(previousNotes, currentNotes, fallbackAt) {
  let history = parseStatusHistory(previousNotes);
  const previousStatus = noteValue(previousNotes, "API status");
  const currentStatus = noteValue(currentNotes, "API status");

  if (!history.length && previousStatus) {
    history = appendStatus(history, previousStatus, statusTimestamp(previousNotes, fallbackAt));
  }
  if (currentStatus) {
    history = appendStatus(history, currentStatus, statusTimestamp(currentNotes, fallbackAt));
  }

  return writeStatusHistory(currentNotes, history);
}

async function applyStoredStatusHistory(connection, projects, fallbackAt) {
  const [rows] = await connection.query(
    "SELECT id, notes FROM project_modules WHERE notes LIKE 'Source: PEN ticketing API%'",
  );
  const previousNotesById = new Map(rows.map((row) => [row.id, row.notes || ""]));
  let ticketsWithHistory = 0;
  let transitionsPreserved = 0;

  for (const project of projects) {
    for (const module of project.modules) {
      const previousNotes = previousNotesById.get(module.id);

      const before = parseStatusHistory(previousNotes);
      module.notes = mergeTicketNotes(previousNotes, module.notes, fallbackAt);
      const after = parseStatusHistory(module.notes);
      if (after.length > 0) ticketsWithHistory += 1;
      transitionsPreserved += Math.max(0, after.length - before.length);
    }
  }

  return { ticketsWithHistory, transitionsPreserved };
}

function isReviewStatus(value) {
  return ["in review", "testing", "qa", "review"].includes(normalizeStatus(value).toLowerCase());
}

function isReturnedStatus(value) {
  return ["in progress", "to do", "not started", "blocked", "stuck", "backlog"].includes(
    normalizeStatus(value).toLowerCase(),
  );
}

function countReviewReturns(history) {
  let count = 0;
  for (let index = 1; index < history.length; index += 1) {
    if (
      isReviewStatus(history[index - 1].status) &&
      isReturnedStatus(history[index].status)
    ) {
      count += 1;
    }
  }
  return count;
}

module.exports = {
  applyStoredStatusHistory,
  appendStatus,
  countReviewReturns,
  isReturnedStatus,
  isReviewStatus,
  mergeTicketNotes,
  noteValue,
  parseStatusHistory,
  writeStatusHistory,
};
