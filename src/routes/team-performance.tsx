import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FolderKanban,
  Info,
  ListChecks,
  Search,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listProjects, listTeamData } from "@/lib/project.functions";
import type { Module, Project, TeamMember } from "@/lib/tracker-types";

export const Route = createFileRoute("/team-performance")({
  head: () => ({
    meta: [
      { title: "Team performance | OpsDesk" },
      { name: "description", content: "Team member ticket statistics across projects." },
    ],
  }),
  component: TeamPerformancePage,
});

type MemberStats = {
  key: string;
  name: string;
  role?: TeamMember["role"];
  title?: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  reviewFailed: number;
  effortDays: number;
  projects: Array<{ id: string; name: string; tickets: number }>;
};

export function TeamPerformancePage({ mode = "all" }: { mode?: "all" | "dev" | "pm" }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [completionFilter, setCompletionFilter] = useState("all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listProjects(), listTeamData()])
      .then(([projectData, teamData]) => {
        if (cancelled) return;
        setProjects(projectData.filter((project) => !project.isDraft));
        setMembers(teamData.members);
      })
      .catch((error) => console.error("Failed to load team performance", error))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => buildMemberStats(projects, members, projectFilter, statusFilter, mode),
    [mode, projects, members, projectFilter, statusFilter],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stats.filter((row) => {
      const matchesRole = mode === "dev" ? row.role === "dev" || row.role === "qa" : mode === "pm" ? row.role === "pm" : roleFilter === "all" || row.role === roleFilter;
      const matchesTicketScope =
        (projectFilter === "all" && statusFilter === "all" && completionFilter === "all") || row.total > 0;
      const completion = row.total ? Math.round((row.completed / row.total) * 100) : 0;
      const matchesCompletion =
        completionFilter === "all" ||
        (completionFilter === "complete" && completion === 100) ||
        (completionFilter === "high" && completion >= 75 && completion < 100) ||
        (completionFilter === "medium" && completion >= 50 && completion < 75) ||
        (completionFilter === "low" && completion > 0 && completion < 50) ||
        (completionFilter === "none" && completion === 0);
      const matchesQuery =
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.title?.toLowerCase().includes(needle) ||
        row.projects.some((project) => project.name.toLowerCase().includes(needle));
      return matchesRole && matchesTicketScope && matchesCompletion && matchesQuery;
    });
  }, [completionFilter, mode, projectFilter, query, roleFilter, stats, statusFilter]);
  const filtersActive = projectFilter !== "all" || (mode === "all" && roleFilter !== "all") || statusFilter !== "all" || completionFilter !== "all" || Boolean(query);
  const totals = useMemo(
    () => ({
      tickets: filtered.reduce((sum, row) => sum + row.total, 0),
      completed: filtered.reduce((sum, row) => sum + row.completed, 0),
      blocked: filtered.reduce((sum, row) => sum + row.blocked, 0),
      activeMembers: filtered.filter((row) => row.total > 0).length,
    }),
    [filtered],
  );

  return (
    <div className="mx-auto max-w-[1420px] space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="app-kicker">Delivery intelligence</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.8rem]">
            {mode === "dev" ? "Dev performance" : mode === "pm" ? "PM performance" : "Team performance"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {mode === "pm" ? "Project manager delivery statistics calculated from owned and assigned project tickets." : mode === "dev" ? "Developer and QA delivery statistics calculated from assigned tickets across all projects." : "Member-wise delivery statistics calculated from assigned tickets across all projects."}
          </p>
        </div>
      </section>

      <section className="grid gap-2 rounded-[1.3rem] border border-border/70 bg-card/55 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(150px,.65fr))_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member or project" className="pl-9" />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All projects</SelectItem>{projects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
        </Select>
        {mode === "all" ? <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="pm">Project managers</SelectItem><SelectItem value="dev">Developers</SelectItem><SelectItem value="qa">QA</SelectItem></SelectContent>
        </Select> : <div className="flex h-10 items-center rounded-md border border-border bg-muted/35 px-3 text-sm text-muted-foreground">{mode === "dev" ? "Developers & QA" : "Project managers"}</div>}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All ticket statuses</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="not_started">Not started</SelectItem><SelectItem value="blocked">Blocked</SelectItem><SelectItem value="review_failed">Review failed</SelectItem></SelectContent>
        </Select>
        <Select value={completionFilter} onValueChange={setCompletionFilter}>
          <SelectTrigger><SelectValue placeholder="All completion" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All completion</SelectItem><SelectItem value="complete">100% complete</SelectItem><SelectItem value="high">75–99% complete</SelectItem><SelectItem value="medium">50–74% complete</SelectItem><SelectItem value="low">1–49% complete</SelectItem><SelectItem value="none">0% complete</SelectItem></SelectContent>
        </Select>
        <Button variant="ghost" disabled={!filtersActive} onClick={() => { setQuery(""); setProjectFilter("all"); setRoleFilter("all"); setStatusFilter("all"); setCompletionFilter("all"); }}>Reset</Button>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Assigned tickets" value={totals.tickets} icon={<ListChecks className="h-4 w-4" />} />
        <Metric label="Completed" value={totals.completed} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Metric label="Blocked" value={totals.blocked} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Active members" value={totals.activeMembers} icon={<UserRound className="h-4 w-4" />} />
      </section>

      {!loaded ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-[1.4rem]" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card/55 px-6 py-16 text-center">
          <CircleDashed className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No matching ticket assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Assign tickets to team members to populate this report.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
          <div className="hidden grid-cols-[minmax(200px,1.5fr)_repeat(6,minmax(72px,.55fr))_minmax(220px,1.4fr)] gap-3 border-b border-border/70 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:grid">
            <span>Team member</span><span>Tickets</span><span>Done</span><span>Active</span><span>Blocked</span><span>Review fail</span><span className="flex items-center gap-1">Completion <CompletionInfo /></span><span>Projects</span>
          </div>
          <div className="divide-y divide-border/70">
            {filtered.map((row) => <MemberRow key={row.key} row={row} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-[1.3rem] border border-border/70 bg-card/55 p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-medium">{label}</span>{icon}</div><div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</div></div>;
}

function MemberRow({ row }: { row: MemberStats }) {
  const completion = row.total ? Math.round((row.completed / row.total) * 100) : 0;
  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(200px,1.5fr)_repeat(6,minmax(72px,.55fr))_minmax(220px,1.4fr)] xl:items-center xl:gap-3">
      <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">{initials(row.name)}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">{row.name}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{row.title || (row.role ? roleLabel[row.role] : "Unmatched assignee")} · {row.effortDays} effort days</div></div></div>
      <Stat label="Tickets" value={row.total} />
      <Stat label="Done" value={row.completed} tone="text-success" />
      <Stat label="Active" value={row.inProgress} tone="text-primary" />
      <Stat label="Blocked" value={row.blocked} tone={row.blocked ? "text-destructive" : undefined} />
      <Stat label="Review fail" value={row.reviewFailed} tone={row.reviewFailed ? "text-warning" : undefined} />
      <div><div className="flex items-center justify-between text-xs"><span className="xl:hidden text-muted-foreground">Completion</span><span className="font-semibold text-foreground">{completion}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${completion}%` }} /></div></div>
      <div className="flex flex-wrap gap-1.5">{row.projects.slice(0, 3).map((project) => <Badge key={project.id} variant="outline" asChild className="font-normal"><Link to="/projects/$projectId" params={{ projectId: project.id }}><FolderKanban className="h-3 w-3" />{project.name} · {project.tickets}</Link></Badge>)}{row.projects.length > 3 && <Badge variant="secondary">+{row.projects.length - 3}</Badge>}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="flex items-center justify-between xl:block"><span className="text-xs text-muted-foreground xl:hidden">{label}</span><span className={`app-mono text-sm font-semibold ${tone || "text-foreground"}`}>{value}</span></div>;
}

function CompletionInfo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="How completion is calculated">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-center normal-case tracking-normal">
          Completion = completed assigned tickets ÷ total assigned tickets × 100, using the active project and ticket-status filters.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function buildMemberStats(projects: Project[], members: TeamMember[], projectFilter: string, statusFilter: string, mode: "all" | "dev" | "pm"): MemberStats[] {
  const rows = new Map<string, MemberStats>();
  const relevantMemberIds = new Set(
    projects.flatMap((project) => [project.pmId, ...project.memberIds]).filter(Boolean),
  );
  const assigneeNames = new Set(
    projects.flatMap((project) => project.modules.map((ticket) => normalize(ticket.assignee ?? ""))).filter(Boolean),
  );
  for (const member of members) {
    if (relevantMemberIds.has(member.id) || assigneeNames.has(normalize(member.name))) {
      rows.set(normalize(member.name), emptyStats(member.name, member));
    }
  }
  for (const project of projects) {
    if (projectFilter !== "all" && project.id !== projectFilter) continue;
    for (const ticket of project.modules) {
      if (statusFilter !== "all" && (statusFilter === "review_failed" ? ticket.uat !== "failed" : ticket.status !== statusFilter)) continue;
      const projectManager = project.pmId ? members.find((member) => member.id === project.pmId) : undefined;
      const name = mode === "pm" ? (projectManager?.name || project.owner)?.trim() : ticket.assignee?.trim();
      if (!name) continue;
      const key = normalize(name);
      const row = rows.get(key) ?? emptyStats(name);
      addTicket(row, ticket, project);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function emptyStats(name: string, member?: TeamMember): MemberStats {
  return { key: normalize(name), name: member?.name ?? name, role: member?.role, title: member?.title, total: 0, completed: 0, inProgress: 0, notStarted: 0, blocked: 0, reviewFailed: 0, effortDays: 0, projects: [] };
}

function addTicket(row: MemberStats, ticket: Module, project: Project) {
  row.total += 1;
  row[ticket.status === "not_started" ? "notStarted" : ticket.status === "in_progress" ? "inProgress" : ticket.status] += 1;
  if (ticket.uat === "failed") row.reviewFailed += 1;
  row.effortDays += ticket.effortDays ?? 0;
  const projectRow = row.projects.find((item) => item.id === project.id);
  if (projectRow) projectRow.tickets += 1;
  else row.projects.push({ id: project.id, name: project.name, tickets: 1 });
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const initials = (value: string) => value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const roleLabel: Record<TeamMember["role"], string> = { pm: "Project manager", dev: "Developer", qa: "QA" };
