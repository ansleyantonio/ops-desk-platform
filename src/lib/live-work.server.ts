import type { LiveProject, LiveWorkSnapshot } from "./live-work";
import { toLiveTicket } from "./live-work";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

const CACHE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DETAIL_WORKERS = 6;

let cached: LiveWorkSnapshot | null = null;
let pending: Promise<LiveWorkSnapshot> | null = null;
let lastAttemptAt = 0;
let lastRefreshFailed = false;
let tokenPromise: Promise<string> | null = null;

async function getPenToken() {
  if (process.env.PEN_API_TOKEN) return process.env.PEN_API_TOKEN;
  tokenPromise ??= (async () => {
    const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
    if (!credentialDirectory)
      throw new Error(
        "PEN ticketing credential is unavailable to the portal service.",
      );
    const key = (
      await readFile(join(credentialDirectory, "opsdesk-sync.key"), "utf8")
    ).trim();
    if (!/^[0-9a-f]{64}$/.test(key))
      throw new Error("PEN ticketing credential is invalid.");
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "opsdesk",
      password: process.env.MYSQL_PASSWORD || undefined,
      database: "project-pal",
    });
    try {
      const [rows] = await connection.execute<
        Array<RowDataPacket & { token: string | null }>
      >(
        "SELECT CAST(AES_DECRYPT(encrypted_value, UNHEX(SHA2(?, 512))) AS CHAR) AS token FROM integration_secrets WHERE secret_name = 'pen_api_token' LIMIT 1",
        [key],
      );
      const token = rows[0]?.token;
      if (!token)
        throw new Error("PEN ticketing token could not be decrypted.");
      return token;
    } finally {
      await connection.end();
    }
  })().catch((error) => {
    tokenPromise = null;
    throw error;
  });
  return tokenPromise;
}

async function apiGet(path: string) {
  const base =
    process.env.PEN_API_BASE || "https://ticketing-system.pengroup.com";
  const token = await getPenToken();
  const response = await fetch(new URL(path, base), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Ticketing API returned HTTP ${response.status}.`);
  return response.json() as Promise<Record<string, unknown>>;
}

function dataList(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.data))
    throw new Error("Ticketing API returned an invalid list.");
  return payload.data as Array<Record<string, unknown>>;
}

async function fetchSnapshot(): Promise<LiveWorkSnapshot> {
  const { listProjects } = await import("./project-db.server");
  const localProjects = (await listProjects()).filter(
    (project) => !project.isDraft && project.status !== "completed",
  );
  const apiProjects = dataList(await apiGet("/api/v1/projects"));
  const apiIds = new Set(
    apiProjects
      .map((project) => project.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const projects: LiveProject[] = localProjects.map((project) => ({
    id: project.id,
    name: project.name,
    memberIds: project.memberIds,
    tickets: [],
  }));

  // Project lists are fetched concurrently in small groups to protect the ticketing service.
  let nextProject = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(DETAIL_WORKERS, projects.length) },
      async () => {
        while (nextProject < projects.length) {
          const project = projects[nextProject++];
          if (!apiIds.has(project.id)) continue;
          const tickets = dataList(
            await apiGet(
              `/api/v1/projects/${encodeURIComponent(project.id)}/tickets`,
            ),
          );
          const active = tickets.filter(
            (ticket) => toLiveTicket(ticket) !== null,
          );
          let nextTicket = 0;
          await Promise.all(
            Array.from(
              { length: Math.min(DETAIL_WORKERS, active.length) },
              async () => {
                while (nextTicket < active.length) {
                  const ticket = active[nextTicket++];
                  const id = String(ticket.id);
                  let detail: Record<string, unknown> = {};
                  try {
                    detail = await apiGet(
                      `/api/v1/tickets/${encodeURIComponent(id)}`,
                    );
                    if (
                      String(detail.id ?? detail.ticketId ?? "") !== id ||
                      !Array.isArray(
                        (detail.timeEntries as { data?: unknown } | undefined)
                          ?.data,
                      )
                    ) {
                      detail = {};
                    }
                  } catch (error) {
                    console.error(
                      `Ticket timer lookup failed for ${id}`,
                      error,
                    );
                  }
                  const liveTicket = toLiveTicket({ ...ticket, ...detail });
                  if (liveTicket) project.tickets.push(liveTicket);
                }
              },
            ),
          );
          project.tickets.sort(
            (a, b) =>
              a.assigneeName.localeCompare(b.assigneeName) ||
              a.title.localeCompare(b.title),
          );
        }
      },
    ),
  );
  return { projects, fetchedAt: new Date().toISOString(), stale: false };
}

export async function getLiveWorkSnapshot(allowedProjectIds?: string[]) {
  if (!pending && (!cached || Date.now() - lastAttemptAt >= CACHE_MS)) {
    lastAttemptAt = Date.now();
    pending ??= fetchSnapshot()
      .then((snapshot) => {
        cached = snapshot;
        lastRefreshFailed = false;
        return snapshot;
      })
      .catch((error) => {
        lastRefreshFailed = true;
        if (!cached) throw error;
        console.error("Live work refresh failed", error);
        return { ...cached, stale: true };
      })
      .finally(() => {
        pending = null;
      });
  }
  const snapshot = pending ? await pending : cached!;
  const allowed = allowedProjectIds ? new Set(allowedProjectIds) : null;
  return {
    ...snapshot,
    stale:
      snapshot.stale ||
      lastRefreshFailed ||
      Date.now() - Date.parse(snapshot.fetchedAt) >= CACHE_MS * 2,
    projects: allowed
      ? snapshot.projects.filter((project) => allowed.has(project.id))
      : snapshot.projects,
  };
}
