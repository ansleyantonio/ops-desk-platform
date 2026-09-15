import { TicketSyncStatus } from "@/components/ticket-sync-status";
import { DevActivityPanel } from "@/components/dev-activity-panel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  FolderKanban,
  Info,
  ListChecks,
  Sparkles,
  Search,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { enumParam, stringParam, useUrlParam, useUrlSearchUpdater } from "@/hooks/use-url-state";
import { fetchPenProjectBrief, listProjects, listTeamData } from "@/lib/project.functions";
import type { Module, Project, ProjectTeam, TeamMember } from "@/lib/tracker-types";

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
  groupKey?: string;
  teamName?: string;
  pmName?: string;
  scopeProjectIds?: string[];
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  reviewFailed: number;
  effortDays: number;
  complexityPoints: number;
  pointedTickets: number;
  backAndForth: number;
  reviewedTickets: number;
  projects: Array<{ id: string; name: string; tickets: number }>;
};

export function TeamPerformancePage({ mode = "all" }: { mode?: "all" | "dev" | "pm" }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [query, setQuery] = useUrlParam("q", stringParam());
  const [projectFilter, setProjectFilter] = useUrlParam(
    "project",
    stringParam("all", "push"),
  );
  const [roleFilter, setRoleFilter] = useUrlParam(
    "role",
    enumParam(["all", "pm", "dev", "qa"] as const, "all"),
  );
  const [statusFilter, setStatusFilter] = useUrlParam(
    "status",
    enumParam(
      ["all", "completed", "in_progress", "not_started", "blocked", "review_failed"] as const,
      "all",
    ),
  );
  const [completionFilter, setCompletionFilter] = useUrlParam(
    "completion",
    enumParam(["all", "complete", "high", "medium", "low", "none"] as const, "all"),
  );
  const [view, setView] = useUrlParam(
    "view",
    enumParam(["tickets", "scores", "fit"] as const, "tickets"),
  );
  const updateUrl = useUrlSearchUpdater();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listProjects(), listTeamData()])
      .then(([projectData, teamData]) => {
        if (cancelled) return;
        setProjects(projectData.filter((project) => !project.isDraft));
        setMembers(teamData.members);
        setTeams(teamData.teams);
      })
      .catch((error) => { console.error("Failed to load team performance", error); if (!cancelled) setLoadError(true); })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => buildMemberStats(projects, members, teams, projectFilter, statusFilter, mode),
    [mode, projects, members, teams, projectFilter, statusFilter],
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
        row.teamName?.toLowerCase().includes(needle) ||
        row.pmName?.toLowerCase().includes(needle) ||
        row.projects.some((project) => project.name.toLowerCase().includes(needle));
      return matchesRole && matchesTicketScope && matchesCompletion && matchesQuery;
    });
  }, [completionFilter, mode, projectFilter, query, roleFilter, stats, statusFilter]);
  const devGroups = useMemo(() => groupDevStats(filtered), [filtered]);
  const activityMembers = useMemo(() => {
    const people = new Map(filtered.map((member) => {
      const key = normalize(member.name);
      return [key, { ...member, key }] as const;
    }));
    if (completionFilter !== "all") return [...people.values()];
    const needle = query.trim().toLowerCase();
    for (const project of projects) {
      if (projectFilter !== "all" && project.id !== projectFilter) continue;
      for (const ticket of project.modules) {
        if (statusFilter !== "all" && (statusFilter === "review_failed" ? ticket.uat !== "failed" : ticket.status !== statusFilter)) continue;
        const participants = [...(ticket.activities ?? []).map((event) => event.actor), ...(ticket.timeEntries ?? []).map((entry) => entry.user)];
        for (const person of participants) {
          if (!person?.name) continue;
          const key = normalize(person.name);
          const member = members.find((candidate) => normalize(candidate.name) === key);
          if (member && member.role !== "dev" && member.role !== "qa") continue;
          if (needle && !key.includes(needle) && !project.name.toLowerCase().includes(needle) && !member?.title?.toLowerCase().includes(needle)) continue;
          if (!people.has(key)) people.set(key, emptyStats(person.name, member));
        }
      }
    }
    return [...people.values()];
  }, [filtered, completionFilter, query, projects, projectFilter, statusFilter, members]);
  const filtersActive = projectFilter !== "all" || (mode === "all" && roleFilter !== "all") || statusFilter !== "all" || completionFilter !== "all" || Boolean(query);
  const totals = useMemo(
    () => ({
      tickets: filtered.reduce((sum, row) => sum + row.total, 0),
      completed: filtered.reduce((sum, row) => sum + row.completed, 0),
      blocked: filtered.reduce((sum, row) => sum + row.blocked, 0),
      activeMembers: new Set(filtered.filter((row) => row.total > 0).map((row) => normalize(row.name))).size,
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
            {mode === "pm" ? "Project manager delivery statistics calculated from owned and assigned project tickets." : mode === "dev" ? "Developer and QA delivery statistics grouped by team and project manager." : "Member-wise delivery statistics calculated from assigned tickets across all projects."}
          </p>
        </div>
      </section>

      <section className="grid gap-2 rounded-[1.3rem] border border-border/70 bg-card/55 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(150px,.65fr))_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search member or project" placeholder="Search member or project" className="pl-9" />
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
        <Button variant="ghost" disabled={!filtersActive} onClick={() => updateUrl({ q: undefined, project: undefined, role: undefined, status: undefined, completion: undefined })}>Reset</Button>
      </section>

      {mode === "dev" && <TicketSyncStatus />}


      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>Performance data could not be loaded. Refresh to try again.</p><Button variant="outline" size="sm" onClick={() => window.location.reload()}>Refresh page</Button></div>}

      <section aria-label="Assignment overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Assigned tickets" value={loaded && !loadError ? totals.tickets : "—"} icon={<ListChecks className="h-4 w-4" />} />
        <Metric label="Completed" value={loaded && !loadError ? totals.completed : "—"} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Metric label="Blocked" value={loaded && !loadError ? totals.blocked : "—"} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Active members" value={loaded && !loadError ? totals.activeMembers : "—"} icon={<UserRound className="h-4 w-4" />} />
      </section>

      {mode === "dev" && loaded && !loadError && <DevActivityPanel projects={projects} members={activityMembers} projectFilter={projectFilter} statusFilter={statusFilter} />}

      {mode === "dev" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap rounded-xl border border-border/70 bg-card/55 p-1" role="tablist" aria-label="Developer performance view">
            <Button type="button" role="tab" aria-selected={view === "tickets"} variant={view === "tickets" ? "secondary" : "ghost"} size="sm" onClick={() => setView("tickets")}>
              <ListChecks className="h-4 w-4" /> Ticket stats
            </Button>
            <Button type="button" role="tab" aria-selected={view === "scores"} variant={view === "scores" ? "secondary" : "ghost"} size="sm" onClick={() => setView("scores")}>
              <BarChart3 className="h-4 w-4" /> Score board
            </Button>
            <Button type="button" role="tab" aria-selected={view === "fit"} variant={view === "fit" ? "secondary" : "ghost"} size="sm" onClick={() => setView("fit")}>
              <Sparkles className="h-4 w-4" /> Project fit
            </Button>
          </div>
          {view === "scores" && <span className="hidden text-xs text-muted-foreground sm:inline">Minimum 10 assigned tickets for ranking</span>}
        </div>
      )}

      {!loaded ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-[1.4rem]" />)}</div>
      ) : loadError ? null : filtered.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card/55 px-6 py-16 text-center">
          <CircleDashed className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No matching ticket assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Assign tickets to team members to populate this report.</p>
        </div>
      ) : mode === "dev" && view === "fit" ? (
        <ProjectFitPanel projects={projects} members={members} />
      ) : mode === "dev" && view === "scores" ? (
        <div className="space-y-4">{devGroups.map((group) => <ScoreBoard key={group.key} rows={group.rows} title={group.teamName} subtitle={`PM: ${group.pmName}`} />)}</div>
      ) : mode === "dev" ? (
        <DevTeamBreakdown groups={devGroups} />
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

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return <div className="rounded-[1.3rem] border border-border/70 bg-card/55 p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-medium">{label}</span>{icon}</div><div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</div></div>;
}

type ScoredMember = MemberStats & {
  rank: number;
  score: number;
  completionScore: number;
  complexityScore: number;
  reviewScore: number;
  completion: number;
};

type DevStatsGroup = {
  key: string;
  teamName: string;
  pmName: string;
  rows: MemberStats[];
  projectCount: number;
  tickets: number;
  completed: number;
};

function DevTeamBreakdown({ groups }: { groups: DevStatsGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const completion = group.tickets ? Math.round((group.completed / group.tickets) * 100) : 0;
        return (
          <section key={group.key} className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
            <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">{group.teamName}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5" />PM: {group.pmName}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{group.rows.length} member{group.rows.length === 1 ? "" : "s"}</Badge>
                <Badge variant="outline">{group.projectCount} project{group.projectCount === 1 ? "" : "s"}</Badge>
                <Badge variant="outline">{group.tickets} tickets</Badge>
                <Badge variant="outline">{completion}% complete</Badge>
              </div>
            </div>
            <div className="hidden grid-cols-[minmax(200px,1.5fr)_repeat(6,minmax(72px,.55fr))_minmax(220px,1.4fr)] gap-3 border-b border-border/70 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:grid">
              <span>Developer / QA</span><span>Tickets</span><span>Done</span><span>Active</span><span>Blocked</span><span>Review fail</span><span className="flex items-center gap-1">Completion <CompletionInfo /></span><span>Projects</span>
            </div>
            <div className="divide-y divide-border/70">{group.rows.map((row) => <MemberRow key={row.key} row={row} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

function ScoreBoard({ rows, title = "Delivery score board", subtitle }: { rows: MemberStats[]; title?: string; subtitle?: string }) {
  const ranked = useMemo(() => scoreMembers(rows), [rows]);
  if (!ranked.length) {
    return <div className="rounded-[1.5rem] border border-dashed border-border bg-card/55 px-6 py-10 text-center"><BarChart3 className="mx-auto h-7 w-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-xs font-medium text-foreground">{subtitle}</p>}<p className="mt-1 text-sm text-muted-foreground">No developer in this team has 10 assigned tickets in the current filter.</p></div>;
  }
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
      <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-foreground">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{subtitle ? `${subtitle} · ` : ""}50% completion · 35% complexity-adjusted delivery · 15% review efficiency</p></div>
        <ScoreInfo />
      </div>
      <div className="border-b border-border/70 p-4 sm:p-5">
        <div style={{ height: Math.max(360, ranked.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ranked} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <ChartTooltip contentStyle={scoreTooltipStyle} formatter={(value, name) => [`${Number(value).toFixed(1)} pts`, name]} cursor={{ fill: "hsl(var(--muted) / .3)" }} />
              <Bar dataKey="completionScore" name="Completion" stackId="score" fill="hsl(var(--success))" radius={[4, 0, 0, 4]} />
              <Bar dataKey="complexityScore" name="Complexity" stackId="score" fill="hsl(var(--primary))" />
              <Bar dataKey="reviewScore" name="Review efficiency" stackId="score" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><Legend color="hsl(var(--success))" label="Completion" /><Legend color="hsl(var(--primary))" label="Complexity" /><Legend color="hsl(var(--warning))" label="Review efficiency" /></div>
      </div>
      <div className="divide-y divide-border/70">
        {ranked.map((row) => <div key={row.key} className="grid gap-3 px-5 py-4 sm:grid-cols-[42px_minmax(180px,1fr)_repeat(4,minmax(90px,.55fr))] sm:items-center"><span className="app-mono text-lg font-semibold text-muted-foreground">#{row.rank}</span><div><div className="text-sm font-semibold">{row.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.completed}/{row.total} completed · {row.pointedTickets}/{row.total} explicitly estimated</div></div><ScoreStat label="Score" value={row.score.toFixed(1)} /><ScoreStat label="Completion" value={`${row.completion.toFixed(1)}%`} /><ScoreStat label="Complexity pts" value={row.complexityPoints} /><ScoreStat label="Back & forth" value={`${row.backAndForth} / ${row.reviewedTickets}`} /></div>)}
      </div>
    </section>
  );
}

type FitCandidate = {
  name: string;
  fit: number;
  relevance: number;
  reliability: number;
  quality: number;
  availability: number;
  relevantTickets: number;
  completed: number;
  total: number;
  overlappingTickets: number;
  overlappingEffort: number;
  evidence: string[];
};

function ProjectFitPanel({ projects, members }: { projects: Project[]; members: TeamMember[] }) {
  const [ticketingUrl, setTicketingUrl] = useState("");
  const [projectName, setProjectName] = useUrlParam("fitName", stringParam("Property Scanner"));
  const [scope, setScope] = useUrlParam("fitScope", stringParam());
  const [ticketContext, setTicketContext] = useState("");
  const [importedTickets, setImportedTickets] = useState<number | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [startDate, setStartDate] = useUrlParam("fitStart", stringParam());
  const [endDate, setEndDate] = useUrlParam("fitEnd", stringParam());
  const updateUrl = useUrlSearchUpdater();
  const candidates = useMemo(() => recommendDevelopers(projects, members, projectName, `${scope}\n${ticketContext}`, startDate, endDate), [projects, members, projectName, scope, ticketContext, startDate, endDate]);
  const ready = projectName.trim() && startDate && endDate && startDate <= endDate;
  const importProject = async () => {
    if (!ticketingUrl.trim()) return;
    setImporting(true); setImportError("");
    try {
      const brief = await fetchPenProjectBrief({ data: { url: ticketingUrl.trim() } });
      updateUrl({ fitName: brief.name, fitScope: brief.description }, "replace"); setTicketContext(brief.context); setImportedTickets(brief.ticketCount);
    } catch (error) {
      setImportedTickets(null); setTicketContext(""); setImportError(error instanceof Error ? error.message : "Could not load this ticketing project.");
    } finally { setImporting(false); }
  };
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
      <div className="border-b border-border/70 p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Find the best developer for a new project</h2><p className="mt-1 text-sm text-muted-foreground">Matches past ticket experience and delivery quality, then checks open assignments during the requested window.</p></div><Sparkles className="h-5 w-5 text-primary" /></div>
        <div className="mt-5 rounded-xl border border-border/70 bg-muted/25 p-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Import requirements from PEN ticketing</label>
          <div className="flex flex-col gap-2 sm:flex-row"><Input type="url" value={ticketingUrl} onChange={(event) => setTicketingUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void importProject(); }} placeholder="https://ticketing-system.pengroup.com/projects/deneme" className="flex-1" /><Button type="button" onClick={() => void importProject()} disabled={!ticketingUrl.trim() || importing}>{importing ? "Loading tickets…" : "Load project tickets"}</Button></div>
          {importedTickets != null && <p className="mt-2 text-xs text-success"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Imported {importedTickets} ticket{importedTickets === 1 ? "" : "s"}. Their titles, modules, types and labels are included in matching.</p>}
          {importError && <p className="mt-2 text-xs text-destructive"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{importError}</p>}
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,.8fr)_minmax(320px,1.4fr)_minmax(300px,1fr)]">
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">New project name</label><Input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Property Scanner" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">Scope and required capabilities</label><Textarea value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Property search, listing ingestion, maps, document scanning, APIs…" className="min-h-10 resize-y" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivery window</label><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Project start date" /><span className="text-xs text-muted-foreground">to</span><Input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Project end date" /></div></div>
        </div>
      </div>
      {!ready ? <div className="px-6 py-14 text-center"><CircleDashed className="mx-auto h-7 w-7 text-muted-foreground" /><h3 className="mt-3 font-semibold">Add a valid delivery window</h3><p className="mt-1 text-sm text-muted-foreground">The recommendation needs both dates to check developer commitments.</p></div> : !candidates.length ? <div className="px-6 py-14 text-center text-sm text-muted-foreground">No developers have enough historical ticket data for a recommendation.</div> : <div className="divide-y divide-border/70">{candidates.slice(0, 8).map((candidate, index) => <FitCandidateRow key={candidate.name} candidate={candidate} rank={index + 1} />)}</div>}
      <div className="border-t border-border/70 bg-muted/20 px-5 py-3 text-xs leading-5 text-muted-foreground">Fit is an evidence-based shortlist, not a delivery guarantee. Add scope keywords for a stronger match. Availability uses dated, unfinished assignments; tickets without dates cannot be placed accurately.</div>
    </section>
  );
}

function FitCandidateRow({ candidate, rank }: { candidate: FitCandidate; rank: number }) {
  const availabilityLabel = candidate.availability >= 80 ? "Available" : candidate.availability >= 55 ? "Some capacity" : "Heavily committed";
  return <div className="grid gap-4 px-5 py-5 xl:grid-cols-[52px_minmax(230px,1.3fr)_100px_repeat(4,minmax(105px,.55fr))] xl:items-center"><div className="app-mono text-xl font-semibold text-muted-foreground">#{rank}</div><div><div className="font-semibold">{candidate.name}</div><div className="mt-1 flex flex-wrap gap-1.5">{candidate.evidence.map((item) => <Badge key={item} variant="outline" className="font-normal">{item}</Badge>)}</div><p className="mt-2 text-xs text-muted-foreground">{candidate.relevantTickets} relevant historical tickets · {candidate.overlappingTickets} open ticket{candidate.overlappingTickets === 1 ? "" : "s"} overlap this window</p></div><div><div className="app-mono text-2xl font-semibold text-primary">{candidate.fit}%</div><div className="text-xs text-muted-foreground">overall fit</div></div><FitStat label="Relevance" value={`${candidate.relevance}%`} /><FitStat label="Reliability" value={`${candidate.reliability}%`} /><FitStat label="Quality" value={`${candidate.quality}%`} /><div><FitStat label="Availability" value={`${candidate.availability}%`} /><Badge variant={candidate.availability >= 55 ? "secondary" : "destructive"} className="mt-1">{availabilityLabel}</Badge></div></div>;
}

function FitStat({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between xl:block"><span className="text-xs text-muted-foreground">{label}</span><div className="app-mono mt-0.5 text-sm font-semibold">{value}</div></div>; }

function recommendDevelopers(projects: Project[], members: TeamMember[], projectName: string, scope: string, startDate: string, endDate: string): FitCandidate[] {
  if (!projectName.trim() || !startDate || !endDate || startDate > endDate) return [];
  const queryTokens = meaningfulTokens(`${projectName} ${scope}`);
  const devNames = new Set(members.filter((member) => member.role === "dev").map((member) => normalize(member.name)));
  const ticketsByPerson = new Map<string, Array<{ ticket: Module; project: Project }>>();
  for (const project of projects) for (const ticket of project.modules) {
    const key = normalize(ticket.assignee ?? "");
    if (!key || !devNames.has(key)) continue;
    const items = ticketsByPerson.get(key) ?? []; items.push({ ticket, project }); ticketsByPerson.set(key, items);
  }
  return [...ticketsByPerson.entries()].filter(([, items]) => items.length >= 5).map(([key, items]) => {
    const member = members.find((item) => normalize(item.name) === key)!;
    const relevant = items.map((item) => ({ ...item, matches: tokenMatches(queryTokens, meaningfulTokens(`${item.project.name} ${item.ticket.name} ${item.ticket.moduleGroup ?? ""}`)) })).filter((item) => item.matches > 0);
    const total = items.length, completed = items.filter(({ ticket }) => ticket.status === "completed").length;
    const changes = items.reduce((sum, { ticket }) => sum + (ticket.notes?.split("Status history:")[1]?.match(/Changes Requested/g)?.length ?? 0), 0);
    const reviewed = items.filter(({ ticket }) => /In Review|Testing|Changes Requested/.test(ticket.notes?.split("Status history:")[1] ?? "")).length;
    const relevance = Math.round(Math.min(100, (relevant.reduce((sum, item) => sum + item.matches, 0) / Math.max(1, queryTokens.size)) * 55 + Math.min(35, relevant.length * 5) + Math.min(10, relevant.filter(({ ticket }) => ticket.status === "completed").length * 2)));
    const reliability = Math.round((completed / total) * 100);
    const quality = Math.round(100 * (1 - Math.min(1, (changes + 1) / (reviewed + 10))));
    const overlapping = items.filter(({ ticket }) => ticket.status !== "completed" && rangesOverlap(ticket.plannedStart, ticket.plannedEnd, startDate, endDate));
    const overlappingEffort = overlapping.reduce((sum, { ticket }) => sum + (ticket.effortDays ?? 3), 0);
    const windowDays = Math.max(1, businessDays(startDate, endDate));
    const availability = Math.round(Math.max(0, 100 * (1 - overlappingEffort / Math.max(5, windowDays))));
    const evidence = [...new Set(relevant.sort((a, b) => b.matches - a.matches).map(({ project }) => project.name))].slice(0, 3);
    const confidence = Math.min(1, total / 20);
    const baseFit = relevance * .35 + reliability * .25 + quality * .15 + availability * .25;
    const fit = Math.round(baseFit * (.8 + .2 * confidence));
    return { name: member.name, fit, relevance, reliability, quality, availability, relevantTickets: relevant.length, completed, total, overlappingTickets: overlapping.length, overlappingEffort, evidence: evidence.length ? evidence : ["General delivery record"] };
  }).sort((a, b) => b.fit - a.fit || b.availability - a.availability || b.relevance - a.relevance);
}

function meaningfulTokens(value: string) { return new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? []); }
function tokenMatches(query: Set<string>, candidate: Set<string>) { let matches = 0; for (const token of query) if (candidate.has(token) || [...candidate].some((item) => item.includes(token) || token.includes(item))) matches += 1; return matches; }
function rangesOverlap(ticketStart: string | undefined, ticketEnd: string | undefined, start: string, end: string) { if (!ticketStart && !ticketEnd) return false; const from = ticketStart || ticketEnd!; const to = ticketEnd || ticketStart!; return from <= end && to >= start; }
function businessDays(start: string, end: string) { const from = new Date(`${start}T00:00:00Z`), to = new Date(`${end}T00:00:00Z`); let count = 0; for (const day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) count += 1; return count; }
const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "new", "project", "system", "portal", "based", "have", "into", "this", "that"]);

function ScoreStat({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between sm:block"><span className="text-xs text-muted-foreground">{label}</span><div className="app-mono mt-0.5 text-sm font-semibold">{value}</div></div>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{label}</span>; }

function ScoreInfo() {
  return <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" />How scoring works</button></TooltipTrigger><TooltipContent side="left" className="max-w-sm leading-5">Missing effort/story points are estimated as 3. Complexity is logarithmically scaled against the highest delivered total in the current view. Review efficiency uses recorded Changes Requested cycles with a small confidence prior. Treat this as a delivery indicator, not a standalone appraisal.</TooltipContent></Tooltip></TooltipProvider>;
}

function scoreMembers(rows: MemberStats[]): ScoredMember[] {
  const eligible = rows.filter((row) => row.total >= 10);
  const maxComplexity = Math.max(1, ...eligible.map((row) => row.complexityPoints));
  return eligible.map((row) => {
    const completion = row.total ? (row.completed / row.total) * 100 : 0;
    const completionScore = completion * 0.5;
    const complexityScore = 35 * (Math.log1p(row.complexityPoints) / Math.log1p(maxComplexity));
    const reworkRate = (row.backAndForth + 1) / (row.reviewedTickets + 10);
    const reviewScore = 15 * (1 - Math.min(1, reworkRate));
    return { ...row, rank: 0, score: completionScore + complexityScore + reviewScore, completionScore, complexityScore, reviewScore, completion };
  }).sort((a, b) => b.score - a.score || b.completed - a.completed).map((row, index) => ({ ...row, rank: index + 1 }));
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

function buildMemberStats(projects: Project[], members: TeamMember[], teams: ProjectTeam[], projectFilter: string, statusFilter: string, mode: "all" | "dev" | "pm"): MemberStats[] {
  if (mode === "dev") return buildDevMemberStats(projects, members, teams, projectFilter, statusFilter);
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

function buildDevMemberStats(projects: Project[], members: TeamMember[], teams: ProjectTeam[], projectFilter: string, statusFilter: string): MemberStats[] {
  const rows = new Map<string, MemberStats>();
  const membersById = new Map(members.map((member) => [member.id, member]));
  const membersByName = new Map(members.map((member) => [normalize(member.name), member]));
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const scopedProjects = projects.filter((project) => projectFilter === "all" || project.id === projectFilter);

  const pmsByName = new Map(members.filter((member) => member.role === "pm").map((member) => [normalize(member.name), member]));

  const projectPmId = (project: Project, team?: ProjectTeam) => project.pmId || team?.pmId || pmsByName.get(normalize(project.owner || ""))?.id;
  const teamsForProject = (project: Project) => {
    const selectedTeam = project.teamId ? teamsById.get(project.teamId) : undefined;
    if (selectedTeam) return [selectedTeam];
    const pmId = projectPmId(project);
    return pmId ? teams.filter((team) => team.pmId === pmId) : [];
  };
  const groupForProject = (project: Project, team?: ProjectTeam) => {
    const pmId = projectPmId(project, team);
    const pmName = (pmId ? membersById.get(pmId)?.name : undefined) || project.owner?.trim() || "Unassigned";
    return {
      key: `${pmId || normalize(pmName) || "unassigned"}:${team?.id || "no-team"}`,
      teamName: team?.name || "No team assigned",
      pmName,
    };
  };

  const ensureRow = (member: TeamMember, group: ReturnType<typeof groupForProject>, project: Project) => {
    const rowKey = `${group.key}:${normalize(member.name)}`;
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        ...emptyStats(member.name, member),
        key: normalize(member.name),
        groupKey: group.key,
        teamName: group.teamName,
        pmName: group.pmName,
        scopeProjectIds: [],
      });
    }
    const row = rows.get(rowKey)!;
    if (!row.scopeProjectIds?.includes(project.id)) row.scopeProjectIds?.push(project.id);
    return row;
  };

  for (const project of scopedProjects) {
    const projectTeams = teamsForProject(project);
    if (projectTeams.length) {
      for (const team of projectTeams) {
        const group = groupForProject(project, team);
        for (const memberId of [...team.devIds, ...team.qaIds]) {
          const member = membersById.get(memberId);
          if (member && (member.role === "dev" || member.role === "qa")) ensureRow(member, group, project);
        }
      }
    } else {
      const group = groupForProject(project);
      for (const memberId of project.memberIds) {
        const member = membersById.get(memberId);
        if (member && (member.role === "dev" || member.role === "qa")) ensureRow(member, group, project);
      }
    }

    for (const ticket of project.modules) {
      if (statusFilter !== "all" && (statusFilter === "review_failed" ? ticket.uat !== "failed" : ticket.status !== statusFilter)) continue;
      const assigneeName = ticket.assignee?.trim();
      if (!assigneeName) continue;
      const member = membersByName.get(normalize(assigneeName));
      if (!member || (member.role !== "dev" && member.role !== "qa")) continue;
      const memberTeam = projectTeams.find((team) => [...team.devIds, ...team.qaIds].includes(member.id));
      addTicket(ensureRow(member, groupForProject(project, memberTeam), project), ticket, project);
    }
  }

  return [...rows.values()].sort((a, b) =>
    (a.pmName || "").localeCompare(b.pmName || "") ||
    (a.teamName || "").localeCompare(b.teamName || "") ||
    b.total - a.total ||
    a.name.localeCompare(b.name),
  );
}

function groupDevStats(rows: MemberStats[]): DevStatsGroup[] {
  const groups = new Map<string, DevStatsGroup>();
  for (const row of rows) {
    const key = row.groupKey || "unassigned:no-team";
    const group = groups.get(key) ?? {
      key,
      teamName: row.teamName || "No team assigned",
      pmName: row.pmName || "Unassigned",
      rows: [],
      projectCount: 0,
      tickets: 0,
      completed: 0,
    };
    group.rows.push(row);
    group.tickets += row.total;
    group.completed += row.completed;
    group.projectCount = new Set(group.rows.flatMap((member) => member.scopeProjectIds ?? [])).size;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    (a.pmName === "Unassigned" ? 1 : 0) - (b.pmName === "Unassigned" ? 1 : 0) ||
    a.pmName.localeCompare(b.pmName) ||
    a.teamName.localeCompare(b.teamName),
  );
}

function emptyStats(name: string, member?: TeamMember): MemberStats {
  return { key: normalize(name), name: member?.name ?? name, role: member?.role, title: member?.title, total: 0, completed: 0, inProgress: 0, notStarted: 0, blocked: 0, reviewFailed: 0, effortDays: 0, complexityPoints: 0, pointedTickets: 0, backAndForth: 0, reviewedTickets: 0, projects: [] };
}

function addTicket(row: MemberStats, ticket: Module, project: Project) {
  row.total += 1;
  row[ticket.status === "not_started" ? "notStarted" : ticket.status === "in_progress" ? "inProgress" : ticket.status] += 1;
  if (ticket.uat === "failed") row.reviewFailed += 1;
  row.effortDays += ticket.effortDays ?? 0;
  if (ticket.effortDays != null) row.pointedTickets += 1;
  if (ticket.status === "completed") row.complexityPoints += ticket.effortDays ?? 3;
  const history = ticket.notes?.split("Status history:")[1] ?? "";
  row.backAndForth += history.match(/Changes Requested/g)?.length ?? 0;
  if (/In Review|Testing|Changes Requested/.test(history)) row.reviewedTickets += 1;
  const projectRow = row.projects.find((item) => item.id === project.id);
  if (projectRow) projectRow.tickets += 1;
  else row.projects.push({ id: project.id, name: project.name, tickets: 1 });
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const initials = (value: string) => value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const roleLabel: Record<TeamMember["role"], string> = { pm: "Project manager", dev: "Developer", qa: "QA" };
const scoreTooltipStyle = { borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: "12px" };
