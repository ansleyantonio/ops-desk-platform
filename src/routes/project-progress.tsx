import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  Clock3,
  ArrowLeft,
  Ban,
  FolderKanban,
  ListChecks,
  Search,
  SlidersHorizontal,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listProjects } from "@/lib/project.functions";
import { hasPermission } from "@/lib/auth";
import { enumParam, stringParam, useUrlParam, useUrlSearchUpdater } from "@/hooks/use-url-state";
import {
  phaseLabel,
  projectHealth,
  projectProgress,
  type Health,
  type Project,
  type ProjectPhase,
  type ProjectStatus,
} from "@/lib/tracker-types";

export const Route = createFileRoute("/project-progress")({
  head: () => ({
    meta: [
      { title: "Project progress | OpsDesk" },
      { name: "description", content: "A visual stakeholder view of project delivery progress." },
    ],
  }),
  component: ProjectProgressPage,
});

type ProjectView = {
  project: Project;
  health: Health;
  progress: ReturnType<typeof projectProgress>;
  openRisks: number;
  highRisks: number;
};

const phaseOrder: ProjectPhase[] = ["discovery", "build", "uat", "go_live", "hypercare", "complete", "paused"];

function ProjectProgressPage() {
  const { currentUser } = Route.useRouteContext();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useUrlParam(
    "project",
    stringParam("", "push"),
  );
  const [healthFilter, setHealthFilter] = useUrlParam(
    "health",
    enumParam<Health | "all">(
      ["all", "delayed", "at_risk", "on_track", "completed", "unknown"],
      "all",
    ),
  );
  const [statusFilter, setStatusFilter] = useUrlParam(
    "status",
    enumParam<ProjectStatus | "all">(
      ["all", "planning", "active", "on_hold", "completed"],
      "all",
    ),
  );
  const [projectSearch, setProjectSearch] = useUrlParam("q", stringParam());
  const updateUrl = useUrlSearchUpdater();

  useEffect(() => {
    let cancelled = false;
    void listProjects()
      .then((data) => {
        if (!cancelled) setProjects(data.filter((project) => !project.isDraft));
      })
      .catch((error) => console.error("Failed to load stakeholder project progress", error))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const views = useMemo<ProjectView[]>(
    () =>
      projects.map((project) => ({
        project,
        health: projectHealth(project),
        progress: projectProgress(project),
        openRisks: project.risks.filter((risk) => !risk.resolved).length,
        highRisks: project.risks.filter((risk) => !risk.resolved && risk.severity === "high").length,
      })),
    [projects],
  );

  const active = views.filter((item) => item.project.status === "active");
  const knownActive = active.filter((item) => item.health !== "unknown");
  const attention = views.filter((item) => item.health === "at_risk" || item.health === "delayed");
  const completed = views.filter((item) => item.project.status === "completed" || item.health === "completed");
  const onTrack = knownActive.filter((item) => item.health === "on_track").length;
  const confidence = knownActive.length ? Math.round((onTrack / knownActive.length) * 100) : 0;
  const averageProgress = active.length
    ? Math.round(active.reduce((sum, item) => sum + item.progress.overall, 0) / active.length)
    : 0;
  const openRisks = views.reduce((sum, item) => sum + item.openRisks, 0);
  const highRisks = views.reduce((sum, item) => sum + item.highRisks, 0);
  const phases = phaseOrder
    .map((phase) => ({ phase, count: views.filter((item) => item.project.phase === phase).length }))
    .filter((item) => item.count > 0);
  const portfolio = [...views]
    .filter((item) => healthFilter === "all" || item.health === healthFilter)
    .filter((item) => statusFilter === "all" || item.project.status === statusFilter)
    .filter((item) => item.project.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
    .sort(
      (a, b) =>
        healthRank[a.health] - healthRank[b.health] ||
        b.highRisks - a.highRisks ||
        a.project.name.localeCompare(b.project.name),
    );

  if (!loaded) return <LoadingState />;

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  if (selectedProject) {
    return <ProjectProgressDetail project={selectedProject} canOpenAdmin={hasPermission(currentUser, "projects:manage")} onBack={() => setSelectedProjectId("")} />;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/60 p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
          <div>
            <div className="app-kicker flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> Stakeholder snapshot</div>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Delivery progress, without the operational noise.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A simple, live view of portfolio confidence, progress, milestones, and the projects that need a conversation.</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroStat label="Projects" value={views.length} icon={<FolderKanban />} />
              <HeroStat label="Active" value={active.length} icon={<TrendingUp />} />
              <HeroStat label="Completed" value={completed.length} icon={<CheckCircle2 />} />
              <HeroStat label="Need attention" value={attention.length} icon={<AlertTriangle />} danger={attention.length > 0} />
            </div>
          </div>
          <ProgressDial value={confidence} label="Delivery confidence" detail={`${onTrack} of ${knownActive.length} assessed active projects on track`} />
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border/70 bg-card/55 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 pr-1 text-xs font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" /> Filter projects</div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "delayed", "at_risk", "on_track", "completed", "unknown"] as const).map((value) => {
              const count = value === "all" ? views.length : views.filter((item) => item.health === value).length;
              return <button key={value} type="button" onClick={() => setHealthFilter(value)} className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${healthFilter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/35 text-muted-foreground hover:border-primary/35 hover:text-foreground"}`}>{value === "all" ? "All" : healthLabel[value]} <span className="ml-1 opacity-75">{count}</span></button>;
            })}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "all")} className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-xs outline-none focus:border-primary/50">
              <option value="all">All project statuses</option>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
            </select>
            <label className="flex min-w-52 items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" /></label>
          </div>
        </div>
        {(healthFilter !== "all" || statusFilter !== "all" || projectSearch) && <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground"><span>Showing {portfolio.length} of {views.length} projects</span><button type="button" onClick={() => updateUrl({ health: undefined, status: undefined, q: undefined })} className="font-medium text-primary hover:underline">Clear filters</button></div>}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SignalCard icon={<CircleGauge />} label="Average progress" value={`${averageProgress}%`} detail="Across active projects" tone="primary">
          <ProgressBar value={averageProgress} />
        </SignalCard>
        <SignalCard icon={<ShieldAlert />} label="Open risks" value={openRisks} detail={`${highRisks} high severity`} tone={highRisks ? "danger" : "success"}>
          <div className="flex gap-1.5" aria-hidden="true">{Array.from({ length: 10 }).map((_, index) => <span key={index} className={`h-2 flex-1 rounded-full ${index < Math.min(10, highRisks) ? "bg-destructive" : "bg-muted"}`} />)}</div>
        </SignalCard>
        <SignalCard icon={<CalendarDays />} label="Portfolio movement" value={`${completed.length} delivered`} detail={`${views.length - completed.length} still moving`} tone="success">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Based on live ticketing data</div>
        </SignalCard>
      </section>

      <section className="rounded-[1.75rem] border border-border/70 bg-card/55 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><div className="app-kicker">Delivery journey</div><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Where the portfolio sits</h2></div>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">Each block represents the number of projects currently in that stage.</p>
        </div>
        <div className="mt-6 grid gap-2 md:grid-flow-col md:auto-cols-fr">
          {phases.map((item, index) => (
            <div key={item.phase} className="relative rounded-2xl border border-border/65 bg-background/35 p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{phaseLabel(item.phase)}</span><span className="text-2xl font-semibold tracking-[-0.04em]">{item.count}</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(12, (item.count / Math.max(...phases.map((phase) => phase.count))) * 100)}%` }} /></div>
              {index < phases.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground md:block" />}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="app-kicker">Full portfolio</div><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">All projects at a glance</h2></div><span className="text-xs text-muted-foreground">{portfolio.length} projects · highest attention items shown first</span></div>
        {portfolio.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{portfolio.map((item) => <ProjectSpotlight key={item.project.id} item={item} onOpen={() => setSelectedProjectId(item.project.id)} />)}</div> : <div className="rounded-[1.5rem] border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No projects to show.</div>}
      </section>
    </div>
  );
}

function ProgressDial({ value, label, detail }: { value: number; label: string; detail: string }) {
  return <div className="flex flex-col items-center justify-center"><div className="relative grid h-52 w-52 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${value * 3.6}deg, hsl(var(--muted)) 0deg)` }}><div className="grid h-[82%] w-[82%] place-items-center rounded-full bg-card text-center shadow-inner"><div><div className="text-5xl font-semibold tracking-[-0.06em]">{value}%</div><div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div></div></div></div><p className="mt-3 max-w-56 text-center text-xs leading-5 text-muted-foreground">{detail}</p></div>;
}

function HeroStat({ label, value, icon, danger = false }: { label: string; value: number; icon: React.ReactElement<{ className?: string }>; danger?: boolean }) {
  return <div className="rounded-2xl border border-border/60 bg-background/30 p-3"><div className={`flex items-center gap-2 text-xs ${danger ? "text-destructive" : "text-muted-foreground"}`}>{icon}<span>{label}</span></div><div className={`mt-2 text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>{value}</div></div>;
}

function SignalCard({ icon, label, value, detail, tone, children }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone: "primary" | "success" | "danger"; children: React.ReactNode }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-primary";
  return <div className="rounded-[1.5rem] border border-border/70 bg-card/55 p-5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={toneClass}>{icon}</span></div><div className={`mt-3 text-3xl font-semibold tracking-[-0.045em] ${toneClass}`}>{value}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p><div className="mt-5">{children}</div></div>;
}

function ProgressBar({ value }: { value: number }) { return <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${value}%` }} /></div>; }

function ProjectSpotlight({ item, onOpen }: { item: ProjectView; onOpen: () => void }) {
  const target = item.project.targetDate ? new Date(item.project.targetDate) : null;
  const stage = item.project.stages?.find((entry) => entry.id === item.project.currentStageId)?.label ?? phaseLabel(item.project.phase);
  return <button type="button" onClick={onOpen} className="group flex min-h-64 flex-col rounded-[1.5rem] border border-border/70 bg-card/55 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-card)]"><div className="flex w-full items-start justify-between gap-3"><Badge variant="outline" className={healthTone[item.health]}>{healthLabel[item.health]}</Badge><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><h3 className="mt-4 line-clamp-2 text-lg font-semibold tracking-[-0.025em]">{item.project.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{stage}</p><div className="mt-auto w-full pt-6"><div className="flex items-end justify-between"><div><div className="text-3xl font-semibold tracking-[-0.05em]">{item.progress.overall}%</div><div className="text-[11px] text-muted-foreground">overall progress</div></div><div className="text-right text-xs"><div className={item.openRisks ? "font-semibold text-destructive" : "text-success"}>{item.openRisks} open risk{item.openRisks === 1 ? "" : "s"}</div><div className="mt-1 text-muted-foreground">{target && !Number.isNaN(target.getTime()) ? `Target ${target.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "Target not set"}</div></div></div><div className="mt-3"><ProgressBar value={item.progress.overall} /></div></div></button>;
}

type ActivityPeriod = "today" | "yesterday" | "last_week";

type ResourceActivity = {
  name: string;
  tickets: Project["modules"];
  completed: number;
  inProgress: number;
  blocked: number;
  effort: number;
};

function ProjectProgressDetail({ project, canOpenAdmin, onBack }: { project: Project; canOpenAdmin: boolean; onBack: () => void }) {
  const [period, setPeriod] = useUrlParam(
    "period",
    enumParam<ActivityPeriod>(["today", "yesterday", "last_week"], "today"),
  );
  const [search, setSearch] = useUrlParam("resource", stringParam());
  const progress = projectProgress(project);
  const health = projectHealth(project);
  const periodTickets = useMemo(
    () => project.modules.filter((ticket) => ticketFallsInPeriod(ticket.notes, period)),
    [period, project.modules],
  );
  const resources = useMemo(() => {
    const grouped = new Map<string, Project["modules"]>();
    for (const ticket of periodTickets) {
      const name = ticket.assignee?.trim() || "Unassigned";
      grouped.set(name, [...(grouped.get(name) ?? []), ticket]);
    }
    return Array.from(grouped, ([name, tickets]): ResourceActivity => ({
      name,
      tickets,
      completed: tickets.filter((ticket) => ticket.status === "completed").length,
      inProgress: tickets.filter((ticket) => ticket.status === "in_progress").length,
      blocked: tickets.filter((ticket) => ticket.status === "blocked").length,
      effort: tickets.reduce((sum, ticket) => sum + (ticket.effortDays ?? 0), 0),
    }))
      .filter((resource) => resource.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.tickets.length - a.tickets.length || a.name.localeCompare(b.name));
  }, [periodTickets, search]);

  const activeResources = resources.filter((resource) => resource.name !== "Unassigned").length;
  const completed = periodTickets.filter((ticket) => ticket.status === "completed").length;
  const blocked = periodTickets.filter((ticket) => ticket.status === "blocked").length;
  const statusData = [
    { name: "Completed", value: completed, color: "hsl(var(--success))" },
    { name: "In progress", value: periodTickets.filter((ticket) => ticket.status === "in_progress").length, color: "hsl(var(--primary))" },
    { name: "Not started", value: periodTickets.filter((ticket) => ticket.status === "not_started").length, color: "hsl(var(--muted-foreground))" },
    { name: "Blocked", value: blocked, color: "hsl(var(--destructive))" },
  ].filter((item) => item.value > 0);
  const trendData = activityTrend(project.modules);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <section className="rounded-[1.75rem] border border-border/70 bg-card/60 p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <button type="button" onClick={onBack} className="mb-5 flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to project progress
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={healthTone[health]}>{healthLabel[health]}</Badge>
              <span className="text-xs text-muted-foreground">{phaseLabel(project.phase)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{project.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Resource delivery activity, separated from the project administration record.</p>
          </div>
          <div className="min-w-56 rounded-2xl border border-border/60 bg-background/35 p-4">
            <div className="flex items-end justify-between"><span className="text-xs text-muted-foreground">Overall delivery</span><span className="text-2xl font-semibold">{progress.overall}%</span></div>
            <div className="mt-3"><ProgressBar value={progress.overall} /></div>
            {canOpenAdmin && <Link to="/projects/$projectId" params={{ projectId: project.id }} className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">Open project admin record <ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-border/70 bg-card/50 p-3">
        <div className="flex rounded-xl bg-muted/55 p-1">
          {(["today", "yesterday", "last_week"] as ActivityPeriod[]).map((value) => (
            <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${period === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {periodLabel[value]}
            </button>
          ))}
        </div>
        <label className="flex min-w-56 items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a resource" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailStat icon={<UserRound />} label="Active resources" value={activeResources} />
        <DetailStat icon={<ListChecks />} label="Tickets touched" value={periodTickets.length} />
        <DetailStat icon={<CheckCircle2 />} label="Completed" value={completed} success />
        <DetailStat icon={<Ban />} label="Blocked" value={blocked} danger={blocked > 0} />
      </section>

      <ProjectTimeline project={project} />

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><div className="app-kicker">Delivery picture</div><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Resource contribution {period === "today" ? "today" : period === "yesterday" ? "yesterday" : "last week"}</h2></div>
          <span className="text-xs text-muted-foreground">Based on ticket update timestamps</span>
        </div>
        {resources.length ? (
          <div className="grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
            <ChartPanel title="Work moved by resource" detail="Ticket volume and outcome by person">
              <div style={{ height: Math.max(280, resources.length * 42) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resources} layout="vertical" margin={{ left: 8, right: 20, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / .35)" }} />
                    <Bar dataKey="completed" name="Completed" stackId="work" fill="hsl(var(--success))" radius={[4, 0, 0, 4]} />
                    <Bar dataKey="inProgress" name="In progress" stackId="work" fill="hsl(var(--primary))" />
                    <Bar dataKey="blocked" name="Blocked" stackId="work" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartLegend />
            </ChartPanel>
            <ChartPanel title="Outcome mix" detail={`${periodTickets.length} tickets touched`}>
              <div className="relative h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={98} paddingAngle={3}>{statusData.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="text-3xl font-semibold">{periodTickets.length}</div><div className="text-[11px] text-muted-foreground">tickets</div></div></div>
              </div>
              <div className="grid grid-cols-2 gap-2">{statusData.map((item) => <div key={item.name} className="flex items-center justify-between rounded-lg bg-muted/35 px-3 py-2 text-xs"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span><strong>{item.value}</strong></div>)}</div>
            </ChartPanel>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-border p-12 text-center"><Clock3 className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No resource activity in this period</p><p className="mt-1 text-xs text-muted-foreground">Try another time window or clear the resource search.</p></div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <ChartPanel title="Seven-day delivery rhythm" detail="Daily ticket updates across the project">
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ left: -18, right: 12, top: 16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} /><XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="updates" name="Ticket updates" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--background))", strokeWidth: 2 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div>
        </ChartPanel>
        <ChartPanel title="Resource share" detail="How activity is distributed">
          <div className="space-y-4 pt-3">{resources.slice(0, 8).map((resource) => { const share = periodTickets.length ? Math.round((resource.tickets.length / periodTickets.length) * 100) : 0; return <div key={resource.name}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="truncate font-medium">{resource.name}</span><span className="text-muted-foreground">{share}% · {resource.tickets.length}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/80" style={{ width: `${share}%` }} /></div></div>; })}</div>
        </ChartPanel>
      </section>
    </div>
  );
}

function ProjectTimeline({ project }: { project: Project }) {
  const stages = project.stages ?? [];
  const matchedCurrentIndex = stages.findIndex((stage) => stage.id === project.currentStageId);
  const currentIndex = matchedCurrentIndex >= 0 ? matchedCurrentIndex : project.status === "completed" ? stages.length : 0;
  const datedStages = stages.filter((stage) => stage.startDate || stage.endDate).length;

  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-card/55 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="app-kicker">Ticketing overview timeline</div><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Delivery milestones</h2></div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Start <strong className="ml-1 font-medium text-foreground">{formatTimelineDate(project.startDate)}</strong></span>
          <span>Target <strong className="ml-1 font-medium text-foreground">{formatTimelineDate(project.targetDate)}</strong></span>
        </div>
      </div>
      {stages.length ? (
        <div className="mt-7 overflow-x-auto pb-2">
          <div className={`flex items-start ${stages.length <= 3 ? "w-full" : "min-w-max"}`}>
            {stages.map((stage, index) => {
              const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
              return (
                <div key={stage.id} className={`relative pr-4 last:pr-0 ${stages.length <= 3 ? "min-w-0 flex-1" : "w-44 shrink-0"}`}>
                  <div className="relative flex items-center">
                    <span className={`relative z-10 grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-semibold ${state === "complete" ? "border-success bg-success text-white" : state === "current" ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15" : "border-border bg-background text-muted-foreground"}`}>{state === "complete" ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}</span>
                    {index < stages.length - 1 && <span className={`absolute left-7 h-0.5 w-[calc(100%-1.75rem)] ${index < currentIndex ? "bg-success" : "bg-border"}`} />}
                  </div>
                  <div className="mt-3 pr-2"><p className={`text-xs font-semibold leading-4 ${state === "current" ? "text-primary" : ""}`}>{stage.label}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{stage.startDate || stage.endDate ? `${formatTimelineDate(stage.startDate)} – ${formatTimelineDate(stage.endDate)}` : state === "current" ? "Current stage" : "Dates not set"}</p>{state === "current" && <Badge className="mt-2 text-[9px]">Now</Badge>}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">No milestone stages are available from the ticketing overview.</div>
      )}
      {stages.length > 0 && datedStages === 0 && <p className="mt-3 text-[11px] text-muted-foreground">Stage order is synced from the ticketing overview; milestone dates have not been set there yet.</p>}
    </section>
  );
}

function formatTimelineDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function DetailStat({ icon, label, value, success = false, danger = false }: { icon: React.ReactNode; label: string; value: number; success?: boolean; danger?: boolean }) {
  return <div className="rounded-[1.35rem] border border-border/70 bg-card/50 p-4"><div className={`flex items-center gap-2 text-xs ${danger ? "text-destructive" : success ? "text-success" : "text-muted-foreground"}`}>{icon}{label}</div><div className={`mt-3 text-3xl font-semibold tracking-[-0.04em] ${danger ? "text-destructive" : ""}`}>{value}</div></div>;
}

function ChartPanel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <div className="rounded-[1.5rem] border border-border/70 bg-card/55 p-5"><div><h3 className="font-semibold tracking-[-0.02em]">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="mt-4">{children}</div></div>;
}

function ChartLegend() {
  return <div className="mt-3 flex flex-wrap justify-center gap-5 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-success" />Completed</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-primary" />In progress</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-destructive" />Blocked</span></div>;
}

function activityTrend(tickets: Project["modules"]) {
  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const offset = 6 - index;
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const key = date.toISOString().slice(0, 10);
    return { day: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), updates: tickets.filter((ticket) => { const value = noteLine(ticket.notes, "Updated") || noteLine(ticket.notes, "Created"); return value ? new Date(value).toISOString().slice(0, 10) === key : false; }).length };
  });
}

function ticketFallsInPeriod(notes: string | undefined, period: ActivityPeriod) {
  const value = noteLine(notes, "Updated") || noteLine(notes, "Created");
  if (!value) return false;
  const updated = new Date(value);
  if (Number.isNaN(updated.getTime())) return false;
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ticketDay = Date.UTC(updated.getUTCFullYear(), updated.getUTCMonth(), updated.getUTCDate());
  const ageDays = Math.floor((todayStart - ticketDay) / 86400000);
  if (period === "today") return ageDays === 0;
  if (period === "yesterday") return ageDays === 1;
  return ageDays >= 2 && ageDays <= 8;
}

function noteLine(notes: string | undefined, label: string) {
  return String(notes ?? "").split(/\r?\n/).find((line) => line.startsWith(`${label}: `))?.slice(label.length + 2).trim();
}

const periodLabel: Record<ActivityPeriod, string> = { today: "Today", yesterday: "Yesterday", last_week: "Last 7 days" };
const tooltipStyle = { borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: "12px" };

function LoadingState() { return <div className="mx-auto max-w-[1440px] space-y-5"><Skeleton className="h-80 rounded-[2rem]" /><div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-[1.5rem]" />)}</div><Skeleton className="h-48 rounded-[1.75rem]" /></div>; }

const healthRank: Record<Health, number> = { delayed: 0, at_risk: 1, unknown: 2, on_track: 3, completed: 4 };
const healthLabel: Record<Health, string> = { delayed: "Delayed", at_risk: "At risk", unknown: "Needs data", on_track: "On track", completed: "Completed" };
const healthTone: Record<Health, string> = { delayed: "border-destructive/35 text-destructive", at_risk: "border-warning/40 text-warning", unknown: "text-muted-foreground", on_track: "border-success/35 text-success", completed: "border-primary/35 text-primary" };
