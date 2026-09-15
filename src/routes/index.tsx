import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  TimerReset,
  UserRound,
} from "lucide-react";
import {
  projectHealth,
  projectProgress,
  ticketFlowStats,
  remainingEffortDays,
  phaseLabel,
  loadLegacyProjects,
  type Health,
  type Project,
  type ProjectTeam,
  type ProjectPhase,
  type TeamMember,
} from "@/lib/tracker-types";
import {
  deleteProjectTeam,
  deleteTeamMember,
  listProjects,
  listTeamData,
  saveProject,
  saveProjectTeam,
  saveTeamMember,
} from "@/lib/project.functions";
import { ProjectDialog } from "@/components/tracker/ProjectDialog";
import { TeamsPanel } from "@/components/tracker/TeamsPanel";
import { useAppShell } from "@/components/layout/app-shell-context";
import { booleanParam, stringParam, useUrlParam } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

const DATABASE_NAME = "project-pal";
const DATABASE_HOST = "127.0.0.1";
const DATABASE_PORT = 3306;

type DeleteTarget =
  | { type: "member"; id: string; name: string }
  | { type: "team"; id: string; name: string };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpsDesk" },
      {
        name: "description",
        content: "Track projects, blockers, and delivery progress.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { density, setShellActions, setShellMetrics } = useAppShell();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [dialogOpen, setDialogOpen] = useUrlParam("newProject", booleanParam());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [query, setQuery] = useUrlParam("q", stringParam());
  const [loaded, setLoaded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [remote, teamData] = await Promise.all([listProjects(), listTeamData()]);
        if (cancelled) return;

        setMembers(teamData.members);
        setTeams(teamData.teams);

        if (remote.length > 0) {
          setProjects(remote);
        } else {
          const legacy = loadLegacyProjects();
          setProjects(legacy);
          if (legacy.length > 0) {
            await Promise.all(legacy.map((project) => saveProject({ data: project })));
          }
        }
      } catch (error) {
        console.error("Failed to load projects", error);
        if (!cancelled) {
          setProjects(loadLegacyProjects());
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setShellActions({
      openNewProject: () => {
        setDialogOpen(true);
      },
      focusSearch: () => searchInputRef.current?.focus(),
    });

    return () => setShellActions({ openNewProject: null, focusSearch: null });
  }, [setDialogOpen, setShellActions]);

  const visibleProjects = useMemo(() => projects.filter((project) => !project.isDraft), [projects]);

  const stats = useMemo(() => buildStats(visibleProjects), [visibleProjects]);

  const sidebarProjects = useMemo(
    () =>
      visibleProjects.slice(0, 4).map((project) => ({
        id: project.id,
        name: project.name,
        count: project.modules.length,
        tone: shellToneFromHealth(projectHealth(project)),
      })),
    [visibleProjects],
  );

  useEffect(() => {
    setShellMetrics({
      totalProjects: stats.total,
      inProgress: stats.inProgress,
      overdue: stats.overdue,
      completed: stats.completed,
      openRisks: stats.openRisks,
      projects: sidebarProjects,
    });
  }, [setShellMetrics, sidebarProjects, stats]);

  useEffect(() => {
    return () =>
      setShellMetrics({
        totalProjects: 0,
        inProgress: 0,
        overdue: 0,
        completed: 0,
        openRisks: 0,
        projects: [],
      });
  }, [setShellMetrics]);

  const filtered = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return visibleProjects
      .filter((p) => {
        const assignedNames = p.memberIds
          .map((id) => members.find((member) => member.id === id)?.name.toLowerCase())
          .filter(Boolean);
        return (
          p.name.toLowerCase().includes(q) ||
          p.owner.toLowerCase().includes(q) ||
          assignedNames.some((name) => name?.includes(q))
        );
      })
      .sort((a, b) => {
        const aHasTickets = a.modules.length > 0;
        const bHasTickets = b.modules.length > 0;
        if (aHasTickets !== bHasTickets) return aHasTickets ? -1 : 1;

        const aCompleted = a.status === "completed" || a.phase === "complete";
        const bCompleted = b.status === "completed" || b.phase === "complete";
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

        const aTime = a.targetDate ? new Date(a.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.targetDate ? new Date(b.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [deferredQuery, members, visibleProjects]);

  const activityItems = useMemo(
    () =>
      visibleProjects
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((project) => ({
          id: project.id,
          actor: project.owner?.trim() || "Team",
          text:
            projectProgress(project).overall === 100
              ? `closed ${project.name}`
              : `updated ${project.name}`,
          time: relativeAge(project.createdAt),
          health: projectHealth(project),
        })),
    [visibleProjects],
  );

  const upsert = (p: Project) => {
    setProjects((arr) => {
      const i = arr.findIndex((x) => x.id === p.id);
      if (i === -1) return [p, ...arr];
      const next = [...arr];
      next[i] = p;
      return next;
    });
    void saveProject({ data: p }).catch((error) => {
      console.error("Failed to save project", error);
    });
  };

  const upsertMember = (member: TeamMember) => {
    setMembers((arr) => [member, ...arr.filter((item) => item.id !== member.id)]);
    void saveTeamMember({ data: member }).catch((error) => {
      console.error("Failed to save team member", error);
    });
  };

  const removeMember = (id: string) => {
    setMembers((arr) =>
      arr
        .filter((member) => member.id !== id)
        .map((member) => (member.managerId === id ? { ...member, managerId: undefined } : member)),
    );
    setTeams((arr) =>
      arr.map((team) => ({
        ...team,
        pmId: team.pmId === id ? undefined : team.pmId,
        devIds: team.devIds.filter((memberId) => memberId !== id),
        qaIds: team.qaIds.filter((memberId) => memberId !== id),
      })),
    );
    setProjects((arr) =>
      arr.map((project) => (project.pmId === id ? { ...project, pmId: undefined } : project)),
    );
    void deleteTeamMember({ data: { id } }).catch((error) => {
      console.error("Failed to delete team member", error);
    });
  };

  const upsertTeam = (team: ProjectTeam) => {
    setTeams((arr) => [team, ...arr.filter((item) => item.id !== team.id)]);
    void saveProjectTeam({ data: team }).catch((error) => {
      console.error("Failed to save project team", error);
    });
  };

  const removeTeam = (id: string) => {
    setTeams((arr) => arr.filter((team) => team.id !== id));
    setProjects((arr) =>
      arr.map((project) => (project.teamId === id ? { ...project, teamId: undefined } : project)),
    );
    void deleteProjectTeam({ data: { id } }).catch((error) => {
      console.error("Failed to delete project team", error);
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "member") removeMember(deleteTarget.id);
    if (deleteTarget.type === "team") removeTeam(deleteTarget.id);
    setDeleteTarget(null);
  };

  const openProjectDialog = () => {
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1420px] space-y-5">
      <section
        id="overview"
        className="app-workspace overflow-hidden rounded-[2.2rem]"
        aria-label="Overview"
      >
        <div className="grid xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="relative px-6 py-7 sm:px-7 sm:py-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-80"
              style={{ background: "var(--gradient-hero)" }}
            />
            <div className="relative">
              <div className="app-kicker">Project command center</div>
              <h1 className="mt-4 max-w-[12ch] text-[2.6rem] font-semibold tracking-[-0.08em] text-foreground sm:text-[3.8rem] sm:leading-[0.94]">
                One calm workspace for triage, delivery, and follow-through
              </h1>
              <p className="mt-4 max-w-[66ch] text-sm leading-7 text-muted-foreground sm:text-[0.97rem]">
                Designed for fast scanning, sub-100ms updates, and real operational use. No page
                reloads, no cluttered islands, and no hiding important signals behind extra layers.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="app-chip">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Optimistic updates
                </span>
                <span className="app-chip">
                  <span className="h-2 w-2 rounded-full bg-info" />
                  Command palette everywhere
                </span>
                <span className="app-chip">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  Comfortable and compact density
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/80 px-6 py-6 xl:border-l xl:border-t-0">
            <div className="app-kicker">Workspace status</div>
            <div className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
              {formatToday()}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Local data store:
              <span className="app-mono ml-1 font-medium text-foreground">{DATABASE_NAME}</span>
              <span className="app-mono ml-1 text-muted-foreground">
                {DATABASE_HOST}:{DATABASE_PORT}
              </span>
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <div className="app-kicker">Open projects</div>
                <div className="mt-2 app-mono text-3xl font-semibold tracking-[-0.05em] text-foreground">
                  {stats.openProjects}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {stats.dueSoon} due soon, {stats.overdue} overdue
                </div>
              </div>
              <div className="app-section-divider pt-4">
                <div className="app-kicker">Review health</div>
                <div className="mt-2 app-mono text-3xl font-semibold tracking-[-0.05em] text-foreground">
                  {stats.uatPassPct}%
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {stats.reviewFailedTickets} failed, {stats.reviewInProgressTickets} in progress
                </div>
              </div>
            </div>

            <Button onClick={openProjectDialog} className="mt-6 h-11 w-full">
              <Plus className="h-4 w-4" />
              Add project
            </Button>
          </div>
        </div>

        <div className="app-section-divider grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            className="border-0 bg-transparent px-3 py-2 shadow-none"
            label="Projects tracked"
            value={stats.total}
            detail={`${stats.openProjects} active projects`}
            icon={<FolderKanban className="h-4 w-4" />}
          />
          <MetricCard
            className="border-0 bg-transparent px-3 py-2 shadow-none"
            label="Tasks complete"
            value={`${stats.moduleCompletePct}%`}
            detail={`${stats.completedModules}/${stats.totalModules} tickets`}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <MetricCard
            className="border-0 bg-transparent px-3 py-2 shadow-none"
            label="Review sign-offs"
            value={`${stats.uatPassPct}%`}
            detail={`${stats.uatPassedModules}/${stats.totalModules} reviewed`}
            icon={<Clock3 className="h-4 w-4" />}
          />
          <MetricCard
            className="border-0 bg-transparent px-3 py-2 shadow-none"
            label="Implementation stage"
            value={stats.phaseSummary}
            detail={stats.dueSoon ? `${stats.dueSoon} due soon` : "No near-term deadlines"}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone={stats.overdue ? "warning" : "success"}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="app-workspace overflow-hidden rounded-[2.1rem]">
          <section id="board" className="overflow-hidden" aria-labelledby="queue-heading">
            <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="queue-heading" className="text-sm font-semibold text-foreground">
                  Project queue
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
                  Sorted by phase, target date, and ticket/review status.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects, owners..."
                    className="h-9 w-full pl-8 text-xs sm:w-64"
                    aria-label="Filter projects"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => setQuery("")}
                >
                  Reset view
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {!loaded ? (
              <WorkQueueSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState hasProjects={visibleProjects.length > 0} onCreate={openProjectDialog} />
            ) : (
              <div className="divide-y divide-border">
                <WorkQueueHeader />
                {filtered.map((project, index) => (
                  <WorkQueueRow
                    key={project.id}
                    index={index}
                    project={project}
                    members={members}
                    onOpen={() =>
                      void navigate({
                        to: "/projects/$projectId",
                        params: { projectId: project.id },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section
            id="portfolio-stats"
            className="app-section-divider px-5 py-5"
            aria-labelledby="portfolio-stats-heading"
          >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="portfolio-stats-heading" className="text-sm font-semibold text-foreground">
                  Portfolio ticket stats
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Compare progress, completion, blocked tickets, review failures, and moved-back
                  signals across every project.
                </p>
              </div>
              <Badge variant="outline" className="w-fit bg-muted/60">
                {stats.projectsWithHistory}/{stats.total} with status history
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <PortfolioStatCard
                label="Avg progress"
                value={`${stats.portfolioHealth}%`}
                detail={`${stats.completedModules}/${stats.totalModules} tickets complete`}
              />
              <PortfolioStatCard
                label="Open tickets"
                value={stats.openTickets}
                detail={`${stats.blockedTickets} blocked across portfolio`}
                tone={stats.blockedTickets > 0 ? "warning" : "default"}
              />
              <PortfolioStatCard
                label="Review failures"
                value={stats.reviewFailedTickets}
                detail={`${stats.reviewInProgressTickets} in review/testing`}
                tone={stats.reviewFailedTickets > 0 ? "danger" : "default"}
              />
              <PortfolioStatCard
                label="Moved back"
                value={stats.movedBackTickets}
                detail={
                  stats.projectsWithHistory > 0
                    ? "Review/testing to dev events"
                    : "Needs synced status history"
                }
                tone={stats.movedBackTickets > 0 ? "danger" : "default"}
              />
            </div>
            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-border/70">
              <PortfolioStatsTable
                projects={visibleProjects}
                onOpenProject={(project) =>
                  void navigate({
                    to: "/projects/$projectId",
                    params: { projectId: project.id },
                  })
                }
              />
            </div>
          </section>

          <div className="app-section-divider grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <section id="week" className="px-5 py-5" aria-labelledby="week-heading">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="week-heading" className="text-sm font-semibold text-foreground">
                    Implementation cadence
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {Math.min(stats.remainingEffort, 40)}d planned · {stats.remainingEffort}d open
                  </p>
                </div>
                <span className="app-mono text-xs text-muted-foreground">
                  {stats.portfolioHealth}% / 100%
                </span>
              </div>
              <div className="mt-8 grid h-20 grid-cols-5 items-end gap-2" aria-hidden="true">
                {weekBars(stats).map((height, index) => (
                  <div key={weekDays[index]} className="space-y-2">
                    <div className="flex h-16 items-end rounded-md bg-muted/60 px-1">
                      <div
                        className="w-full rounded-full bg-primary/75 transition-[height] duration-500"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <div className="text-center text-[10px] font-medium text-muted-foreground">
                      {weekDays[index]}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-border/80 px-5 py-5 lg:border-l lg:border-t-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Phase snapshot</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Mix of discovery, build, review, go-live, and paused workstreams.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {phaseOrder.map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    onClick={() => setQuery(phaseLabel(phase))}
                    className="flex items-center justify-between rounded-[1.2rem] px-3 py-3 text-left transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", phaseTone[phase])} />
                      <span className="text-sm font-medium text-foreground">
                        {phaseLabel(phase)}
                      </span>
                    </div>
                    <span className="app-mono text-xs text-muted-foreground">
                      {stats.phaseCounts[phase]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="app-workspace overflow-hidden rounded-[2.1rem] xl:sticky xl:top-[5.6rem] xl:self-start">
          <section id="health" className="px-5 py-5" aria-labelledby="health-heading">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="health-heading" className="text-sm font-semibold text-foreground">
                  Blocker signal
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stats.dueSoon} due soon · {stats.overdue} overdue
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[10px] font-semibold",
                  stats.overdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-success/10 text-success",
                )}
              >
                {stats.overdue ? "Needs review" : "Stable"}
              </span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {stats.portfolioHealth}
              </div>
              <div className="pb-1 text-sm text-muted-foreground">/ 100 score</div>
            </div>
            <SegmentedHealthBar counts={stats.healthCounts} total={stats.total} />
            <div className="mt-4 space-y-3">
              <HealthLegend label="On track" value={stats.healthCounts.on_track} tone="success" />
              <HealthLegend label="At risk" value={stats.healthCounts.at_risk} tone="warning" />
              <HealthLegend label="Delayed" value={stats.healthCounts.delayed} tone="destructive" />
              <HealthLegend label="Completed" value={stats.healthCounts.completed} tone="info" />
            </div>
          </section>

          <div className="app-section-divider">
            <TeamsPanel
              members={members}
              teams={teams}
              onSaveMember={upsertMember}
              onDeleteMember={(id) => {
                const member = members.find((item) => item.id === id);
                setDeleteTarget({ type: "member", id, name: member?.name ?? "this team member" });
              }}
              onSaveTeam={upsertTeam}
              onDeleteTeam={(id) => {
                const team = teams.find((item) => item.id === id);
                setDeleteTarget({ type: "team", id, name: team?.name ?? "this project team" });
              }}
              embedded
            />
          </div>

          <section
            id="activity"
            className="app-section-divider px-5 py-5"
            aria-labelledby="activity-heading"
          >
            <h2 id="activity-heading" className="text-sm font-semibold text-foreground">
              Change log
            </h2>
            {activityItems.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListChecks className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-foreground">No changes yet</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Project updates will show when PMs refresh ticket, review, and phase status.
                </p>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-border">
                {activityItems.map((item) => (
                  <div key={item.id} className="flex gap-3 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                        activityDot[item.health],
                      )}
                    >
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs leading-5 text-muted-foreground">
                        <span className="font-semibold text-foreground">{item.actor}</span>{" "}
                        {item.text}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={upsert}
        initial={null}
        members={members}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function buildStats(projects: Project[]) {
  const total = projects.length;
  const healthCounts: Record<Health, number> = {
    on_track: 0,
    at_risk: 0,
    delayed: 0,
    completed: 0,
    unknown: 0,
  };

  let completed = 0;
  let inProgress = 0;
  let overdue = 0;
  let dueSoon = 0;
  let openRisks = 0;
  let totalModules = 0;
  let completedModules = 0;
  let uatPassedModules = 0;
  let openTickets = 0;
  let blockedTickets = 0;
  let reviewFailedTickets = 0;
  let reviewInProgressTickets = 0;
  let movedBackTickets = 0;
  let projectsWithHistory = 0;
  let remainingEffort = 0;
  let progressTotal = 0;
  const phaseCounts: Record<ProjectPhase, number> = {
    discovery: 0,
    build: 0,
    uat: 0,
    go_live: 0,
    hypercare: 0,
    complete: 0,
    paused: 0,
  };
  const now = Date.now();
  const weekFromNow = now + 7 * 86400000;

  for (const project of projects) {
    const progress = projectProgress(project);
    const ticketStats = ticketFlowStats(project);
    const health = projectHealth(project);
    healthCounts[health] += 1;
    progressTotal += progress.overall;
    totalModules += project.modules.length;
    completedModules += project.modules.filter((module) => module.status === "completed").length;
    uatPassedModules += project.modules.filter((module) => module.uat === "passed").length;
    openTickets += ticketStats.open;
    blockedTickets += ticketStats.blocked;
    reviewFailedTickets += ticketStats.reviewFailed;
    reviewInProgressTickets += ticketStats.reviewInProgress;
    movedBackTickets += ticketStats.movedBackCount;
    if (ticketStats.hasStatusHistory) projectsWithHistory += 1;
    openRisks += project.risks.filter((risk) => !risk.resolved).length;
    phaseCounts[project.phase] += 1;

    if (progress.overall === 100 || project.status === "completed") {
      completed += 1;
      continue;
    }

    inProgress += 1;
    remainingEffort += remainingEffortDays(project);

    if (project.targetDate) {
      const target = new Date(project.targetDate).getTime();
      if (target < now) overdue += 1;
      if (target >= now && target <= weekFromNow) dueSoon += 1;
    }
  }

  return {
    total,
    completed,
    inProgress,
    openProjects: total - completed,
    overdue,
    dueSoon,
    openRisks,
    totalModules,
    completedModules,
    uatPassedModules,
    openTickets,
    blockedTickets,
    reviewFailedTickets,
    reviewInProgressTickets,
    movedBackTickets,
    projectsWithHistory,
    remainingEffort,
    moduleCompletePct: totalModules ? Math.round((completedModules / totalModules) * 100) : 0,
    uatPassPct: totalModules ? Math.round((uatPassedModules / totalModules) * 100) : 0,
    portfolioHealth: total ? Math.round(progressTotal / total) : 0,
    healthCounts,
    phaseCounts,
    phaseSummary: phaseSummary(phaseCounts),
  };
}

function DeleteConfirmDialog({
  onCancel,
  onConfirm,
  target,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  target: DeleteTarget | null;
}) {
  const copy = target ? deleteCopy(target) : null;

  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="app-panel-strong rounded-[1.8rem] border-border/80">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title ?? "Confirm delete"}</AlertDialogTitle>
          <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {target && (
          <div className="app-panel-muted rounded-[1.25rem] px-3 py-3">
            <div className="app-kicker">{copy?.label}</div>
            <div className="mt-1 truncate text-sm font-medium text-foreground">{target.name}</div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PortfolioStatCard({
  detail,
  label,
  tone = "default",
  value,
}: {
  detail: string;
  label: string;
  tone?: "default" | "warning" | "danger";
  value: number | string;
}) {
  return (
    <div className="rounded-[1rem] px-1 py-1">
      <div className="app-kicker">{label}</div>
      <div
        className={cn(
          "app-mono mt-2 text-[1.75rem] font-semibold tracking-[-0.05em]",
          tone === "danger"
            ? "text-destructive"
            : tone === "warning"
              ? "text-warning-foreground"
              : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

function PortfolioStatsTable({
  onOpenProject,
  projects,
}: {
  onOpenProject: (project: Project) => void;
  projects: Project[];
}) {
  const rows = projects
    .map((project) => ({
      project,
      stats: ticketFlowStats(project),
      health: projectHealth(project),
    }))
    .sort((a, b) => {
      const healthRank: Record<Health, number> = {
        delayed: 0,
        at_risk: 1,
        unknown: 2,
        on_track: 3,
        completed: 4,
      };
      const aPressure = a.stats.blocked + a.stats.reviewFailed + a.stats.movedBackCount;
      const bPressure = b.stats.blocked + b.stats.reviewFailed + b.stats.movedBackCount;
      return healthRank[a.health] - healthRank[b.health] || bPressure - aPressure;
    });

  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No projects available for portfolio stats yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/45 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Project</th>
            <th className="px-3 py-2 text-right font-semibold">Progress</th>
            <th className="px-3 py-2 text-right font-semibold">Tickets</th>
            <th className="px-3 py-2 text-right font-semibold">Open</th>
            <th className="px-3 py-2 text-right font-semibold">Blocked</th>
            <th className="px-3 py-2 text-right font-semibold">Review failed</th>
            <th className="px-3 py-2 text-right font-semibold">Moved back</th>
            <th className="px-3 py-2 text-left font-semibold">Signal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map(({ health, project, stats }) => (
            <tr
              key={project.id}
              className="cursor-pointer bg-card/45 transition-colors hover:bg-accent/38"
              onClick={() => onOpenProject(project)}
            >
              <td className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", healthDot[health])} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{project.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {phaseLabel(project.phase)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="app-mono px-3 py-2 text-right">{stats.overallPct}%</td>
              <td className="app-mono px-3 py-2 text-right">
                {stats.completed}/{stats.total}
              </td>
              <td className="app-mono px-3 py-2 text-right">{stats.open}</td>
              <td
                className={cn(
                  "app-mono px-3 py-2 text-right",
                  stats.blocked > 0 && "font-medium text-destructive",
                )}
              >
                {stats.blocked}
              </td>
              <td
                className={cn(
                  "app-mono px-3 py-2 text-right",
                  stats.reviewFailed > 0 && "font-medium text-destructive",
                )}
              >
                {stats.reviewFailed}
              </td>
              <td
                className={cn(
                  "app-mono px-3 py-2 text-right",
                  stats.movedBackCount > 0 && "font-medium text-warning-foreground",
                )}
              >
                {stats.hasStatusHistory ? stats.movedBackCount : "—"}
              </td>
              <td className="px-3 py-2">
                <PortfolioSignal stats={stats} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PortfolioSignal({ stats }: { stats: ReturnType<typeof ticketFlowStats> }) {
  if (stats.blocked > 0) {
    return (
      <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
        Blockers
      </Badge>
    );
  }
  if (stats.reviewFailed > 0) {
    return (
      <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
        Review failures
      </Badge>
    );
  }
  if (stats.hasStatusHistory && stats.movedBackCount > 0) {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning-foreground">
        Rework
      </Badge>
    );
  }
  if (!stats.hasStatusHistory) {
    return (
      <Badge variant="outline" className="bg-muted/60 text-muted-foreground">
        No history
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
      Healthy
    </Badge>
  );
}

function deleteCopy(target: DeleteTarget) {
  if (target.type === "member") {
    return {
      title: "Delete team member?",
      label: "Team member",
      description:
        "This will remove the person from teams and clear their project manager assignments.",
    };
  }
  return {
    title: "Delete project team?",
    label: "Project team",
    description: "This will remove the team and clear it from any projects using it.",
  };
}

function WorkQueueRow({
  index,
  members,
  onOpen,
  project,
}: {
  index: number;
  members: TeamMember[];
  onOpen: () => void;
  project: Project;
}) {
  const progress = projectProgress(project);
  const health = projectHealth(project);
  const effort = remainingEffortDays(project);
  const code = `PAL-${String(index + 121).padStart(3, "0")}`;
  const pm = project.pmId ? members.find((member) => member.id === project.pmId) : undefined;
  const assignedMembers = project.memberIds
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is TeamMember => Boolean(member));
  const sprintSummary = projectSprintSummary(project);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group grid cursor-pointer gap-3 px-5 py-4 transition-[background-color,transform] duration-200 hover:bg-accent/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[minmax(360px,1fr)_180px_180px_96px_132px] lg:items-center"
      aria-label={`Open ${project.name}`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", healthDot[health])} />
          <span className="app-mono text-[11px] font-semibold text-primary">{code}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {project.name}
          </span>
          <Badge variant="outline" className="capitalize">
            {phaseLabel(project.phase)}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span>
            Sprints{" "}
            {sprintSummary.total ? (
              <>
                <strong className="app-mono font-semibold text-success">
                  {sprintSummary.completed}
                </strong>{" "}
                completed ·{" "}
                <strong className="app-mono font-semibold text-foreground">
                  {sprintSummary.active}
                </strong>{" "}
                active
              </>
            ) : (
              <strong className="font-medium text-muted-foreground">not assigned</strong>
            )}
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span>
            UAT deadline{" "}
            <strong className="app-mono font-medium text-foreground">
              {formatProjectDate(project.uatEndDate)}
            </strong>
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span>
            Go-live{" "}
            <strong className="app-mono font-medium text-foreground">
              {formatProjectDate(project.targetDate)}
            </strong>
          </span>
        </div>
      </div>

      <div className="min-w-0 px-0 py-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">
            {pm?.name || project.owner || "Unassigned"}
          </span>
        </div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {assignedMembers.length
            ? `${assignedMembers.length} assigned · ${assignedMembers
                .slice(0, 2)
                .map((member) => member.name)
                .join(", ")}${assignedMembers.length > 2 ? "…" : ""}`
            : "No individuals assigned"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Progress</span>
          <span className="app-mono font-medium text-foreground">{progress.overall}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-500", healthFill[health])}
            style={{ width: `${progress.overall}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground lg:justify-end">
        <TimerReset className="h-3.5 w-3.5" />
        <span className="app-mono">{effort}d</span>
      </div>

      <div className="flex items-center lg:justify-end">
        <span
          className={cn(
            "app-mono text-xs",
            dueIsLate(project.targetDate) ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {formatDue(project.targetDate)}
        </span>
      </div>
    </div>
  );
}

function MetricCard({
  className,
  detail,
  icon,
  label,
  tone = "default",
  value,
}: {
  className?: string;
  detail: string;
  icon: ReactNode;
  label: string;
  tone?: "default" | "success" | "warning";
  value: number | string;
}) {
  return (
    <div className={cn("app-panel-muted rounded-[1.55rem] px-4 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="app-kicker">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
            {value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            tone === "success"
              ? "bg-success/10 text-success"
              : tone === "warning"
                ? "bg-warning/20 text-warning-foreground"
                : "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function WorkQueueSkeleton() {
  return (
    <div className="divide-y divide-border">
      <WorkQueueHeader />
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(360px,1fr)_180px_180px_96px_132px] lg:items-center"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-12 lg:ml-auto" />
          <Skeleton className="h-7 w-28 lg:ml-auto" />
        </div>
      ))}
    </div>
  );
}

function WorkQueueHeader() {
  return (
    <div className="hidden border-b border-border bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid lg:grid-cols-[minmax(360px,1fr)_180px_180px_96px_132px]">
      <span>Project</span>
      <span>Owner / Team</span>
      <span>Progress</span>
      <span className="text-right">Effort</span>
      <span className="text-right">Due</span>
    </div>
  );
}

function EmptyState({ hasProjects, onCreate }: { hasProjects: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-primary/10 text-primary">
        {hasProjects ? <Search className="h-5 w-5" /> : <FolderKanban className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {hasProjects ? "No matching projects" : "No projects yet"}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {hasProjects
          ? "Try another filter or clear the search to return to the full queue."
          : "Create your first project and the dashboard will populate with health, effort, and activity."}
      </p>
      {!hasProjects && (
        <Button className="mt-6" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      )}
    </div>
  );
}

function SegmentedHealthBar({ counts, total }: { counts: Record<Health, number>; total: number }) {
  const segments: Array<{ key: Health; className: string }> = [
    { key: "on_track", className: "bg-success" },
    { key: "at_risk", className: "bg-warning" },
    { key: "delayed", className: "bg-destructive" },
    { key: "completed", className: "bg-info" },
    { key: "unknown", className: "bg-muted-foreground/40" },
  ];

  return (
    <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {total === 0 ? (
        <span className="h-full w-full bg-muted" />
      ) : (
        segments.map((segment) => (
          <span
            key={segment.key}
            className={segment.className}
            style={{ width: `${(counts[segment.key] / total) * 100}%` }}
          />
        ))
      )}
    </div>
  );
}

function HealthLegend({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "success" | "warning" | "destructive" | "info";
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", legendTone[tone])} />
        <span>{label}</span>
      </div>
      <span className="app-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatToday() {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function formatDue(value?: string) {
  if (!value) return "No date";
  const days = daysFromToday(value);
  if (days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return "Today";
  if (days === 1) return "Tmrw";
  if (days < 7) {
    return new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(value));
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatProjectDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function projectSprintSummary(project: Project) {
  const sprints = new Map<string, Project["modules"]>();

  for (const ticket of project.modules) {
    const sprint = ticket.sprintGroup?.trim();
    if (!sprint) continue;
    sprints.set(sprint, [...(sprints.get(sprint) ?? []), ticket]);
  }

  const completed = [...sprints.values()].filter((tickets) =>
    tickets.every((ticket) => ticket.status === "completed"),
  ).length;

  return {
    total: sprints.size,
    completed,
    active: sprints.size - completed,
  };
}

function dueIsLate(value?: string) {
  return value ? daysFromToday(value) < 0 : false;
}

function daysFromToday(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function relativeAge(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function weekBars(stats: ReturnType<typeof buildStats>) {
  const base = Math.max(12, Math.min(88, stats.portfolioHealth || 28));
  return [
    Math.max(18, base - 18),
    Math.min(92, base + 8),
    Math.max(24, base - stats.overdue * 8),
    Math.min(86, base + stats.completed * 4),
    Math.max(16, Math.min(80, stats.remainingEffort * 2)),
  ];
}

function shellToneFromHealth(health: Health): "blue" | "green" | "amber" | "red" {
  if (health === "completed") return "green";
  if (health === "at_risk") return "amber";
  if (health === "delayed") return "red";
  return "blue";
}

function phaseSummary(counts: Record<ProjectPhase, number>) {
  const ranked = phaseOrder
    .map((phase) => ({ phase, count: counts[phase] }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) return "No phase data";
  if (ranked.length === 1) return phaseLabel(ranked[0].phase);
  return `${phaseLabel(ranked[0].phase)} / ${phaseLabel(ranked[1].phase)}`;
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const phaseOrder: ProjectPhase[] = [
  "discovery",
  "build",
  "uat",
  "go_live",
  "hypercare",
  "complete",
  "paused",
];

const phaseTone: Record<ProjectPhase, string> = {
  discovery: "bg-primary",
  build: "bg-info",
  uat: "bg-warning",
  go_live: "bg-success",
  hypercare: "bg-muted-foreground",
  complete: "bg-success/80",
  paused: "bg-destructive",
};

const healthDot: Record<Health, string> = {
  on_track: "bg-success",
  at_risk: "bg-warning",
  delayed: "bg-destructive",
  completed: "bg-info",
  unknown: "bg-muted-foreground/50",
};

const healthFill: Record<Health, string> = {
  on_track: "bg-primary",
  at_risk: "bg-warning",
  delayed: "bg-destructive",
  completed: "bg-success",
  unknown: "bg-muted-foreground/50",
};

const activityDot: Record<Health, string> = {
  on_track: "bg-primary",
  at_risk: "bg-warning",
  delayed: "bg-destructive",
  completed: "bg-success",
  unknown: "bg-muted-foreground",
};

const legendTone = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};
