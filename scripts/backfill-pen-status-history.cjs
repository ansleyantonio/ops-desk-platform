const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const {
  appendStatus,
  countReviewReturns,
  noteValue,
  parseStatusHistory,
  writeStatusHistory,
} = require("./pen-status-history.cjs");

const DATABASE_NAME = process.env.MYSQL_DATABASE || "project-pal";
const OUTPUT_DIR = path.resolve("outputs");

function snapshotFiles() {
  return fs
    .readdirSync(OUTPUT_DIR)
    .filter(
      (file) =>
        /^pre-pen-(api-sync-backup|projects-preserve-teams-sync)-.+\.json$/.test(file),
    )
    .map((file) => {
      const fullPath = path.join(OUTPUT_DIR, file);
      return { file, fullPath, modifiedAt: fs.statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => left.modifiedAt - right.modifiedAt);
}

function appendSnapshot(historyByTicketId, rows, fallbackAt) {
  for (const row of rows || []) {
    const status = noteValue(row.notes, "API status");
    if (!status) continue;
    const at =
      noteValue(row.notes, "Updated") ||
      noteValue(row.notes, "Created") ||
      fallbackAt;
    const current = historyByTicketId.get(row.id) ?? parseStatusHistory(row.notes);
    historyByTicketId.set(row.id, appendStatus(current, status, at));
  }
}

async function main() {
  const files = snapshotFiles();
  const historyByTicketId = new Map();

  for (const snapshot of files) {
    const payload = JSON.parse(fs.readFileSync(snapshot.fullPath, "utf8"));
    appendSnapshot(
      historyByTicketId,
      payload.project_modules,
      new Date(snapshot.modifiedAt).toISOString(),
    );
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
  const backupPath = path.join(OUTPUT_DIR, `pre-status-history-backfill-${timestamp}.json`);

  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.query(
      `
        SELECT id, project_id, name, notes
        FROM project_modules
        WHERE notes LIKE 'Source: PEN ticketing API%'
      `,
    );
    fs.writeFileSync(backupPath, JSON.stringify(currentRows, null, 2));

    appendSnapshot(historyByTicketId, currentRows, new Date().toISOString());

    let ticketsUpdated = 0;
    let ticketsWithReturns = 0;
    let reviewReturnEvents = 0;
    const examples = [];

    for (const row of currentRows) {
      const history = historyByTicketId.get(row.id) ?? [];
      if (!history.length) continue;

      const returned = countReviewReturns(history);
      const notes = writeStatusHistory(row.notes, history);
      await connection.execute("UPDATE project_modules SET notes = ? WHERE id = ?", [
        notes,
        row.id,
      ]);
      ticketsUpdated += 1;
      reviewReturnEvents += returned;
      if (returned > 0) {
        ticketsWithReturns += 1;
        if (examples.length < 10) {
          examples.push({
            id: row.id,
            projectId: row.project_id,
            ticket: row.name,
            returnEvents: returned,
          });
        }
      }
    }

    await connection.commit();
    console.log(
      JSON.stringify(
        {
          snapshotsRead: files.length,
          snapshotFiles: files.map((snapshot) => snapshot.file),
          ticketsUpdated,
          ticketsWithReturns,
          reviewReturnEvents,
          examples,
          backupPath,
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
