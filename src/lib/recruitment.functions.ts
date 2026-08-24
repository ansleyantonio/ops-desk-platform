import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const recruitmentPhases = ["initial_recruitment", "test_sent", "final_interview", "offer_made", "offer_refused", "rejected"] as const;
export type RecruitmentPhase = (typeof recruitmentPhases)[number];
export type Candidate = { id: string; name: string; email?: string; position?: string; notes?: string; joiningDate?: string; testSubmittedAt?: number; githubUrl?: string; reviewScore?: number; review?: { totalScore: number; scores?: Record<string, number>; summary?: string; recommendation?: string; findings?: Array<{ severity?: string; file?: string; line?: number; summary: string }>; reviewedAt?: string | number }; reviewedAt?: number; phase: RecruitmentPhase; createdAt: number; updatedAt: number };

const candidateSchema: z.ZodType<Candidate> = z.object({
  id: z.string().min(1), name: z.string().min(1), email: z.string().email().optional().or(z.literal("")),
  position: z.string().optional(), notes: z.string().optional(), joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), testSubmittedAt: z.number().int().nonnegative().optional(), githubUrl: z.string().optional(), reviewScore: z.number().optional(), review: z.any().optional(), reviewedAt: z.number().optional(), phase: z.enum(recruitmentPhases),
  createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
});

async function pool() {
  const mysql = await import("mysql2/promise");
  const connection = mysql.createPool({ host: "127.0.0.1", port: 3306, user: process.env.MYSQL_USER || "opsdesk", password: process.env.MYSQL_PASSWORD || undefined, database: "project-pal", charset: "utf8mb4" });
  await connection.query(`CREATE TABLE IF NOT EXISTS recruitment_candidates (
    id VARCHAR(64) PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(255) NULL,
    position VARCHAR(160) NULL, notes TEXT NULL, joining_date DATE NULL, test_submitted_at BIGINT NULL,
    phase ENUM('initial_recruitment','test_sent','final_interview','offer_made','offer_refused','rejected') NOT NULL DEFAULT 'initial_recruitment',
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    INDEX idx_recruitment_phase (phase), INDEX idx_recruitment_updated (updated_at)
  )`);
  const [columns] = await connection.query<Array<{ Field: string }>>("SHOW COLUMNS FROM recruitment_candidates LIKE 'test_submitted_at'");
  if (!columns.length) await connection.query("ALTER TABLE recruitment_candidates ADD COLUMN test_submitted_at BIGINT NULL AFTER notes");
  const [joiningDateColumns] = await connection.query<Array<{ Field: string }>>("SHOW COLUMNS FROM recruitment_candidates LIKE 'joining_date'");
  if (!joiningDateColumns.length) await connection.query("ALTER TABLE recruitment_candidates ADD COLUMN joining_date DATE NULL AFTER notes");
  const [phaseColumns] = await connection.query<Array<{ Type: string }>>("SHOW COLUMNS FROM recruitment_candidates LIKE 'phase'");
  if (!phaseColumns[0]?.Type.includes("'offer_refused'") || !phaseColumns[0]?.Type.includes("'rejected'")) await connection.query("ALTER TABLE recruitment_candidates MODIFY COLUMN phase ENUM('initial_recruitment','test_sent','final_interview','offer_made','offer_refused','rejected') NOT NULL DEFAULT 'initial_recruitment'");
  for (const definition of ["github_url VARCHAR(500) NULL", "review_score DECIMAL(5,2) NULL", "review_json JSON NULL", "reviewed_at BIGINT NULL"]) { const column = definition.split(" ")[0]; const [found] = await connection.query<Array<{ Field: string }>>(`SHOW COLUMNS FROM recruitment_candidates LIKE ?`, [column]); if (!found.length) await connection.query(`ALTER TABLE recruitment_candidates ADD COLUMN ${definition}`); }
  return connection;
}

export const listCandidates = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./auth.server"); await requirePermission("teams:view");
  const db = await pool();
  const [rows] = await db.query<Array<{ id: string; name: string; email: string | null; position: string | null; notes: string | null; joining_date: string | Date | null; test_submitted_at: number | null; github_url: string | null; review_score: number | null; review_json: string | object | null; reviewed_at: number | null; phase: RecruitmentPhase; created_at: number; updated_at: number }>>(`SELECT id,name,email,position,notes,joining_date,test_submitted_at,github_url,review_score,review_json,reviewed_at,phase,created_at,updated_at FROM recruitment_candidates ORDER BY updated_at DESC`);
  await db.end();
  return rows.map((row) => ({ id: row.id, name: row.name, email: row.email ?? undefined, position: row.position ?? undefined, notes: row.notes ?? undefined, joiningDate: row.joining_date ? (typeof row.joining_date === "string" ? row.joining_date.slice(0, 10) : row.joining_date.toISOString().slice(0, 10)) : undefined, testSubmittedAt: row.test_submitted_at ? Number(row.test_submitted_at) : undefined, githubUrl: row.github_url ?? undefined, reviewScore: row.review_score === null ? undefined : Number(row.review_score), review: row.review_json ? (typeof row.review_json === "string" ? JSON.parse(row.review_json) : row.review_json) : undefined, reviewedAt: row.reviewed_at ? Number(row.reviewed_at) : undefined, phase: row.phase, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) }));
});

export const saveCandidate = createServerFn({ method: "POST" }).validator((value: Candidate) => candidateSchema.parse(value)).handler(async ({ data }) => {
  const { requirePermission } = await import("./auth.server"); await requirePermission("teams:manage");
  const db = await pool();
  await db.execute(`INSERT INTO recruitment_candidates (id,name,email,position,notes,joining_date,test_submitted_at,phase,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),position=VALUES(position),notes=VALUES(notes),joining_date=VALUES(joining_date),test_submitted_at=VALUES(test_submitted_at),phase=VALUES(phase),updated_at=VALUES(updated_at)`, [data.id, data.name, data.email || null, data.position || null, data.notes || null, data.joiningDate || null, data.testSubmittedAt || null, data.phase, data.createdAt, data.updatedAt]);
  await db.end(); return data;
});

export const deleteCandidate = createServerFn({ method: "POST" }).validator((value: { id: string }) => ({ id: z.string().min(1).parse(value.id) })).handler(async ({ data }) => {
  const { requirePermission } = await import("./auth.server"); await requirePermission("teams:manage");
  const db = await pool(); await db.execute("DELETE FROM recruitment_candidates WHERE id = ?", [data.id]); await db.end(); return data;
});
