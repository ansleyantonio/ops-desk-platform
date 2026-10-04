import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  CalendarX2,
  ClockAlert,
  ClipboardList,
  Pencil,
  Power,
  PowerOff,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission } from "@/lib/auth";
import { listProjects, listTeamData } from "@/lib/project.functions";
import {
  deleteRecoveryTask,
  listRecoveryEvents,
  listRecoveryModes,
  listRecoveryTasks,
  saveRecoveryTask,
  setProjectRecoveryMode,
} from "@/lib/recovery.functions";
import {
  ROOT_CAUSES,
  ROOT_CAUSE_LABELS,
  recoveryCommitmentNewestFirst,
  recoverySummary,
  type RecoveryEvent,
  type RecoveryProjectMode,
  type RecoveryRootCause,
  type RecoveryStatus,
  type RecoveryTask,
} from "@/lib/recovery-types";
import { uid, type Project, type TeamMember } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/project-recovery")({
  head: () => ({
    meta: [
      { title: "Project Recovery | OpsDesk" },
      {
        name: "description",
        content:
          "Put projects into Recovery mode and scrutinize every task, deadline, and delivery action.",
      },
    ],
  }),
  component: ProjectRecoveryPage,
});

type RecoveryFormState = {
  id: string;
  projectId: string;
  taskId: string;
  ownerId: string;
  pmId: string;
  techLeadId: string;
  originalEstimateDays: string;
  committedCompletionDate: string;
  actualCompletionDate: string;
  qaRejectionCount: string;
  scopeChanged: boolean;
  blockerRaisedDate: string;
  resourceReassigned: boolean;
  rootCause: RecoveryRootCause | "none";
  status: RecoveryStatus;
  createdAt: number;
};

type RecoveryModeFormState = {
  projectId: string;
  reason: string;
};

type RecoveryActivityItem = {
  id: string;
  projectId: string;
  taskId?: string;
  title: string;
  detail: string;
  actor: string;
  createdAt: number;
  source: "recovery" | "ticket";
};

function emptyForm(): RecoveryFormState {
  return {
    id: uid(),
    projectId: "",
    taskId: "",
    ownerId: "none",
    pmId: "none",
    techLeadId: "none",
    originalEstimateDays: "",
    committedCompletionDate: "",
    actualCompletionDate: "",
    qaRejectionCount: "0",
    scopeChanged: false,
    blockerRaisedDate: "",
    resourceReassigned: false,
    rootCause: "none",
    status: "green",
    createdAt: Date.now(),
  };
}

function ProjectRecoveryPage() {
  const { currentUser } = Route.useRouteContext();
  const canManage = hasPermission(currentUser, "projects:manage");
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<RecoveryTask[]>([]);
  const [modes, setModes] = useState<RecoveryProjectMode[]>([]);
  const [events, setEvents] = useState<RecoveryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | RecoveryStatus>(
    "all",
  );
  const [form, setForm] = useState<RecoveryFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecoveryTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [modeForm, setModeForm] = useState<RecoveryModeFormState | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  const [exitModeTarget, setExitModeTarget] = useState<Project | null>(null);

  const load = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [projectData, teamData, recoveryData, modeData, eventData] =
        await Promise.all([
          listProjects(),
          listTeamData(),
          listRecoveryTasks(),
          listRecoveryModes(),
          listRecoveryEvents(),
        ]);
      setProjects(projectData.filter((project) => !project.isDraft));
      setMembers(teamData.members);
      setTasks(recoveryData);
      setModes(modeData);
      setEvents(eventData);
    } catch (error) {
      console.error("Failed to load project recovery dashboard", error);
      setPageError(errorMessage(error, "Recovery data could not be loaded."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const activeModes = useMemo(
    () => modes.filter((mode) => mode.active),
    [modes],
  );
  const activeModeByProject = useMemo(
    () => new Map(activeModes.map((mode) => [mode.projectId, mode])),
    [activeModes],
  );
  const recoveryProjects = useMemo(
    () =>
      projects
        .filter(
          (project) =>
            activeModeByProject.has(project.id) ||
            tasks.some((task) => task.projectId === project.id),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [activeModeByProject, projects, tasks],
  );

  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks
      .filter(
        (task) => projectFilter === "all" || task.projectId === projectFilter,
      )
      .filter((task) => statusFilter === "all" || task.status === statusFilter)
      .filter((task) => {
        if (!needle) return true;
        const project = projectsById.get(task.projectId);
        const ticket = project?.modules.find(
          (module) => module.id === task.taskId,
        );
        const people = [task.ownerId, task.pmId, task.techLeadId]
          .map((id) => (id ? membersById.get(id)?.name : ""))
          .join(" ");
        return `${project?.name ?? ""} ${ticket?.name ?? ""} ${people}`
          .toLowerCase()
          .includes(needle);
      })
      .sort(recoveryCommitmentNewestFirst);
  }, [membersById, projectFilter, projectsById, query, statusFilter, tasks]);

  const summary = useMemo(
    () => recoverySummary(filteredTasks),
    [filteredTasks],
  );
  const breakdown = ROOT_CAUSES.map((cause) => ({
    ...cause,
    count: summary.rootCauseCounts[cause.value],
  }))
    .filter((cause) => cause.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
  const maxCauseCount = Math.max(1, ...breakdown.map((cause) => cause.count));

  const activityItems = useMemo(() => {
    const items: RecoveryActivityItem[] = events.map((event) => ({
      id: `recovery:${event.id}`,
      projectId: event.projectId,
      taskId: event.taskId,
      title: recoveryEventTitle(event),
      detail: recoveryEventDetail(event),
      actor: event.actorName ?? "System",
      createdAt: event.createdAt,
      source: "recovery",
    }));

    for (const project of projects) {
      const mode = activeModeByProject.get(project.id);
      if (!mode) continue;
      for (const module of project.modules) {
        for (const activity of module.activities ?? []) {
          const createdAt = Date.parse(activity.createdAt);
          if (!Number.isFinite(createdAt) || createdAt < mode.enabledAt)
            continue;
          items.push({
            id: `ticket:${project.id}:${module.id}:${activity.id}`,
            projectId: project.id,
            taskId: module.id,
            title: humanizeAction(activity.action),
            detail: activityDetail(activity.metadata),
            actor: activity.actor?.name ?? "Ticketing system",
            createdAt,
            source: "ticket",
          });
        }
      }
    }

    return items
      .filter(
        (item) => projectFilter === "all" || item.projectId === projectFilter,
      )
      .filter((item) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        const project = projectsById.get(item.projectId);
        const task = project?.modules.find(
          (module) => module.id === item.taskId,
        );
        return `${project?.name ?? ""} ${task?.name ?? ""} ${item.title} ${item.detail} ${item.actor}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 100);
  }, [
    activeModeByProject,
    events,
    projectFilter,
    projects,
    projectsById,
    query,
  ]);

  const startRecoveryMode = async (event: FormEvent) => {
    event.preventDefault();
    if (!modeForm?.projectId || !modeForm.reason.trim()) return;
    setModeSaving(true);
    setPageError(null);
    try {
      await setProjectRecoveryMode({
        data: {
          projectId: modeForm.projectId,
          enabled: true,
          reason: modeForm.reason,
        },
      });
      const projectId = modeForm.projectId;
      setModeForm(null);
      setProjectFilter(projectId);
      await load();
    } catch (error) {
      console.error("Failed to enable Recovery mode", error);
      setPageError(errorMessage(error, "Recovery mode could not be enabled."));
    } finally {
      setModeSaving(false);
    }
  };

  const stopRecoveryMode = async () => {
    if (!exitModeTarget) return;
    setModeSaving(true);
    setPageError(null);
    try {
      await setProjectRecoveryMode({
        data: { projectId: exitModeTarget.id, enabled: false },
      });
      if (projectFilter === exitModeTarget.id) setProjectFilter("all");
      setExitModeTarget(null);
      await load();
    } catch (error) {
      console.error("Failed to disable Recovery mode", error);
      setPageError(errorMessage(error, "Recovery mode could not be disabled."));
    } finally {
      setModeSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(false);
    setFormError(null);
    const next = emptyForm();
    if (projectFilter !== "all" && projectsById.has(projectFilter)) {
      const project = projectsById.get(projectFilter)!;
      next.projectId = project.id;
      next.pmId = project.pmId ?? "none";
      next.techLeadId = suggestedTechLead(project, members) ?? "none";
    }
    setForm(next);
  };

  const openEdit = (task: RecoveryTask) => {
    setEditing(true);
    setFormError(null);
    setForm({
      id: task.id,
      projectId: task.projectId,
      taskId: task.taskId,
      ownerId: task.ownerId ?? "none",
      pmId: task.pmId ?? "none",
      techLeadId: task.techLeadId ?? "none",
      originalEstimateDays:
        task.originalEstimateDays === undefined
          ? ""
          : String(task.originalEstimateDays),
      committedCompletionDate: task.committedCompletionDate ?? "",
      actualCompletionDate: task.actualCompletionDate ?? "",
      qaRejectionCount: String(task.qaRejectionCount),
      scopeChanged: task.scopeChanged,
      blockerRaisedDate: task.blockerRaisedDate ?? "",
      resourceReassigned: task.resourceReassigned,
      rootCause: task.rootCause ?? "none",
      status: task.status,
      createdAt: task.createdAt,
    });
  };

  const changeProject = (projectId: string) => {
    const project = projectsById.get(projectId);
    setForm((current) =>
      current
        ? {
            ...current,
            projectId,
            taskId: "",
            ownerId: "none",
            pmId: project?.pmId ?? "none",
            techLeadId: project
              ? (suggestedTechLead(project, members) ?? "none")
              : "none",
            originalEstimateDays: "",
            committedCompletionDate: "",
          }
        : current,
    );
  };

  const changeTicket = (taskId: string) => {
    const project = form ? projectsById.get(form.projectId) : undefined;
    const ticket = project?.modules.find((module) => module.id === taskId);
    const matchedOwner = ticket?.assignee
      ? members.find(
          (member) =>
            member.name.trim().toLowerCase() ===
            ticket.assignee!.trim().toLowerCase(),
        )
      : undefined;
    setForm((current) =>
      current
        ? {
            ...current,
            taskId,
            ownerId: matchedOwner?.id ?? current.ownerId,
            originalEstimateDays:
              ticket?.effortDays === undefined
                ? current.originalEstimateDays
                : String(ticket.effortDays),
            committedCompletionDate:
              ticket?.plannedEnd || current.committedCompletionDate || "",
          }
        : current,
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !form.projectId || !form.taskId) {
      setFormError("Project and task are required.");
      return;
    }
    const estimate =
      form.originalEstimateDays === ""
        ? undefined
        : Number(form.originalEstimateDays);
    const qaRejections = Number(form.qaRejectionCount);
    if (
      (estimate !== undefined &&
        (!Number.isFinite(estimate) || estimate < 0)) ||
      !Number.isInteger(qaRejections) ||
      qaRejections < 0
    ) {
      setFormError(
        "Estimate and QA rejection count must be valid non-negative numbers.",
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const saved = await saveRecoveryTask({
        data: {
          id: form.id,
          projectId: form.projectId,
          taskId: form.taskId,
          ownerId: optionalValue(form.ownerId),
          pmId: optionalValue(form.pmId),
          techLeadId: optionalValue(form.techLeadId),
          originalEstimateDays: estimate,
          committedCompletionDate: optionalValue(form.committedCompletionDate),
          actualCompletionDate: optionalValue(form.actualCompletionDate),
          qaRejectionCount: qaRejections,
          scopeChanged: form.scopeChanged,
          blockerRaisedDate: optionalValue(form.blockerRaisedDate),
          resourceReassigned: form.resourceReassigned,
          rootCause: form.rootCause === "none" ? undefined : form.rootCause,
          status: form.status,
          createdAt: form.createdAt,
          updatedAt: Date.now(),
        },
      });
      setTasks((current) => [
        saved,
        ...current.filter((task) => task.id !== saved.id),
      ]);
      setForm(null);
    } catch (error) {
      console.error("Failed to save recovery task", error);
      setFormError(
        errorMessage(error, "The recovery task could not be saved."),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageError(null);
    try {
      await deleteRecoveryTask({ data: { id: deleteTarget.id } });
      setTasks((current) =>
        current.filter((task) => task.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete recovery task", error);
      setPageError(
        errorMessage(error, "The recovery task could not be removed."),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1520px] space-y-5">
      <section className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="app-kicker">Delivery recovery</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
            Project Recovery Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Put an entire project under scrutiny: every task, deadline,
            ownership change, and synced ticket action is tracked.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={openCreate}
              disabled={!projects.some((project) => project.modules.length)}
            >
              <Plus className="h-4 w-4" /> Add single task
            </Button>
            <Button
              onClick={() => setModeForm({ projectId: "", reason: "" })}
              disabled={projects.every((project) =>
                activeModeByProject.has(project.id),
              )}
            >
              <ShieldAlert className="h-4 w-4" /> Start Recovery mode
            </Button>
          </div>
        )}
      </section>

      {pageError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          <span>{pageError}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {activeModes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                Projects in Recovery mode
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every current and newly added task is automatically monitored.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-destructive/30 bg-destructive/8 text-destructive"
            >
              {activeModes.length} active
            </Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {activeModes.map((mode) => {
              const project = projectsById.get(mode.projectId);
              if (!project) return null;
              const projectTasks = tasks.filter(
                (task) => task.projectId === project.id,
              );
              const currentProjectTasks = projectTasks.filter((task) =>
                project.modules.some((module) => module.id === task.taskId),
              );
              const projectSummary = recoverySummary(currentProjectTasks);
              return (
                <div
                  key={mode.projectId}
                  className="rounded-[1.3rem] border border-destructive/20 bg-destructive/[0.035] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Power className="h-4 w-4 shrink-0 text-destructive" />
                        <h3 className="truncate text-sm font-semibold">
                          {project.name}
                        </h3>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {mode.reason || "Recovery oversight enabled"}
                      </p>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs text-muted-foreground"
                        onClick={() => setExitModeTarget(project)}
                      >
                        <PowerOff className="h-3.5 w-3.5" /> Exit
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <ModeStat
                      label="Covered"
                      value={`${currentProjectTasks.length}/${project.modules.length}`}
                    />
                    <ModeStat
                      label="Missing dates"
                      value={projectSummary.missingDeadlines}
                      alert={projectSummary.missingDeadlines > 0}
                    />
                    <ModeStat
                      label="Missed"
                      value={projectSummary.missedDeadlines}
                      alert={projectSummary.missedDeadlines > 0}
                    />
                  </div>
                  <div className="mt-3 text-[10px] text-muted-foreground">
                    Active since {formatTimestamp(mode.enabledAt)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          label="Committed tasks"
          value={summary.totalCommitted}
          icon={<ClipboardList />}
        />
        <MetricCard
          label="Missing deadlines"
          value={summary.missingDeadlines}
          icon={<ClockAlert />}
          tone={summary.missingDeadlines ? "danger" : "success"}
        />
        <MetricCard
          label="Completed on time"
          value={summary.completedOnTime}
          icon={<CalendarCheck2 />}
          tone="success"
        />
        <MetricCard
          label="Missed deadlines"
          value={summary.missedDeadlines}
          icon={<CalendarX2 />}
          tone={summary.missedDeadlines ? "danger" : "success"}
        />
        <MetricCard
          label="QA rejection rate"
          value={`${summary.qaRejectionRate}%`}
          detail={`${summary.qaRejectedTasks} task${summary.qaRejectedTasks === 1 ? "" : "s"} rejected`}
          icon={<AlertTriangle />}
          tone={summary.qaRejectionRate ? "warning" : "success"}
        />
        <MetricCard
          label="Scope changes"
          value={summary.scopeChanges}
          icon={<RefreshCw />}
          tone={summary.scopeChanges ? "warning" : "default"}
        />
        <MetricCard
          label="Resource reassignments"
          value={summary.resourceReassignments}
          icon={<UserRoundCog />}
          tone={summary.resourceReassignments ? "warning" : "default"}
        />
      </section>

      <section className="grid gap-4 rounded-[1.5rem] border border-border/70 bg-card/55 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)]">
        <div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Delay root causes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Breakdown for the current project and status filters.
            </p>
          </div>
          {breakdown.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {breakdown.map((cause) => (
                <div
                  key={cause.value}
                  className="rounded-xl border border-border/60 bg-background/35 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">{cause.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {cause.count}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${(cause.count / maxCauseCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-xs text-muted-foreground">
              No delay root causes recorded for this view.
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border/60 bg-background/35 p-4">
          <h2 className="text-sm font-semibold">Status guide</h2>
          <div className="mt-3 space-y-3 text-xs">
            <StatusGuide status="green" text="On track" />
            <StatusGuide status="amber" text="At risk" />
            <StatusGuide
              status="red"
              text="Deadline missed or expected to miss"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-2 rounded-[1.3rem] border border-border/70 bg-card/55 p-3 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,.7fr)_minmax(10rem,.5fr)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search project, task, or owner"
            className="pl-9"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All recovery projects</SelectItem>
            {recoveryProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as typeof statusFilter)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="green">Green</SelectItem>
            <SelectItem value="amber">Amber</SelectItem>
            <SelectItem value="red">Red</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-[1.3rem]" />
          ))}
        </div>
      ) : filteredTasks.length ? (
        <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Recovery commitments</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filteredTasks.length} task
                {filteredTasks.length === 1 ? "" : "s"} under scrutiny
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[1520px]">
              <div className="grid grid-cols-[1.45fr_1.7fr_1fr_1fr_1fr_.65fr_.85fr_.85fr_.55fr_.6fr_.85fr_.6fr_1.15fr_.65fr_auto] gap-3 border-b border-border/70 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <span>Project</span>
                <span>Task / ticket</span>
                <span>Owner</span>
                <span>PM</span>
                <span>Tech Lead</span>
                <span>Estimate</span>
                <span>Committed</span>
                <span>Actual</span>
                <span>QA</span>
                <span>Scope</span>
                <span>Blocker raised</span>
                <span>Reassigned</span>
                <span>Root cause</span>
                <span>Status</span>
                <span className="sr-only">Actions</span>
              </div>
              <div className="divide-y divide-border/70">
                {filteredTasks.map((task) => (
                  <RecoveryRow
                    key={task.id}
                    task={task}
                    project={projectsById.get(task.projectId)}
                    membersById={membersById}
                    canManage={canManage}
                    locked={activeModeByProject.has(task.projectId)}
                    onEdit={() => openEdit(task)}
                    onDelete={() => setDeleteTarget(task)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-[1.5rem] border border-dashed border-border p-12 text-center">
          <ClipboardList className="mx-auto h-7 w-7 text-muted-foreground" />
          <div className="mt-3 text-sm font-medium">
            No tasks are under recovery scrutiny
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Start Recovery mode for a project or adjust the current filters.
          </p>
          {canManage && projects.length > 0 && (
            <Button
              size="sm"
              className="mt-4"
              onClick={() => setModeForm({ projectId: "", reason: "" })}
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Start Recovery mode
            </Button>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" /> Recovery activity
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              OpsDesk changes and synced ticket actions recorded since Recovery
              mode began.
            </p>
          </div>
          <Badge variant="outline">Latest {activityItems.length}</Badge>
        </div>
        {activityItems.length > 0 ? (
          <div className="max-h-[34rem] divide-y divide-border/70 overflow-y-auto">
            {activityItems.map((item) => {
              const project = projectsById.get(item.projectId);
              const ticket = project?.modules.find(
                (module) => module.id === item.taskId,
              );
              return (
                <div
                  key={item.id}
                  className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold">
                        {item.title}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {item.source === "ticket"
                          ? "Ticket action"
                          : "Recovery"}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {project?.name ?? "Unknown project"}
                      {ticket ? ` · ${ticket.name}` : ""}
                      {item.detail ? ` · ${item.detail}` : ""}
                    </div>
                  </div>
                  <div className="text-left text-[10px] text-muted-foreground sm:text-right">
                    <div>{item.actor}</div>
                    <div className="mt-0.5">
                      {formatTimestamp(item.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-9 text-center text-xs text-muted-foreground">
            Actions will appear here as soon as work changes on a project in
            Recovery mode.
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(modeForm)}
        onOpenChange={(open) => {
          if (!open && !modeSaving) setModeForm(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Start project Recovery mode</DialogTitle>
            <DialogDescription>
              Every existing task and every task added later will be monitored.
              Missing dates, deadline changes, ownership changes, status
              changes, and synced ticket actions will be visible in this
              dashboard.
            </DialogDescription>
          </DialogHeader>
          {modeForm && (
            <form onSubmit={startRecoveryMode} className="space-y-4">
              <Field label="Project" required>
                <Select
                  value={modeForm.projectId || undefined}
                  onValueChange={(projectId) =>
                    setModeForm((current) =>
                      current ? { ...current, projectId } : current,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects
                      .filter((project) => !activeModeByProject.has(project.id))
                      .sort((left, right) =>
                        left.name.localeCompare(right.name),
                      )
                      .map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name} · {project.modules.length} task
                          {project.modules.length === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reason for recovery" required>
                <Input
                  value={modeForm.reason}
                  maxLength={1000}
                  placeholder="What triggered recovery and what outcome is required?"
                  onChange={(event) =>
                    setModeForm((current) =>
                      current
                        ? { ...current, reason: event.target.value }
                        : current,
                    )
                  }
                />
              </Field>
              <div className="rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 text-xs leading-5 text-muted-foreground">
                Tasks cannot be removed from recovery tracking while this mode
                is active. Exit Recovery mode only after the project has
                returned to controlled delivery.
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={modeSaving}
                  onClick={() => setModeForm(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    modeSaving || !modeForm.projectId || !modeForm.reason.trim()
                  }
                >
                  <ShieldAlert className="h-4 w-4" />
                  {modeSaving ? "Starting…" : "Start Recovery mode"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(exitModeTarget)}
        onOpenChange={(open) => {
          if (!open && !modeSaving) setExitModeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit Recovery mode?</AlertDialogTitle>
            <AlertDialogDescription>
              {exitModeTarget?.name} will stop automatically enrolling tasks and
              recording project changes in the recovery audit trail. Existing
              history is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={modeSaving}>
              Keep active
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={modeSaving}
              onClick={(event) => {
                event.preventDefault();
                void stopRecoveryMode();
              }}
            >
              {modeSaving ? "Exiting…" : "Exit Recovery mode"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecoveryTaskDialog
        open={Boolean(form)}
        editing={editing}
        form={form}
        projects={projects}
        members={members}
        tasks={tasks}
        error={formError}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setForm(null);
        }}
        onChange={setForm}
        onProjectChange={changeProject}
        onTaskChange={changeTicket}
        onSubmit={submit}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this recovery task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes only the recovery tracking record. The underlying
              project ticket is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecoveryTaskDialog({
  open,
  editing,
  form,
  projects,
  members,
  tasks,
  error,
  saving,
  onOpenChange,
  onChange,
  onProjectChange,
  onTaskChange,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: RecoveryFormState | null;
  projects: Project[];
  members: TeamMember[];
  tasks: RecoveryTask[];
  error: string | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: React.Dispatch<React.SetStateAction<RecoveryFormState | null>>;
  onProjectChange: (projectId: string) => void;
  onTaskChange: (taskId: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  if (!form) return null;
  const project = projects.find((item) => item.id === form.projectId);
  const availableTickets = (project?.modules ?? []).filter(
    (module) =>
      !tasks.some((task) => task.taskId === module.id && task.id !== form.id),
  );
  const pms = members.filter((member) => member.role === "pm").sort(byName);
  const owners = members.filter((member) => member.role !== "pm").sort(byName);
  const techLeads = members
    .filter((member) => member.role === "dev")
    .sort(byName);
  const patch = (changes: Partial<RecoveryFormState>) =>
    onChange((current) => (current ? { ...current, ...changes } : current));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit recovery task" : "Add recovery task"}
          </DialogTitle>
          <DialogDescription>
            Link an existing project ticket and record only the
            recovery-specific commitment details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required>
              <Select
                value={form.projectId || undefined}
                onValueChange={onProjectChange}
                disabled={editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects
                    .filter((item) => item.modules.length > 0)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Task / ticket" required>
              <Select
                value={form.taskId || undefined}
                onValueChange={onTaskChange}
                disabled={!form.projectId || editing}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      form.projectId
                        ? "Select a task"
                        : "Choose a project first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableTickets.map((module) => (
                    <SelectItem key={module.id} value={module.id}>
                      {module.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner">
              <PersonSelect
                value={form.ownerId}
                placeholder="Unassigned"
                people={owners}
                onChange={(ownerId) => patch({ ownerId })}
              />
            </Field>
            <Field label="PM">
              <PersonSelect
                value={form.pmId}
                placeholder="Unassigned"
                people={pms}
                onChange={(pmId) => patch({ pmId })}
              />
            </Field>
            <Field label="Tech Lead">
              <PersonSelect
                value={form.techLeadId}
                placeholder="Unassigned"
                people={techLeads}
                onChange={(techLeadId) => patch({ techLeadId })}
              />
            </Field>
            <Field label="Original estimate (days)">
              <Input
                type="number"
                min="0"
                max="99999"
                step="0.25"
                value={form.originalEstimateDays}
                onChange={(event) =>
                  patch({ originalEstimateDays: event.target.value })
                }
                placeholder="e.g. 5"
              />
            </Field>
            <Field label="Committed completion date">
              <Input
                type="date"
                value={form.committedCompletionDate}
                onChange={(event) =>
                  patch({ committedCompletionDate: event.target.value })
                }
              />
            </Field>
            <Field label="Actual completion date">
              <Input
                type="date"
                value={form.actualCompletionDate}
                onChange={(event) =>
                  patch({ actualCompletionDate: event.target.value })
                }
              />
            </Field>
            <Field label="QA rejection count">
              <Input
                type="number"
                min="0"
                max="100000"
                step="1"
                value={form.qaRejectionCount}
                onChange={(event) =>
                  patch({ qaRejectionCount: event.target.value })
                }
              />
            </Field>
            <Field label="Blocker raised date">
              <Input
                type="date"
                value={form.blockerRaisedDate}
                onChange={(event) =>
                  patch({ blockerRaisedDate: event.target.value })
                }
              />
            </Field>
            <Field label="Scope changed?">
              <BooleanSelect
                value={form.scopeChanged}
                onChange={(scopeChanged) => patch({ scopeChanged })}
              />
            </Field>
            <Field label="Resource reassigned?">
              <BooleanSelect
                value={form.resourceReassigned}
                onChange={(resourceReassigned) => patch({ resourceReassigned })}
              />
            </Field>
            <Field label="Root cause of delay">
              <Select
                value={form.rootCause}
                onValueChange={(rootCause) =>
                  patch({
                    rootCause: rootCause as RecoveryFormState["rootCause"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {ROOT_CAUSES.map((cause) => (
                    <SelectItem key={cause.value} value={cause.value}>
                      {cause.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(status) =>
                  patch({ status: status as RecoveryStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="green">Green — on track</SelectItem>
                  <SelectItem value="amber">Amber — at risk</SelectItem>
                  <SelectItem value="red">
                    Red — expected to miss / missed
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecoveryRow({
  task,
  project,
  membersById,
  canManage,
  locked,
  onEdit,
  onDelete,
}: {
  task: RecoveryTask;
  project?: Project;
  membersById: Map<string, TeamMember>;
  canManage: boolean;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ticket = project?.modules.find((module) => module.id === task.taskId);
  const person = (id?: string) =>
    id ? (membersById.get(id)?.name ?? "Unknown") : "—";
  return (
    <div className="grid grid-cols-[1.45fr_1.7fr_1fr_1fr_1fr_.65fr_.85fr_.85fr_.55fr_.6fr_.85fr_.6fr_1.15fr_.65fr_auto] items-center gap-3 px-5 py-4 text-xs transition-colors hover:bg-accent/25">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="truncate font-semibold text-foreground">
            {project?.name ?? "Unknown project"}
          </div>
          {locked && (
            <Badge
              variant="outline"
              className="shrink-0 border-destructive/25 bg-destructive/8 px-1.5 py-0 text-[8px] text-destructive"
            >
              Recovery
            </Badge>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">
          {ticket?.name ?? "Ticket no longer available"}
        </div>
      </div>
      <span className="truncate">{person(task.ownerId)}</span>
      <span className="truncate">{person(task.pmId)}</span>
      <span className="truncate">{person(task.techLeadId)}</span>
      <span>
        {task.originalEstimateDays === undefined
          ? "—"
          : `${task.originalEstimateDays}d`}
      </span>
      <span
        className={cn(
          !task.committedCompletionDate && "font-semibold text-destructive",
        )}
      >
        {task.committedCompletionDate
          ? formatDate(task.committedCompletionDate)
          : "Missing"}
      </span>
      <span>
        {task.actualCompletionDate
          ? formatDate(task.actualCompletionDate)
          : "—"}
      </span>
      <span
        className={
          task.qaRejectionCount
            ? "font-semibold text-warning"
            : "text-muted-foreground"
        }
      >
        {task.qaRejectionCount}
      </span>
      <YesNo value={task.scopeChanged} />
      <span>
        {task.blockerRaisedDate ? formatDate(task.blockerRaisedDate) : "—"}
      </span>
      <YesNo value={task.resourceReassigned} />
      <span
        className="truncate"
        title={task.rootCause ? ROOT_CAUSE_LABELS[task.rootCause] : undefined}
      >
        {task.rootCause ? ROOT_CAUSE_LABELS[task.rootCause] : "—"}
      </span>
      <StatusBadge status={task.status} />
      <div className="flex justify-end gap-1">
        {canManage && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Edit recovery task"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!locked && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                aria-label="Delete recovery task"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="rounded-[1.3rem] border border-border/70 bg-card/55 p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span className={cn("[&_svg]:h-4 [&_svg]:w-4", toneClass)}>{icon}</span>
      </div>
      <div
        className={cn(
          "mt-3 text-2xl font-semibold tracking-[-0.04em]",
          toneClass,
        )}
      >
        {value}
      </div>
      {detail && (
        <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
      )}
    </div>
  );
}

function ModeStat({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 px-2 py-2.5">
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          alert && "text-destructive",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function PersonSelect({
  value,
  placeholder,
  people,
  onChange,
}: {
  value: string;
  placeholder: string;
  people: TeamMember[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {person.name}
            {person.title ? ` · ${person.title}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BooleanSelect({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Select
      value={value ? "yes" : "no"}
      onValueChange={(next) => onChange(next === "yes")}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="no">No</SelectItem>
        <SelectItem value="yes">Yes</SelectItem>
      </SelectContent>
    </Select>
  );
}

function StatusGuide({
  status,
  text,
}: {
  status: RecoveryStatus;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={status} />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: RecoveryStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit capitalize",
        status === "green" && "border-success/35 bg-success/8 text-success",
        status === "amber" && "border-warning/40 bg-warning/10 text-warning",
        status === "red" &&
          "border-destructive/35 bg-destructive/8 text-destructive",
      )}
    >
      <span
        className={cn(
          "mr-1.5 h-1.5 w-1.5 rounded-full",
          status === "green" && "bg-success",
          status === "amber" && "bg-warning",
          status === "red" && "bg-destructive",
        )}
      />
      {status}
    </Badge>
  );
}

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="font-medium text-warning">Yes</span>
  ) : (
    <span className="text-muted-foreground">No</span>
  );
}

function suggestedTechLead(project: Project, members: TeamMember[]) {
  const projectMemberIds = new Set(project.memberIds);
  return members.find(
    (member) =>
      member.role === "dev" &&
      projectMemberIds.has(member.id) &&
      /\b(tech|technical)?\s*lead\b/i.test(member.title ?? ""),
  )?.id;
}

function optionalValue<T extends string>(
  value: T | "none" | "",
): T | undefined {
  return value && value !== "none" ? (value as T) : undefined;
}

function byName(left: TeamMember, right: TeamMember) {
  return left.name.localeCompare(right.name);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeAction(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recoveryEventTitle(event: RecoveryEvent) {
  const labels: Record<string, string> = {
    recovery_mode_enabled: "Recovery mode started",
    recovery_mode_disabled: "Recovery mode ended",
    recovery_task_added: "Task added to recovery",
    recovery_task_updated: "Recovery commitment updated",
    recovery_task_removed: "Task removed from recovery",
    project_changed: "Project controls changed",
    task_added: "Task added to project",
    task_auto_enrolled: "New task enrolled automatically",
    task_changed: "Task changed",
    task_removed: "Task removed from project",
  };
  return labels[event.eventType] ?? humanizeAction(event.eventType);
}

function recoveryEventDetail(event: RecoveryEvent) {
  const details = parseEventDetails(event.details);
  if (!details) return "";
  if (typeof details.reason === "string" && details.reason.trim()) {
    return details.reason;
  }
  const changes = details.changes;
  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    const fields = Object.keys(changes);
    return fields.length
      ? `Changed ${fields.map(humanizeAction).join(", ")}`
      : "";
  }
  if (typeof details.enrolledTasks === "number") {
    return `${details.enrolledTasks} task${details.enrolledTasks === 1 ? "" : "s"} enrolled`;
  }
  return "";
}

function activityDetail(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";
  const from = printableValue(metadata.from);
  const to = printableValue(metadata.to);
  if (from && to) return `${from} → ${to}`;
  return Object.entries(metadata)
    .slice(0, 3)
    .map(
      ([key, value]) =>
        `${humanizeAction(key)}: ${printableValue(value) || "—"}`,
    )
    .join(" · ");
}

function parseEventDetails(
  value?: string,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function printableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value))
    return value.map(printableValue).filter(Boolean).join(", ");
  return "Updated";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
