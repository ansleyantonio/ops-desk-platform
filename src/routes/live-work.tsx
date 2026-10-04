import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  RefreshCw,
  Search,
  Timer,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listTeamData } from "@/lib/project.functions";
import { listLiveWork } from "@/lib/live-work.functions";
import type {
  LiveProject,
  LiveTicket,
  LiveWorkSnapshot,
} from "@/lib/live-work";
import type { TeamMember } from "@/lib/tracker-types";

export const Route = createFileRoute("/live-work")({
  head: () => ({
    meta: [
      { title: "Live work | OpsDesk" },
      {
        name: "description",
        content: "Current developer work and ticket timers.",
      },
    ],
  }),
  component: LiveWorkPage,
});

type PersonRow = {
  key: string;
  name: string;
  assignedProjects: LiveProject[];
  active: Array<{ project: LiveProject; ticket: LiveTicket }>;
};
const personKey = (name: string) => name.trim().toLocaleLowerCase();

function buildRows(
  projects: LiveProject[],
  members: TeamMember[],
): PersonRow[] {
  const people = new Map<string, PersonRow>();
  const memberById = new Map(members.map((member) => [member.id, member]));
  const memberByName = new Map(
    members.map((member) => [personKey(member.name), member]),
  );
  const ensure = (id: string | null, name: string) => {
    const known =
      (id && memberById.get(id)) || memberByName.get(personKey(name));
    if (known && known.role !== "dev") return null;
    const key = known?.id || `api:${personKey(name)}`;
    const row = people.get(key) ?? {
      key,
      name: known?.name || name,
      assignedProjects: [],
      active: [],
    };
    people.set(key, row);
    return row;
  };
  for (const project of projects) {
    for (const id of project.memberIds) {
      const member = memberById.get(id);
      if (!member || member.role !== "dev") continue;
      const row = ensure(member.id, member.name)!;
      if (!row.assignedProjects.some((item) => item.id === project.id))
        row.assignedProjects.push(project);
    }
    for (const ticket of project.tickets) {
      const row = ensure(ticket.assigneeId, ticket.assigneeName);
      if (!row) continue;
      row.active.push({ project, ticket });
    }
  }
  return [...people.values()].sort(
    (a, b) =>
      Number(b.active.length > 0) - Number(a.active.length > 0) ||
      a.name.localeCompare(b.name),
  );
}

function duration(seconds: number) {
  const hours = Math.floor(Math.max(0, seconds) / 3600);
  const minutes = Math.floor((Math.max(0, seconds) % 3600) / 60);
  return hours
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m`;
}

function LiveWorkPage() {
  const [snapshot, setSnapshot] = useState<LiveWorkSnapshot | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const refresh = async (initial = false) => {
    if (!initial) setRefreshing(true);
    try {
      const [work, team] = await Promise.all([listLiveWork(), listTeamData()]);
      setSnapshot(work);
      setMembers(team.members);
      setError("");
    } catch (cause) {
      console.error("Failed to load live work", cause);
      setError("Current ticket data could not be loaded. Try refreshing.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    void refresh(true);
    const poll = window.setInterval(() => {
      void refresh();
    }, 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, []);

  const projects = useMemo(() => snapshot?.projects ?? [], [snapshot]);
  const rows = useMemo(() => buildRows(projects, members), [projects, members]);
  const filtered = rows.filter((row) => {
    const active = row.active.filter(
      ({ project }) => projectFilter === "all" || project.id === projectFilter,
    );
    const assigned = row.assignedProjects.filter(
      (project) => projectFilter === "all" || project.id === projectFilter,
    );
    if (viewFilter === "active" && !active.length) return false;
    if (
      viewFilter === "all" &&
      projectFilter !== "all" &&
      !active.length &&
      !assigned.length
    )
      return false;
    const needle = personKey(query);
    return (
      !needle ||
      row.name.toLocaleLowerCase().includes(needle) ||
      active.some(({ project, ticket }) =>
        `${project.name} ${ticket.title}`.toLocaleLowerCase().includes(needle),
      )
    );
  });
  const activeCount = new Set(
    rows.filter((row) => row.active.length).map((row) => row.key),
  ).size;
  const runningCount = projects.reduce(
    (sum, project) =>
      sum +
      project.tickets.reduce(
        (count, ticket) => count + ticket.runningTimers.length,
        0,
      ),
    0,
  );

  return (
    <div className="mx-auto max-w-[1420px] space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="app-kicker">Delivery intelligence</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            Live work
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Developers with assigned in-progress tickets, their projects, and
            ticket timers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />{" "}
          Refresh
        </Button>
      </section>

      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/70 bg-card/55 px-4 py-3 text-sm"
      >
        <Activity className="h-4 w-4 text-primary" />
        <span>
          {snapshot
            ? `Updated ${new Date(snapshot.fetchedAt).toLocaleString()}`
            : loading
              ? "Loading current work…"
              : "Current work unavailable"}
        </span>
        {snapshot?.stale && (
          <Badge variant="outline" className="text-warning">
            Stale data
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          Refreshes every minute. Running timers update on screen every 15
          seconds.
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {snapshot && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric
              icon={<UserRound className="h-4 w-4" />}
              label="Developers working"
              value={activeCount}
            />
            <Metric
              icon={<Activity className="h-4 w-4" />}
              label="In-progress tickets"
              value={projects.reduce(
                (sum, project) => sum + project.tickets.length,
                0,
              )}
            />
            <Metric
              icon={<Timer className="h-4 w-4" />}
              label="Running ticket timers"
              value={runningCount}
            />
          </section>

          <section className="grid gap-3 rounded-xl border border-border/70 bg-card/55 p-3 sm:grid-cols-[minmax(200px,1fr)_220px_170px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search developer, project, ticket"
                aria-label="Search live work"
              />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={viewFilter} onValueChange={setViewFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Working now</SelectItem>
                <SelectItem value="all">All developers</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-3" aria-label="Developer work">
            {filtered.length ? (
              filtered.map((row) => {
                const active = row.active.filter(
                  ({ project }) =>
                    projectFilter === "all" || project.id === projectFilter,
                );
                const assigned = row.assignedProjects.filter(
                  (project) =>
                    projectFilter === "all" || project.id === projectFilter,
                );
                return (
                  <article
                    key={row.key}
                    className="rounded-xl border border-border/70 bg-card/65 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold">{row.name}</h2>
                      <Badge variant={active.length ? "default" : "outline"}>
                        {active.length
                          ? `${active.length} in progress`
                          : "No current work recorded"}
                      </Badge>
                    </div>
                    {active.length ? (
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {active.map(({ project, ticket }) => (
                          <div
                            key={`${project.id}:${ticket.id}`}
                            className="rounded-lg border border-border/70 bg-background/60 p-3"
                          >
                            <Link
                              to="/projects/$projectId"
                              params={{ projectId: project.id }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {project.name}
                            </Link>
                            <div className="mt-1 text-sm font-medium">
                              {ticket.title}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">In progress</Badge>
                              {ticket.updatedAt && (
                                <span>
                                  Ticket updated{" "}
                                  {new Date(ticket.updatedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <div className="mt-3 border-t border-border/60 pt-2 text-xs">
                              {ticket.runningTimers.length ? (
                                ticket.runningTimers.map((timer, index) => (
                                  <div
                                    key={`${timer.startedAt}:${index}`}
                                    className="flex items-center gap-1.5 font-medium text-primary"
                                  >
                                    <Timer className="h-3.5 w-3.5" /> Timer
                                    running · {timer.userName} ·{" "}
                                    {duration(
                                      (now - Date.parse(timer.startedAt)) /
                                        1000,
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Clock3 className="h-3.5 w-3.5" /> No timer
                                  running
                                </div>
                              )}
                              {ticket.timerAvailable && (
                                <div className="mt-1 text-muted-foreground">
                                  Logged on ticket:{" "}
                                  {duration(ticket.loggedSeconds)}
                                </div>
                              )}
                              {!ticket.timerAvailable && (
                                <div className="mt-1 text-warning">
                                  Timer data unavailable
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No assigned ticket is currently in progress.
                      </p>
                    )}
                    {assigned.length > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Assigned to project:{" "}
                        {assigned.map((project) => project.name).join(", ")}
                      </p>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No developers match the current view.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/65 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
