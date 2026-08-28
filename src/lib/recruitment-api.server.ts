import mysql from "mysql2/promise";
import type { RecruitmentPhase } from "./recruitment.functions";

type ReviewPayload = { name: string; email: string; position?: string; phase?: RecruitmentPhase; githubUrl?: string; testSubmittedAt?: string | number; review?: { totalScore: number; scores?: Record<string, number>; summary?: string; recommendation?: string; findings?: Array<{ severity?: string; file?: string; line?: number; summary: string }>; reviewedAt?: string | number } };
const toTime = (value: string | number | undefined) => { if (value === undefined) return undefined; const parsed = typeof value === "number" ? value : new Date(value).getTime(); if (!Number.isFinite(parsed)) throw new Error("Invalid date"); return parsed; };

export async function upsertRecruitmentReview(payload: ReviewPayload) {
  const db = mysql.createPool({ host: "127.0.0.1", port: 3306, user: process.env.MYSQL_USER || "opsdesk", password: process.env.MYSQL_PASSWORD || undefined, database: "project-pal", charset: "utf8mb4" });
  await db.query(`CREATE TABLE IF NOT EXISTS recruitment_candidates (id VARCHAR(64) PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(255) NULL, position VARCHAR(160) NULL, notes TEXT NULL, test_submitted_at BIGINT NULL, phase ENUM('initial_recruitment','test_sent','final_interview','offer_made','offer_refused','rejected') NOT NULL DEFAULT 'initial_recruitment', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, INDEX idx_recruitment_phase (phase), INDEX idx_recruitment_updated (updated_at))`);
  const [phaseColumns] = await db.query<Array<{ Type: string }>>("SHOW COLUMNS FROM recruitment_candidates LIKE 'phase'");
  if (!phaseColumns[0]?.Type.includes("'offer_refused'") || !phaseColumns[0]?.Type.includes("'rejected'")) await db.query("ALTER TABLE recruitment_candidates MODIFY COLUMN phase ENUM('initial_recruitment','test_sent','final_interview','offer_made','offer_refused','rejected') NOT NULL DEFAULT 'initial_recruitment'");
  for (const definition of ["github_url VARCHAR(500) NULL", "review_score DECIMAL(5,2) NULL", "review_json JSON NULL", "reviewed_at BIGINT NULL"]) {
    const column = definition.split(" ")[0]; const [rows] = await db.query<Array<{ Field: string }>>(`SHOW COLUMNS FROM recruitment_candidates LIKE ?`, [column]); if (!rows.length) await db.query(`ALTER TABLE recruitment_candidates ADD COLUMN ${definition}`);
  }
  const [existing] = await db.query<Array<{ id: string; created_at: number; phase: RecruitmentPhase; test_submitted_at: number | null }>>("SELECT id,created_at,phase,test_submitted_at FROM recruitment_candidates WHERE LOWER(email)=LOWER(?) LIMIT 1", [payload.email]);
  const now = Date.now(); const current = existing[0]; const id = current?.id ?? crypto.randomUUID();
  const testSubmittedAt = toTime(payload.testSubmittedAt) ?? (current?.test_submitted_at ? Number(current.test_submitted_at) : undefined);
  const phase = payload.phase ?? (payload.review ? "final_interview" : current?.phase ?? "initial_recruitment");
  const reviewedAt = payload.review ? toTime(payload.review.reviewedAt) ?? now : undefined;
  await db.execute(`INSERT INTO recruitment_candidates (id,name,email,position,test_submitted_at,phase,github_url,review_score,review_json,reviewed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),position=COALESCE(VALUES(position),position),test_submitted_at=COALESCE(VALUES(test_submitted_at),test_submitted_at),phase=VALUES(phase),github_url=COALESCE(VALUES(github_url),github_url),review_score=COALESCE(VALUES(review_score),review_score),review_json=COALESCE(VALUES(review_json),review_json),reviewed_at=COALESCE(VALUES(reviewed_at),reviewed_at),updated_at=VALUES(updated_at)`, [id,payload.name,payload.email,payload.position||null,testSubmittedAt||null,phase,payload.githubUrl||null,payload.review?.totalScore??null,payload.review?JSON.stringify(payload.review):null,reviewedAt||null,current?.created_at?Number(current.created_at):now,now]);
  await db.end(); return { id, name: payload.name, email: payload.email, phase, githubUrl: payload.githubUrl, totalScore: payload.review?.totalScore, updatedAt: now };
}
