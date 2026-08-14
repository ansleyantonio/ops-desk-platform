import type { TeamMapTreeConfig } from "@/lib/team-map-config";
import { ensureSchema } from "@/lib/project-db.server";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: process.env.MYSQL_PASSWORD || undefined,
  database: "project-pal",
  charset: "utf8mb4",
});

const CONFIG_KEY = "primary";

export async function getTeamMapTreeConfig(): Promise<TeamMapTreeConfig | null> {
  await ensureSchema();
  const [rows] = await pool.query<Array<{ config_json: string }>>(
    "SELECT config_json FROM team_map_tree_config WHERE config_key = ? LIMIT 1",
    [CONFIG_KEY],
  );
  if (!rows[0]) return null;
  return JSON.parse(rows[0].config_json) as TeamMapTreeConfig;
}

export async function saveTeamMapTreeConfig(config: TeamMapTreeConfig) {
  await ensureSchema();
  const nextConfig = { ...config, updatedAt: Date.now() };
  await pool.execute(
    `
      INSERT INTO team_map_tree_config (config_key, config_json, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        config_json = VALUES(config_json),
        updated_at = VALUES(updated_at)
    `,
    [CONFIG_KEY, JSON.stringify(nextConfig), nextConfig.updatedAt],
  );
  return nextConfig;
}
