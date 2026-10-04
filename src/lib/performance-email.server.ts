import mysql, { type RowDataPacket } from "mysql2/promise";
import nodemailer from "nodemailer";
import { ensureSchema, listProjects, listTeamData } from "./project-db.server";
import { buildPerformanceReport, formatPerformanceEmail } from "./performance-email-report";

const pool = mysql.createPool({
  host: "127.0.0.1", port: 3306, user: process.env.MYSQL_USER || "opsdesk",
  password: process.env.MYSQL_PASSWORD || undefined, database: "project-pal", charset: "utf8mb4",
});

export type PerformanceEmailSettings = { enabled: boolean; recipients: string[]; targetHours: number; lastSentDate: string | null };
const emailPattern = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export function parseRecipients(value: string) {
  const emails = [...new Set(value.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 30 || emails.some((email) => !emailPattern.test(email) || email.length > 255)) throw new Error("Enter up to 30 valid email addresses.");
  return emails;
}

export async function getPerformanceEmailSettings(): Promise<PerformanceEmailSettings> {
  await ensureSchema();
  const [rows] = await pool.query<Array<RowDataPacket & { enabled: number; recipients: string; target_hours: number }>>(
    "SELECT enabled, recipients, target_hours FROM performance_email_settings WHERE id = 1",
  );
  const [delivery] = await pool.query<Array<RowDataPacket & { report_date: string }>>(
    "SELECT DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date FROM performance_email_deliveries WHERE status = 'sent' ORDER BY report_date DESC LIMIT 1",
  );
  return { enabled: Boolean(rows[0]?.enabled), recipients: parseRecipients(rows[0]?.recipients ?? ""), targetHours: Number(rows[0]?.target_hours ?? 8), lastSentDate: delivery[0]?.report_date ?? null };
}

export async function savePerformanceEmailSettings(input: { enabled: boolean; recipients: string; targetHours: number }) {
  const recipients = parseRecipients(input.recipients);
  if (input.enabled && !recipients.length) throw new Error("Add at least one recipient before enabling daily emails.");
  if (!Number.isFinite(input.targetHours) || input.targetHours <= 0 || input.targetHours > 24) throw new Error("Target hours must be between 0 and 24.");
  await ensureSchema();
  await pool.execute(
    "INSERT INTO performance_email_settings (id, enabled, recipients, target_hours, updated_at) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), recipients = VALUES(recipients), target_hours = VALUES(target_hours), updated_at = VALUES(updated_at)",
    [input.enabled ? 1 : 0, recipients.join(","), input.targetHours, Date.now()],
  );
  return getPerformanceEmailSettings();
}

function transport() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) throw new Error("Email is not configured. Set SMTP_HOST and SMTP_FROM on the server.");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is invalid.");
  return { from, client: nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  }) };
}

export async function sendPerformanceEmail(input: { date: string; testTo?: string; manual?: boolean }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date) throw new Error("Choose a valid UTC report date.");
  const today = new Date().toISOString().slice(0, 10);
  if (input.date > today) throw new Error("Cannot report a future date.");
  const settings = await getPerformanceEmailSettings();
  if (!input.manual && !settings.enabled) return { sent: false, reason: "Daily emails are disabled." };
  const recipients = input.testTo ? parseRecipients(input.testTo) : settings.recipients;
  if (input.testTo && recipients.length !== 1) throw new Error("Enter one test email address.");
  if (!recipients.length) throw new Error("Add a recipient before sending.");
  const { from, client } = transport();
  const isTest = Boolean(input.testTo);
  if (!isTest) {
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      "INSERT IGNORE INTO performance_email_deliveries (report_date, status, updated_at) VALUES (?, 'sending', ?)",
      [input.date, Date.now()],
    );
    if (!result.affectedRows) {
      const [retry] = await pool.execute<mysql.ResultSetHeader>(
        "UPDATE performance_email_deliveries SET updated_at = ? WHERE report_date = ? AND status = 'sending' AND updated_at < ?",
        [Date.now(), input.date, Date.now() - 3600000],
      );
      if (!retry.affectedRows) return { sent: false, reason: "This report has already been sent or is being sent." };
    }
  }
  try {
    const [projects, team] = await Promise.all([listProjects(), listTeamData()]);
    const rows = buildPerformanceReport(input.date, settings.targetHours, projects, team.members);
    const message = formatPerformanceEmail(input.date, settings.targetHours, rows, isTest);
    await client.sendMail({ from, to: recipients.join(", "), ...message });
    if (!isTest) await pool.execute("UPDATE performance_email_deliveries SET status = 'sent', sent_at = ?, updated_at = ? WHERE report_date = ?", [Date.now(), Date.now(), input.date]);
    return { sent: true, recipientCount: recipients.length, memberCount: rows.length };
  } catch (error) {
    if (!isTest) await pool.execute("DELETE FROM performance_email_deliveries WHERE report_date = ? AND status = 'sending'", [input.date]);
    throw error;
  } finally {
    client.close();
  }
}
