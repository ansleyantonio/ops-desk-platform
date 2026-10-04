export type LiveTimer = {
  userName: string;
  startedAt: string;
};

export type LiveTicket = {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string;
  updatedAt: string | null;
  runningTimers: LiveTimer[];
  loggedSeconds: number;
  timerAvailable: boolean;
};

export type LiveProject = {
  id: string;
  name: string;
  memberIds: string[];
  tickets: LiveTicket[];
};

export type LiveWorkSnapshot = {
  projects: LiveProject[];
  fetchedAt: string;
  stale: boolean;
};

type Person = { id?: unknown; name?: unknown } | null;
type ApiTimeEntry = {
  id?: unknown;
  running?: unknown;
  startedAt?: unknown;
  durationSecs?: unknown;
  user?: Person;
};
type ApiTicket = {
  id?: unknown;
  ticketId?: unknown;
  title?: unknown;
  status?: unknown;
  assignee?: Person;
  updatedAt?: unknown;
  timeEntries?: { data?: unknown };
};

const stringValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function isWorkingStatus(value: unknown) {
  return (
    stringValue(value)
      .toLowerCase()
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ") === "in progress"
  );
}

export function toLiveTicket(ticket: ApiTicket): LiveTicket | null {
  if (!isWorkingStatus(ticket.status)) return null;
  const id = stringValue(ticket.id) || stringValue(ticket.ticketId);
  const assigneeName = stringValue(ticket.assignee?.name);
  if (!id || !assigneeName) return null;
  const entries = Array.isArray(ticket.timeEntries?.data)
    ? (ticket.timeEntries.data as ApiTimeEntry[])
    : [];
  const uniqueEntries = [
    ...new Map(
      entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry, index) => [
          stringValue(entry.id) || `entry-${index}`,
          entry,
        ]),
    ).values(),
  ];
  const runningTimers = uniqueEntries
    .filter(
      (entry) =>
        entry.running === true &&
        Number.isFinite(Date.parse(stringValue(entry.startedAt))),
    )
    .map((entry) => ({
      userName: stringValue(entry.user?.name) || "Unknown user",
      startedAt: stringValue(entry.startedAt),
    }));
  const loggedSeconds = uniqueEntries.reduce(
    (sum, entry) =>
      sum +
      (entry.running === true ||
      typeof entry.durationSecs !== "number" ||
      !Number.isFinite(entry.durationSecs)
        ? 0
        : Math.max(0, entry.durationSecs)),
    0,
  );
  return {
    id,
    title: stringValue(ticket.title) || stringValue(ticket.ticketId) || id,
    status: stringValue(ticket.status),
    assigneeId: stringValue(ticket.assignee?.id) || null,
    assigneeName,
    updatedAt: stringValue(ticket.updatedAt) || null,
    runningTimers,
    loggedSeconds,
    timerAvailable: Array.isArray(ticket.timeEntries?.data),
  };
}
