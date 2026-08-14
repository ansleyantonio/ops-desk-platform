import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import mysql from "mysql2/promise";
import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";

import { ensureSchema } from "./project-db.server";
import { ROLE_PERMISSIONS, type AppPermission, type AppRole, type AuthUser } from "./auth";

const SESSION_COOKIE = "opsdesk_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DEMO_EMAIL = "demo@opsdesk.local";
const DEMO_PASSWORD = "OpsDeskDemo!2026";

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: AppRole;
  status: "active" | "suspended";
  last_login_at: number | null;
  created_at: number;
};

const pool = mysql.createPool({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: process.env.MYSQL_PASSWORD || undefined,
  database: "project-pal",
  charset: "utf8mb4",
});

let bootstrapPromise: Promise<void> | undefined;

function bootstrapAuth() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureSchema();
      const [rows] = await pool.query<Array<{ id: string }>>(
        "SELECT id FROM app_users WHERE email = ? LIMIT 1",
        [DEMO_EMAIL],
      );
      if (rows.length > 0) return;

      const now = Date.now();
      await pool.query(
        `INSERT INTO app_users
          (id, name, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?)`,
        [randomUUID(), "OpsDesk Demo", DEMO_EMAIL, await hashPassword(DEMO_PASSWORD), now, now],
      );
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }
  return bootstrapPromise;
}

async function deriveKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await deriveKey(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    permissions: ROLE_PERMISSIONS[row.role],
    lastLoginAt: row.last_login_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  await bootstrapAuth();
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const now = Date.now();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT u.*
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
      LIMIT 1`,
    [sessionHash(token), now],
  );
  if (!rows[0]) {
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }
  return toAuthUser(rows[0]);
}

export async function loginWithPassword(email: string, password: string) {
  await bootstrapAuth();
  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.query<UserRow[]>("SELECT * FROM app_users WHERE email = ? LIMIT 1", [
    normalizedEmail,
  ]);
  const row = rows[0];
  if (!row || row.status !== "active" || !(await verifyPassword(password, row.password_hash))) {
    return null;
  }

  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await pool.query("DELETE FROM auth_sessions WHERE expires_at <= ?", [now]);
  await pool.query(
    "INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), row.id, sessionHash(token), now + SESSION_DURATION_MS, now],
  );
  await pool.query("UPDATE app_users SET last_login_at = ?, updated_at = ? WHERE id = ?", [
    now,
    now,
    row.id,
  ]);
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestUrl().protocol === "https:",
    path: "/",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
  return { ...toAuthUser(row), lastLoginAt: now };
}

export async function logoutSession() {
  await bootstrapAuth();
  const token = getCookie(SESSION_COOKIE);
  if (token)
    await pool.query("DELETE FROM auth_sessions WHERE token_hash = ?", [sessionHash(token)]);
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function requirePermission(permission: AppPermission) {
  const user = await getSessionUser();
  if (!user) throw new Error("Authentication required");
  if (!user.permissions.includes(permission))
    throw new Error("You do not have permission to do that");
  return user;
}

export async function listUsers(): Promise<AuthUser[]> {
  await requirePermission("users:manage");
  const [rows] = await pool.query<UserRow[]>("SELECT * FROM app_users ORDER BY name, email");
  return rows.map(toAuthUser);
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: AppRole;
}) {
  await requirePermission("users:manage");
  const now = Date.now();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO app_users
      (id, name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      id,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      await hashPassword(input.password),
      input.role,
      now,
      now,
    ],
  );
  const [rows] = await pool.query<UserRow[]>("SELECT * FROM app_users WHERE id = ?", [id]);
  return toAuthUser(rows[0]);
}

export async function updateUser(input: {
  id: string;
  role: AppRole;
  status: "active" | "suspended";
}) {
  const actor = await requirePermission("users:manage");
  if (actor.id === input.id && input.status === "suspended") {
    throw new Error("You cannot suspend your own account");
  }
  await pool.query("UPDATE app_users SET role = ?, status = ?, updated_at = ? WHERE id = ?", [
    input.role,
    input.status,
    Date.now(),
    input.id,
  ]);
  if (input.status === "suspended") {
    await pool.query("DELETE FROM auth_sessions WHERE user_id = ?", [input.id]);
  }
  const [rows] = await pool.query<UserRow[]>("SELECT * FROM app_users WHERE id = ?", [input.id]);
  if (!rows[0]) throw new Error("User not found");
  return toAuthUser(rows[0]);
}

export async function resetUserPassword(id: string, password: string) {
  const actor = await requirePermission("users:manage");
  await pool.query("UPDATE app_users SET password_hash = ?, updated_at = ? WHERE id = ?", [
    await hashPassword(password),
    Date.now(),
    id,
  ]);
  if (actor.id !== id) await pool.query("DELETE FROM auth_sessions WHERE user_id = ?", [id]);
}
