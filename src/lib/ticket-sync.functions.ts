import { createServerFn } from "@tanstack/react-start";

export const getTicketSyncStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requirePermission } = await import("./auth.server");
    await requirePermission("projects:view");
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const now = new Date();
    const expected = new Date(now);
    expected.setUTCHours(6, 0, 0, 0);
    if (now < expected) expected.setUTCDate(expected.getUTCDate() - 1);
    try {
      const summary = JSON.parse(
        await readFile(
          join(
            process.cwd(),
            "outputs/pen-projects-preserve-teams-sync-summary.json",
          ),
          "utf8",
        ),
      );
      const at = Date.parse(summary.syncedAt);
      if (!Number.isFinite(at) || at > now.getTime())
        throw new Error("Invalid sync timestamp");
      return {
        state:
          at >= expected.getTime()
            ? ("current" as const)
            : ("overdue" as const),
        syncedAt: new Date(at).toISOString(),
      };
    } catch {
      return { state: "unknown" as const, syncedAt: null };
    }
  },
);
