import type { Project, TeamMember } from "./tracker-types";

export type PerformanceRow = {
  name: string;
  role: "dev" | "qa";
  seconds: number;
  ticketCount: number;
  status: "met" | "below" | "unavailable";
};

export function buildPerformanceReport(
  date: string,
  targetHours: number,
  projects: Project[],
  members: TeamMember[],
): PerformanceRow[] {
  const from = Date.parse(`${date}T00:00:00Z`);
  const to = from + 86400000;
  const names = new Map(members.filter((member) => member.role === "dev" || member.role === "qa")
    .map((member) => [member.name.trim().toLocaleLowerCase(), member]));
  const totals = new Map<string, { seconds: number; tickets: Set<string>; seen: Set<string> }>();
  let available = false;
  for (const project of projects.filter((item) => !item.isDraft)) {
    for (const ticket of project.modules) {
      if (ticket.timeEntries === undefined) continue;
      available = true;
      for (const entry of ticket.timeEntries) {
        const key = entry.user?.name?.trim().toLocaleLowerCase();
        if (!key || !names.has(key) || entry.running || !Number.isFinite(entry.durationSecs) || !entry.durationSecs || entry.durationSecs < 0) continue;
        const at = Date.parse(entry.startedAt);
        if (!Number.isFinite(at) || at < from || at >= to) continue;
        const row = totals.get(key) ?? { seconds: 0, tickets: new Set<string>(), seen: new Set<string>() };
        if (row.seen.has(entry.id)) continue;
        row.seen.add(entry.id);
        row.seconds += entry.durationSecs;
        row.tickets.add(`${project.id}:${ticket.id}`);
        totals.set(key, row);
      }
    }
  }
  return [...names].map(([key, member]) => {
    const total = totals.get(key);
    const seconds = total?.seconds ?? 0;
    return {
      name: member.name,
      role: member.role as "dev" | "qa",
      seconds,
      ticketCount: total?.tickets.size ?? 0,
      status: !available ? "unavailable" as const : seconds >= targetHours * 3600 ? "met" as const : "below" as const,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function formatPerformanceEmail(date: string, targetHours: number, rows: PerformanceRow[], test = false) {
  const label = test ? "[TEST] " : "";
  const subject = `${label}Dev performance for ${date} (UTC)`;
  const lines = [
    `${label}Dev performance — ${date} (UTC)`,
    `Ticket time target: ${targetHours} hours per person`,
    "Only completed ticket time entries started on this UTC date are counted. Running timers are excluded.",
    "",
    ...rows.map((row) => `${row.name} (${row.role.toUpperCase()}): ${row.status === "unavailable" ? "Time data unavailable" : `${(row.seconds / 3600).toFixed(2)}h across ${row.ticketCount} ticket${row.ticketCount === 1 ? "" : "s"} — ${row.status === "met" ? "Met target" : "Below target"}`}`),
    ...(rows.length ? [] : ["No developer or QA members are configured."]),
  ];
  return { subject, text: lines.join("\n") };
}
