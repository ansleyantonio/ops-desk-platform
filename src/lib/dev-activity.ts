import type { Module } from "./tracker-types";

export function activityWindow(start: string, end: string) {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`) + 86400000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null;
  let days = 0;
  for (let at = from; at < to; at += 86400000) {
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days++;
  }
  return { from, to, capacity: days * 8 };
}

function legacyTicketActivity(
  ticket: Module,
  from: number,
  to: number,
  now: number,
) {
  const line = ticket.notes
    ?.split(/\r?\n/)
    .find((line) => line.startsWith("Status history:"));
  const history = (line?.slice("Status history:".length).split("|") ?? []).map(
    (entry) => {
      const match = entry.trim().match(/^(\S+)\s+(.+)$/);
      return {
        at: match ? Date.parse(match[1]) : NaN,
        status: match?.[2].trim().toLowerCase() ?? "",
      };
    },
  );
  const movements: string[] = [];
  let started = false;
  let reviewed = false;
  let recorded = false;
  const stage = (status: string) => {
    const value = status.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
    if (["to do", "todo", "not started"].includes(value)) return "To do";
    if (value === "in progress") return "In progress";
    if (["in review", "review"].includes(value)) return "In review";
    return null;
  };
  const created = ticket.notes?.match(/^Created:\s+(\S+)/m)?.[1];
  const createdAt = created ? Date.parse(created) : NaN;
  history.forEach((entry, index) => {
    if (!Number.isFinite(entry.at)) return;
    recorded = true;
    const previous = history[index - 1];
    if (!previous || entry.at < from || entry.at >= to || entry.at > now)
      return;
    const previousStage = stage(previous.status);
    const nextStage = stage(entry.status);
    const isStart = previousStage === "To do" && nextStage === "In progress";
    const isReview =
      previousStage === "In progress" && nextStage === "In review";
    // Count only observed forward developer transitions, never infer skipped stages.
    if (isStart || isReview) {
      movements.push(
        `${previousStage} → ${nextStage} (${new Date(entry.at).toISOString()})`,
      );
      started ||= isStart;
      reviewed ||= isReview;
    }
  });
  return { started, reviewed, movements, recorded };
}

const personKey = (name: string | undefined) =>
  name?.trim().toLocaleLowerCase();
export function ticketActivity(
  ticket: Module,
  from: number,
  to: number,
  now: number,
  memberKey?: string,
) {
  const matches = (name: string | undefined) =>
    !memberKey || personKey(name) === memberKey;
  const inRange = (value: string) => {
    const at = Date.parse(value);
    return Number.isFinite(at) && at >= from && at < to && at <= now;
  };
  const unique = <T extends { id: string }>(items: T[]) => [
    ...new Map(items.map((item) => [item.id, item])).values(),
  ];
  const events = unique(ticket.activities ?? [])
    .filter((event) => matches(event.actor?.name) && inRange(event.createdAt))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const timeEntries = unique(ticket.timeEntries ?? [])
    .filter((entry) => matches(entry.user?.name) && inRange(entry.startedAt))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  // Running timers have no final duration. Never turn elapsed wall time into logged work.
  const duration = (entry: (typeof timeEntries)[number]) =>
    !entry.running &&
    typeof entry.durationSecs === "number" &&
    Number.isFinite(entry.durationSecs)
      ? Math.max(0, entry.durationSecs)
      : 0;
  const loggedSeconds = timeEntries.reduce(
    (sum, entry) => sum + duration(entry),
    0,
  );
  const stage = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[_-]/g, " ");
  const transitions = events.filter(
    (event) => event.action === "STATUS_CHANGED",
  );
  const isStart = (event: (typeof events)[number]) =>
    ["to do", "todo", "not started"].includes(stage(event.metadata?.from)) &&
    stage(event.metadata?.to) === "in progress";
  const isReview = (event: (typeof events)[number]) =>
    stage(event.metadata?.from) === "in progress" &&
    ["in review", "review", "pull request"].includes(stage(event.metadata?.to));
  const devTransitions = transitions.filter(
    (event) => isStart(event) || isReview(event),
  );
  const legacy =
    ticket.activities === undefined && matches(ticket.assignee)
      ? legacyTicketActivity(ticket, from, to, now)
      : null;
  const timeline = [
    ...events.map((event) => ({
      id: `activity:${event.id}`,
      at: event.createdAt,
      text:
        event.action === "STATUS_CHANGED"
          ? `${String(event.metadata?.from ?? "Unknown")} → ${String(event.metadata?.to ?? "Unknown")}`
          : event.action.toLowerCase().replace(/_/g, " "),
    })),
    ...timeEntries.map((entry) => ({
      id: `time:${entry.id}`,
      at: entry.startedAt,
      text: `${entry.kind.toLowerCase().replace(/_/g, " ")} · ${entry.running ? "Timer running (excluded from hours)" : `${(duration(entry) / 3600).toFixed(2)}h logged`}${entry.note ? ` · ${entry.note}` : ""}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return {
    started: legacy?.started ?? transitions.some(isStart),
    reviewed: legacy?.reviewed ?? transitions.some(isReview),
    movements:
      legacy?.movements ??
      devTransitions.map(
        (event) =>
          `${event.metadata?.from} → ${event.metadata?.to} (${event.createdAt})`,
      ),
    recorded: ticket.activities !== undefined || (legacy?.recorded ?? false),
    timeAvailable: ticket.timeEntries !== undefined,
    loggedSeconds,
    eventCount: events.length,
    timeEntryCount: timeEntries.length,
    timeline,
  };
}
