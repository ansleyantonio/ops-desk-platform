import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "./ProgressBar";
import {
  ArrowRight as PhosphorArrowRight,
  ChartDonut,
  CheckCircle as PhosphorCheckCircle,
  ClockCountdown,
  Folders,
  Package,
  ShieldWarning,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Plus,
  Trash2,
  User,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  projectHealth,
  projectProgress,
  ticketDecisionInsights,
  ticketFlowStats,
  remainingEffortDays,
  phaseLabel,
  uid,
  type Health,
  type TicketDecisionInsight,
  type TicketFlowStats,
  type TicketInsightSeverity,
  type Module,
  type ModuleStatus,
  type Project,
  type ProjectTeam,
  type Risk,
  type RiskSeverity,
  type TeamMember,
  type UATStatus,
} from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  onUpdate: (p: Project) => void;
  members: TeamMember[];
  teams: ProjectTeam[];
}

const moduleStatusLabel: Record<ModuleStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};
const uatLabel: Record<UATStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  passed: "Passed",
  failed: "Failed",
};

const moduleTone: Record<ModuleStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  completed: "bg-success/15 text-success",
  blocked: "bg-destructive/15 text-destructive",
};
const uatTone: Record<UATStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  passed: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

const healthTone: Record<Health, string> = {
  on_track: "bg-success/15 text-success border-success/20",
  at_risk: "bg-warning/15 text-warning-foreground border-warning/30",
  delayed: "bg-destructive/15 text-destructive border-destructive/20",
  completed: "bg-info/15 text-info border-info/20",
  unknown: "bg-muted text-muted-foreground border-border",
};
const healthLabel: Record<Health, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
  completed: "Completed",
  unknown: "No timeline",
};

const severityTone: Record<RiskSeverity, string> = {
  low: "bg-info/15 text-info",
  medium: "bg-warning/15 text-warning-foreground",
  high: "bg-destructive/15 text-destructive",
};
const insightTone: Record<TicketInsightSeverity, string> = {
  success: "border-success/25 bg-success/10 text-success",
  info: "border-info/25 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/15 text-warning-foreground",
  critical: "border-destructive/25 bg-destructive/10 text-destructive",
};

const PAGE_SIZE = 20;

type ModuleGroupStat = {
  name: string;
  tickets: number;
  completed: number;
  inProgress: number;
  blocked: number;
  notStarted: number;
  open: number;
  completionPct: number;
  reviewPassed: number;
  reviewInProgress: number;
  reviewPending: number;
  reviewFailed: number;
  reviewPct: number;
  effortDays: number;
  remainingEffortDays: number;
  assignees: string[];
  overdue: number;
  nextDue?: string;
};

export function ProjectDetail({ project, onUpdate, members, teams }: Props) {
  const [newModule, setNewModule] = useState("");
  const [newRisk, setNewRisk] = useState("");
  const [newRiskSev, setNewRiskSev] = useState<RiskSeverity>("medium");
  const [activeTab, setActiveTab] = useState("stats");
  const [modulePage, setModulePage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<UATStatus | "all">("all");
  const [uatPage, setUatPage] = useState(1);
  const [riskPage, setRiskPage] = useState(1);
  const modules = project.modules;
  const risks = project.risks;

  useEffect(() => {
    setModulePage(1);
    setModuleFilter("all");
    setReviewFilter("all");
    setActiveTab("stats");
    setUatPage(1);
    setRiskPage(1);
  }, [project.id]);

  const moduleGroupOptions = useMemo(
    () =>
      [...new Set(modules.map((module) => module.moduleGroup?.trim() || "Uncategorised"))].sort(
        (a, b) => (a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b)),
      ),
    [modules],
  );
  const moduleGroupStats = useMemo(() => buildModuleGroupStats(modules), [modules]);
  const filteredModules = useMemo(
    () =>
      modules.filter(
        (module) =>
          (moduleFilter === "all" ||
            (module.moduleGroup?.trim() || "Uncategorised") === moduleFilter) &&
          (reviewFilter === "all" || module.uat === reviewFilter),
      ),
    [moduleFilter, modules, reviewFilter],
  );
  const modulePages = Math.max(1, Math.ceil(filteredModules.length / PAGE_SIZE));
  const uatPages = Math.max(1, Math.ceil(modules.length / PAGE_SIZE));
  const riskPages = Math.max(1, Math.ceil(risks.length / PAGE_SIZE));
  const moduleRows = useMemo(
    () => filteredModules.slice((modulePage - 1) * PAGE_SIZE, modulePage * PAGE_SIZE),
    [filteredModules, modulePage],
  );
  const groupedModuleRows = useMemo(() => {
    const groups = new Map<string, Module[]>();
    for (const module of moduleRows) {
      const group = module.moduleGroup?.trim() || "Uncategorised";
      groups.set(group, [...(groups.get(group) ?? []), module]);
    }
    return [...groups.entries()].map(([name, tickets]) => ({ name, tickets }));
  }, [moduleRows]);
  const uatRows = useMemo(
    () => modules.slice((uatPage - 1) * PAGE_SIZE, uatPage * PAGE_SIZE),
    [modules, uatPage],
  );

  useEffect(() => {
    setModulePage(1);
  }, [moduleFilter, reviewFilter]);
  const riskRows = useMemo(
    () => risks.slice((riskPage - 1) * PAGE_SIZE, riskPage * PAGE_SIZE),
    [risks, riskPage],
  );
  const { modulePct, uatPct } = projectProgress(project);
  const health = projectHealth(project);
  const insights = ticketDecisionInsights(project);
  const ticketStats = ticketFlowStats(project);
  const criticalInsights = insights.filter((insight) => insight.severity === "critical").length;
  const remaining = remainingEffortDays(project);
  const openRisks = project.risks.filter((r) => !r.resolved).length;
  const completedModules = project.modules.filter((m) => m.status === "completed").length;
  const uatPassed = project.modules.filter((m) => m.uat === "passed").length;
  const uatFailed = project.modules.filter((m) => m.uat === "failed").length;

  const daysLeft = project.targetDate
    ? Math.ceil((new Date(project.targetDate).getTime() - Date.now()) / 86400000)
    : null;
  const pm = project.pmId ? members.find((member) => member.id === project.pmId) : undefined;
  const memberIds = project.memberIds ?? [];
  const assignedMembers = memberIds
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is TeamMember => Boolean(member));
  const assignedDevs = assignedMembers.filter((member) => member.role === "dev");
  const assignedQa = assignedMembers.filter((member) => member.role === "qa");
  const selectedTeam = project.teamId
    ? teams.find((team) => team.id === project.teamId)
    : undefined;
  const selectedTeamPm = selectedTeam?.pmId
    ? members.find((member) => member.id === selectedTeam.pmId)
    : undefined;
  const selectedTeamDevs = selectedTeam
    ? selectedTeam.devIds
        .map((id) => members.find((member) => member.id === id))
        .filter((member): member is TeamMember => Boolean(member))
    : [];
  const selectedTeamQa = selectedTeam
    ? selectedTeam.qaIds
        .map((id) => members.find((member) => member.id === id))
        .filter((member): member is TeamMember => Boolean(member))
    : [];
  const assignTeam = (teamId: string) => {
    if (teamId === "unassigned") {
      onUpdate({ ...project, teamId: undefined, pmId: undefined, memberIds: [] });
      return;
    }

    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    onUpdate({
      ...project,
      teamId: team.id,
      pmId: team.pmId,
      memberIds: [...new Set([...team.devIds, ...team.qaIds])],
    });
  };

  const updateModule = (id: string, patch: Partial<Module>) => {
    onUpdate({
      ...project,
      modules: project.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };
  const addModule = () => {
    const v = newModule.trim();
    if (!v) return;
    onUpdate({
      ...project,
      modules: [...project.modules, { id: uid(), name: v, status: "not_started", uat: "pending" }],
    });
    setNewModule("");
  };
  const removeModule = (id: string) => {
    onUpdate({ ...project, modules: project.modules.filter((m) => m.id !== id) });
  };

  const addRisk = () => {
    const v = newRisk.trim();
    if (!v) return;
    const r: Risk = { id: uid(), title: v, severity: newRiskSev, createdAt: Date.now() };
    onUpdate({ ...project, risks: [r, ...project.risks] });
    setNewRisk("");
    setNewRiskSev("medium");
    setRiskPage(1);
  };
  const updateRisk = (id: string, patch: Partial<Risk>) =>
    onUpdate({
      ...project,
      risks: project.risks.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  const removeRisk = (id: string) =>
    onUpdate({ ...project, risks: project.risks.filter((r) => r.id !== id) });

  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-border/70 bg-card/55 shadow-[var(--shadow-elevated)]">
      <div className="border-b border-border/70 bg-gradient-to-br from-card via-card to-background p-5 pb-6 sm:p-7 lg:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-2 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
              {project.name}
            </h1>
            <Badge variant="outline" className="capitalize">
              {phaseLabel(project.phase)}
            </Badge>
            <Badge variant="outline" className={healthTone[health]}>
              {healthLabel[health]}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {project.status.replace("_", " ")}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {project.priority} priority
            </Badge>
          </div>
          {project.description && (
            <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Tickets"
            value={`${modulePct}%`}
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Review"
            value={`${uatPct}%`}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Phase"
            value={phaseLabel(project.phase)}
            icon={<Activity className="h-3.5 w-3.5" />}
            sub={project.status.replace("_", " ")}
            subTone="text-muted-foreground"
          />
          <StatTile
            label="Remaining"
            value={`${remaining}d`}
            icon={<Clock className="h-3.5 w-3.5" />}
            sub={
              daysLeft !== null
                ? daysLeft < 0
                  ? `${Math.abs(daysLeft)}d overdue`
                  : `${daysLeft}d left`
                : undefined
            }
            subTone={
              daysLeft !== null && daysLeft < 0 ? "text-destructive" : "text-muted-foreground"
            }
          />
        </div>

        <div className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Meta
            icon={<User className="h-3.5 w-3.5" />}
            label="Project manager"
            value={pm?.name || project.owner || "—"}
          />
          <Meta
            icon={<User className="h-3.5 w-3.5" />}
            label="Assigned individuals"
            value={assignedMembers.length.toString()}
          />
          <Meta
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label="Open risks"
            value={openRisks.toString()}
            tone={openRisks ? "text-destructive" : undefined}
          />
          <Meta
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Build window"
            value={`${fmt(project.startDate)} → ${fmt(project.targetDate)}`}
          />
          <Meta
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Review window"
            value={`${fmt(project.uatStartDate)} → ${fmt(project.uatEndDate)}`}
          />
        </div>

        <div className="space-y-3 mt-5">
          <ProgressBar value={modulePct} label="Ticket completion" />
          <ProgressBar value={uatPct} label="Review pass rate" tone="success" />
        </div>
        <IndividualAssignmentsPanel developers={assignedDevs} qa={assignedQa} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="p-5 pt-4 sm:p-7 sm:pt-5 lg:p-8 lg:pt-6"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-lg bg-muted/60 p-1.5 md:grid-cols-8">
          <TabsTrigger value="module-overview">Modules</TabsTrigger>
          <TabsTrigger value="modules">Tickets</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="insights">
            Insights{" "}
            {criticalInsights > 0 && (
              <span className="ml-1.5 inline-flex h-5 items-center justify-center rounded-full bg-destructive/15 px-1.5 text-[10px] text-destructive">
                {criticalInsights}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="uat">Review</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="risks">
            Risks{" "}
            {openRisks > 0 && (
              <span className="ml-1.5 inline-flex h-5 items-center justify-center rounded-full bg-destructive/15 px-1.5 text-[10px] text-destructive">
                {openRisks}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* MODULE OVERVIEW */}
        <TabsContent value="module-overview" className="mt-4">
          <ModuleAnalyticsPanel
            groups={moduleGroupStats}
            onOpenTickets={(group, review = "all") => {
              setModuleFilter(group);
              setReviewFilter(review);
              setModulePage(1);
              setActiveTab("modules");
            }}
          />
        </TabsContent>

        {/* STATS */}
        <TabsContent value="stats" className="mt-4">
          <TicketStatsPanel stats={ticketStats} />
        </TabsContent>

        {/* INSIGHTS */}
        <TabsContent value="insights" className="mt-4">
          <TicketInsightsPanel insights={insights} />
        </TabsContent>

        {/* MODULES */}
        <TabsContent value="modules" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <Input
              value={newModule}
              onChange={(e) => setNewModule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addModule();
                }
              }}
              placeholder="Add ticket..."
            />
            <Button onClick={addModule} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {moduleGroupOptions.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground">Ticket modules</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {moduleGroupOptions.length} modules · {filteredModules.length} tickets shown
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="h-9 w-full bg-background sm:w-[250px]">
                    <SelectValue placeholder="All modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    {moduleGroupOptions.map((group) => (
                      <SelectItem key={group} value={group}>
                        {group} (
                        {
                          modules.filter(
                            (module) => (module.moduleGroup?.trim() || "Uncategorised") === group,
                          ).length
                        }
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={reviewFilter}
                  onValueChange={(value) => setReviewFilter(value as UATStatus | "all")}
                >
                  <SelectTrigger className="h-9 w-full bg-background sm:w-[190px]">
                    <SelectValue placeholder="All review states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All review states</SelectItem>
                    {(Object.keys(uatLabel) as UATStatus[]).map((status) => (
                      <SelectItem key={status} value={status}>
                        {uatLabel[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {project.modules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No tickets yet.</p>
          )}
          <div className="space-y-3">
            {groupedModuleRows.map((group) => (
              <section
                className="overflow-hidden rounded-xl border border-border/70 bg-muted/20"
                key={group.name}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/55 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{group.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Ticket module</div>
                  </div>
                  <Badge variant="outline" className="bg-background">
                    {group.tickets.length} {group.tickets.length === 1 ? "ticket" : "tickets"}
                  </Badge>
                </div>
                <div className="space-y-3 p-3">
                  {group.tickets.map((m) => (
                    <div
                      key={m.id}
                      className="space-y-3 rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Input
                          value={m.name}
                          onChange={(e) => updateModule(m.id, { name: e.target.value })}
                          className="font-medium h-8 border-transparent hover:border-input focus:border-input px-2 -mx-2"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => removeModule(m.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Field label="Status">
                          <Select
                            value={m.status}
                            onValueChange={(v) => updateModule(m.id, { status: v as ModuleStatus })}
                          >
                            <SelectTrigger className="h-10">
                              <Badge
                                variant="secondary"
                                className={`${moduleTone[m.status]} border-0`}
                              >
                                {moduleStatusLabel[m.status]}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(moduleStatusLabel) as ModuleStatus[]).map((s) => (
                                <SelectItem key={s} value={s}>
                                  {moduleStatusLabel[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Review">
                          <Select
                            value={m.uat}
                            onValueChange={(v) => updateModule(m.id, { uat: v as UATStatus })}
                          >
                            <SelectTrigger className="h-10">
                              <Badge variant="secondary" className={`${uatTone[m.uat]} border-0`}>
                                {uatLabel[m.uat]}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(uatLabel) as UATStatus[]).map((s) => (
                                <SelectItem key={s} value={s}>
                                  {uatLabel[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Assignee">
                          <Input
                            className="h-10"
                            value={m.assignee ?? ""}
                            onChange={(e) => updateModule(m.id, { assignee: e.target.value })}
                            placeholder="—"
                          />
                        </Field>
                        <Field label="Effort (days)">
                          <Input
                            className="h-10"
                            type="number"
                            min={0}
                            value={m.effortDays ?? ""}
                            onChange={(e) =>
                              updateModule(m.id, {
                                effortDays:
                                  e.target.value === "" ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder="—"
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Field label="Build start">
                          <Input
                            className="h-10"
                            type="date"
                            value={m.plannedStart ?? ""}
                            onChange={(e) => updateModule(m.id, { plannedStart: e.target.value })}
                          />
                        </Field>
                        <Field label="Build end">
                          <Input
                            className="h-10"
                            type="date"
                            value={m.plannedEnd ?? ""}
                            onChange={(e) => updateModule(m.id, { plannedEnd: e.target.value })}
                          />
                        </Field>
                        <Field label="UAT start">
                          <Input
                            className="h-10"
                            type="date"
                            value={m.uatPlannedStart ?? ""}
                            onChange={(e) =>
                              updateModule(m.id, { uatPlannedStart: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="UAT end">
                          <Input
                            className="h-10"
                            type="date"
                            value={m.uatPlannedEnd ?? ""}
                            onChange={(e) => updateModule(m.id, { uatPlannedEnd: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Textarea
                        rows={1}
                        value={m.notes ?? ""}
                        onChange={(e) => updateModule(m.id, { notes: e.target.value })}
                        placeholder="Notes..."
                        className="text-xs min-h-[36px]"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {filteredModules.length > PAGE_SIZE && (
            <Pager
              label="Tickets"
              page={modulePage}
              totalPages={modulePages}
              totalItems={filteredModules.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setModulePage((p) => Math.max(1, p - 1))}
              onNext={() => setModulePage((p) => Math.min(modulePages, p + 1))}
            />
          )}
        </TabsContent>

        {/* Review */}
        <TabsContent value="uat" className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <UatStat
              label="Passed"
              count={uatPassed}
              total={project.modules.length}
              tone="success"
            />
            <UatStat
              label="In progress"
              count={project.modules.filter((m) => m.uat === "in_progress").length}
              total={project.modules.length}
              tone="info"
            />
            <UatStat
              label="Failed"
              count={uatFailed}
              total={project.modules.length}
              tone="destructive"
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card/90 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium">Ticket</th>
                  <th className="text-left p-3 font-medium">Review status</th>
                  <th className="text-left p-3 font-medium">Planned</th>
                  <th className="text-left p-3 font-medium">Actual</th>
                </tr>
              </thead>
              <tbody>
                {project.modules.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center p-8 text-muted-foreground">
                      No tickets to review.
                    </td>
                  </tr>
                )}
                {uatRows.map((m) => (
                  <tr key={m.id} className="border-t border-border/70 align-top">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3">
                      <Select
                        value={m.uat}
                        onValueChange={(v) => updateModule(m.id, { uat: v as UATStatus })}
                      >
                        <SelectTrigger className="h-10 w-[140px]">
                          <Badge variant="secondary" className={`${uatTone[m.uat]} border-0`}>
                            {uatLabel[m.uat]}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(uatLabel) as UATStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>
                              {uatLabel[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Input
                          className="h-10 w-[130px]"
                          type="date"
                          value={m.uatPlannedStart ?? ""}
                          onChange={(e) => updateModule(m.id, { uatPlannedStart: e.target.value })}
                        />
                        <Input
                          className="h-10 w-[130px]"
                          type="date"
                          value={m.uatPlannedEnd ?? ""}
                          onChange={(e) => updateModule(m.id, { uatPlannedEnd: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Input
                          className="h-10 w-[130px]"
                          type="date"
                          value={m.uatActualStart ?? ""}
                          onChange={(e) => updateModule(m.id, { uatActualStart: e.target.value })}
                        />
                        <Input
                          className="h-10 w-[130px]"
                          type="date"
                          value={m.uatActualEnd ?? ""}
                          onChange={(e) => updateModule(m.id, { uatActualEnd: e.target.value })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {project.modules.length > PAGE_SIZE && (
            <Pager
              label="Review rows"
              page={uatPage}
              totalPages={uatPages}
              totalItems={project.modules.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setUatPage((p) => Math.max(1, p - 1))}
              onNext={() => setUatPage((p) => Math.min(uatPages, p + 1))}
            />
          )}
        </TabsContent>

        {/* TEAM */}
        <TabsContent value="team" className="mt-4 space-y-4">
          <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/85 shadow-[var(--shadow-card)]">
            <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)] md:items-end">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <UsersThree className="h-4 w-4" weight="duotone" />
                  Delivery ownership
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.035em] text-foreground">
                  Assign a project team
                </h2>
                <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted-foreground">
                  Selecting a team assigns its PM, developers, and QA roster to this project.
                </p>
              </div>
              <div className="space-y-2">
                <label
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  htmlFor="project-team"
                >
                  Project team
                </label>
                <Select value={selectedTeam?.id ?? "unassigned"} onValueChange={assignTeam}>
                  <SelectTrigger className="h-11 bg-background" id="project-team">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">No team assigned</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name} · {team.devIds.length + team.qaIds.length} delivery members
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  Changes save immediately and update project ownership across the portal.
                </p>
              </div>
            </div>
          </section>

          {teams.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-muted/25 px-6 py-12 text-center">
              <UsersThree className="mx-auto h-7 w-7 text-muted-foreground" weight="duotone" />
              <h3 className="mt-4 text-base font-semibold text-foreground">
                No project teams available
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Create a team in the Teams workspace, then return here to assign it to this project.
              </p>
            </div>
          ) : selectedTeam ? (
            <TeamHierarchyPanel
              expanded
              team={selectedTeam}
              teamDevs={selectedTeamDevs}
              teamPm={selectedTeamPm}
              teamQa={selectedTeamQa}
            />
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-muted/25 px-6 py-12 text-center">
              <UsersThree className="mx-auto h-7 w-7 text-muted-foreground" weight="duotone" />
              <h3 className="mt-4 text-base font-semibold text-foreground">No team assigned</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Choose a project team above to show its PM, developers, and QA structure.
              </p>
            </div>
          )}
        </TabsContent>

        {/* RISKS */}
        <TabsContent value="risks" className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={newRisk}
              onChange={(e) => setNewRisk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRisk();
                }
              }}
              placeholder="Describe a risk or blocker..."
            />
            <Select value={newRiskSev} onValueChange={(v) => setNewRiskSev(v as RiskSeverity)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addRisk} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {project.risks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No risks logged. Nothing standing in the way.
            </p>
          )}
          <div className="space-y-2">
            {riskRows.map((r) => (
              <div
                key={r.id}
                className={`space-y-2 rounded-lg border border-border/70 bg-card/90 p-3 shadow-sm ${r.resolved ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Input
                      value={r.title}
                      onChange={(e) => updateRisk(r.id, { title: e.target.value })}
                      className="h-7 border-transparent hover:border-input focus:border-input px-2 -mx-2 font-medium"
                    />
                  </div>
                  <Select
                    value={r.severity}
                    onValueChange={(v) => updateRisk(r.id, { severity: v as RiskSeverity })}
                  >
                    <SelectTrigger className="h-8 w-[100px]">
                      <Badge
                        variant="secondary"
                        className={`${severityTone[r.severity]} border-0 capitalize`}
                      >
                        {r.severity}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={r.resolved ? "secondary" : "outline"}
                    className="h-7"
                    onClick={() => updateRisk(r.id, { resolved: !r.resolved })}
                  >
                    {r.resolved ? "Reopen" : "Resolve"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeRisk(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={1}
                  value={r.mitigation ?? ""}
                  onChange={(e) => updateRisk(r.id, { mitigation: e.target.value })}
                  placeholder="Mitigation plan..."
                  className="min-h-[36px] text-xs"
                />
              </div>
            ))}
          </div>
          {project.risks.length > PAGE_SIZE && (
            <Pager
              label="Risks"
              page={riskPage}
              totalPages={riskPages}
              totalItems={project.risks.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setRiskPage((p) => Math.max(1, p - 1))}
              onNext={() => setRiskPage((p) => Math.min(riskPages, p + 1))}
            />
          )}
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4">
          <Timeline project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildModuleGroupStats(modules: Module[]): ModuleGroupStat[] {
  const groups = new Map<string, Module[]>();
  const now = Date.now();

  for (const module of modules) {
    const groupName = module.moduleGroup?.trim() || "Uncategorised";
    groups.set(groupName, [...(groups.get(groupName) ?? []), module]);
  }

  return [...groups.entries()]
    .map(([name, tickets]) => {
      const completed = tickets.filter((ticket) => ticket.status === "completed").length;
      const inProgress = tickets.filter((ticket) => ticket.status === "in_progress").length;
      const blocked = tickets.filter((ticket) => ticket.status === "blocked").length;
      const notStarted = tickets.filter((ticket) => ticket.status === "not_started").length;
      const reviewPassed = tickets.filter((ticket) => ticket.uat === "passed").length;
      const reviewInProgress = tickets.filter((ticket) => ticket.uat === "in_progress").length;
      const reviewPending = tickets.filter((ticket) => ticket.uat === "pending").length;
      const reviewFailed = tickets.filter((ticket) => ticket.uat === "failed").length;
      const openTickets = tickets.filter((ticket) => ticket.status !== "completed");
      const overdue = openTickets.filter(
        (ticket) => ticket.plannedEnd && new Date(ticket.plannedEnd).getTime() < now,
      ).length;
      const futureDueDates = openTickets
        .map((ticket) => ticket.plannedEnd)
        .filter((date): date is string => Boolean(date) && new Date(date).getTime() >= now)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const effortDays = tickets.reduce((total, ticket) => total + (ticket.effortDays ?? 0), 0);
      const remainingEffort = openTickets.reduce(
        (total, ticket) => total + (ticket.effortDays ?? 0),
        0,
      );
      const assignees = [
        ...new Set(
          tickets
            .map((ticket) => ticket.assignee?.trim())
            .filter((assignee): assignee is string => Boolean(assignee)),
        ),
      ].sort((a, b) => a.localeCompare(b));

      return {
        name,
        tickets: tickets.length,
        completed,
        inProgress,
        blocked,
        notStarted,
        open: tickets.length - completed,
        completionPct: tickets.length ? Math.round((completed / tickets.length) * 100) : 0,
        reviewPassed,
        reviewInProgress,
        reviewPending,
        reviewFailed,
        reviewPct: tickets.length
          ? Math.round(((reviewPassed + reviewInProgress * 0.5) / tickets.length) * 100)
          : 0,
        effortDays,
        remainingEffortDays: remainingEffort,
        assignees,
        overdue,
        nextDue: futureDueDates[0],
      };
    })
    .sort((a, b) =>
      a.name === "Uncategorised"
        ? 1
        : b.name === "Uncategorised"
          ? -1
          : a.name.localeCompare(b.name),
    );
}

function ModuleAnalyticsPanel({
  groups,
  onOpenTickets,
}: {
  groups: ModuleGroupStat[];
  onOpenTickets: (group: string, review?: UATStatus | "all") => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border bg-muted/25 px-6 py-14 text-center">
        <Folders className="mx-auto h-7 w-7 text-muted-foreground" weight="duotone" />
        <h3 className="mt-4 text-base font-semibold text-foreground">No module data yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Module analytics will appear when tickets have been synced with their module
          classification.
        </p>
      </div>
    );
  }

  const totalTickets = groups.reduce((total, group) => total + group.tickets, 0);
  const completed = groups.reduce((total, group) => total + group.completed, 0);
  const blocked = groups.reduce((total, group) => total + group.blocked, 0);
  const overdue = groups.reduce((total, group) => total + group.overdue, 0);
  const reviewPassed = groups.reduce((total, group) => total + group.reviewPassed, 0);
  const reviewInProgress = groups.reduce((total, group) => total + group.reviewInProgress, 0);
  const remainingEffort = groups.reduce((total, group) => total + group.remainingEffortDays, 0);
  const completionPct = totalTickets ? Math.round((completed / totalTickets) * 100) : 0;
  const reviewPct = totalTickets
    ? Math.round(((reviewPassed + reviewInProgress * 0.5) / totalTickets) * 100)
    : 0;
  const uncategorised = groups.find((group) => group.name === "Uncategorised")?.tickets ?? 0;
  const namedModuleCount = groups.length - (uncategorised ? 1 : 0);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/80 shadow-[var(--shadow-card)]">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              <ChartDonut className="h-4 w-4" weight="duotone" />
              Module delivery map
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.035em] text-foreground sm:text-2xl">
              {namedModuleCount} delivery modules
            </h2>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Compare delivery pressure, review position, ownership, and remaining effort across
              every ticket module.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/70 pt-5 sm:grid-cols-4">
              <ModuleSummaryMetric label="Tickets" value={totalTickets.toString()} />
              <ModuleSummaryMetric
                label="Blocked"
                tone={blocked ? "text-destructive" : undefined}
                value={blocked.toString()}
              />
              <ModuleSummaryMetric
                label="Overdue"
                tone={overdue ? "text-warning-foreground" : undefined}
                value={overdue.toString()}
              />
              <ModuleSummaryMetric label="Effort left" value={`${remainingEffort}d`} />
            </div>
          </div>

          <div className="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-5 rounded-[1.35rem] border border-border/75 bg-background/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div
              className="grid h-28 w-28 place-items-center rounded-full p-[9px]"
              style={{
                background: `conic-gradient(var(--color-primary) ${completionPct}%, var(--color-muted) 0)`,
              }}
            >
              <div className="grid h-full w-full place-items-center rounded-full bg-card text-center shadow-[inset_0_0_0_1px_var(--color-border)]">
                <div>
                  <div className="app-mono text-2xl font-semibold text-foreground">
                    {completionPct}%
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    complete
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <ModuleInlineMetric
                icon={<PhosphorCheckCircle className="h-4 w-4" weight="duotone" />}
                label="Review passed"
                value={`${reviewPct}%`}
              />
              <ModuleInlineMetric
                icon={<Package className="h-4 w-4" weight="duotone" />}
                label="Named modules"
                value={namedModuleCount.toString()}
              />
              <ModuleInlineMetric
                icon={<WarningCircle className="h-4 w-4" weight="duotone" />}
                label="Uncategorised"
                tone={uncategorised ? "text-warning-foreground" : undefined}
                value={uncategorised.toString()}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/70">
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Module comparison
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-foreground">
              Delivery position by module
            </h3>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
            <ModuleLegend color="bg-success" label="Completed" />
            <ModuleLegend color="bg-info" label="In progress" />
            <ModuleLegend color="bg-muted-foreground/55" label="Not started" />
            <ModuleLegend color="bg-destructive" label="Blocked" />
          </div>
        </div>

        <div className="divide-y divide-border/70">
          {groups.map((group, index) => (
            <ModuleAnalyticsRow
              group={group}
              index={index}
              key={group.name}
              onOpenTickets={onOpenTickets}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleSummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: string;
  value: string;
}) {
  return (
    <div>
      <div className={cn("app-mono text-xl font-semibold tabular-nums text-foreground", tone)}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ModuleInlineMetric({
  icon,
  label,
  tone,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("app-mono text-xs font-semibold text-foreground", tone)}>{value}</span>
    </div>
  );
}

function ModuleLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className={cn("h-2 w-2 rounded-sm", color)} />
      {label}
    </span>
  );
}

function ModuleAnalyticsRow({
  group,
  index,
  onOpenTickets,
}: {
  group: ModuleGroupStat;
  index: number;
  onOpenTickets: (group: string, review?: UATStatus | "all") => void;
}) {
  const concludedReviews = group.reviewPassed + group.reviewFailed;
  const failurePct = concludedReviews
    ? Math.round((group.reviewFailed / concludedReviews) * 100)
    : 0;
  const statusSegments = [
    { label: "Completed", count: group.completed, tone: "bg-success" },
    { label: "In progress", count: group.inProgress, tone: "bg-info" },
    { label: "Not started", count: group.notStarted, tone: "bg-muted-foreground/55" },
    { label: "Blocked", count: group.blocked, tone: "bg-destructive" },
  ].filter((segment) => segment.count > 0);

  return (
    <article
      className="px-4 py-5 transition-colors duration-300 hover:bg-muted/25 sm:px-5"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(210px,0.75fr)_minmax(320px,1.25fr)_minmax(235px,0.85fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-foreground" title={group.name}>
              {group.name}
            </h4>
            {group.name === "Uncategorised" ? (
              <Badge
                className="border-warning/30 bg-warning/10 text-warning-foreground"
                variant="outline"
              >
                Needs classification
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{group.tickets} tickets</span>
            <span>{group.assignees.length} assignees</span>
            {group.nextDue ? <span>Next due {fmt(group.nextDue)}</span> : null}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <UsersThree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" weight="duotone" />
            <span className="truncate text-[11px] text-muted-foreground">
              {group.assignees.length
                ? `${group.assignees.slice(0, 3).join(", ")}${group.assignees.length > 3 ? ` +${group.assignees.length - 3}` : ""}`
                : "No assignee recorded"}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-medium text-foreground">Ticket delivery</span>
            <span className="app-mono text-muted-foreground">
              {group.completed}/{group.tickets} · {group.completionPct}%
            </span>
          </div>
          <div
            className="mt-2 grid h-2.5 overflow-hidden rounded-full bg-muted"
            style={{
              gridTemplateColumns: statusSegments.map((segment) => `${segment.count}fr`).join(" "),
            }}
          >
            {statusSegments.map((segment) => (
              <span
                className={segment.tone}
                key={segment.label}
                title={`${segment.label}: ${segment.count}`}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <ModuleMicroMetric label="Done" value={group.completed} />
            <ModuleMicroMetric label="Active" value={group.inProgress} />
            <ModuleMicroMetric
              label="Blocked"
              tone={group.blocked ? "text-destructive" : undefined}
              value={group.blocked}
            />
            <ModuleMicroMetric label="Queue" value={group.notStarted} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <ModuleReviewFilter
              label={`${group.reviewPassed} passed`}
              onClick={() => onOpenTickets(group.name, "passed")}
              tone="success"
            />
            <ModuleReviewFilter
              label={`${group.reviewInProgress} testing`}
              onClick={() => onOpenTickets(group.name, "in_progress")}
            />
            <ModuleReviewFilter
              label={`${group.reviewPending} pending`}
              onClick={() => onOpenTickets(group.name, "pending")}
            />
            <ModuleReviewFilter
              label={`${group.reviewFailed} failed of ${concludedReviews} reviewed · ${failurePct}%`}
              onClick={() => onOpenTickets(group.name, "failed")}
              tone={group.reviewFailed ? "danger" : "neutral"}
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-4">
          <div className="space-y-2.5">
            <ModuleCompactStat
              icon={<PhosphorCheckCircle className="h-3.5 w-3.5" weight="duotone" />}
              label="Review"
              value={`${group.reviewPct}%`}
            />
            <ModuleCompactStat
              icon={<ShieldWarning className="h-3.5 w-3.5" weight="duotone" />}
              label="Overdue"
              tone={group.overdue ? "text-warning-foreground" : undefined}
              value={group.overdue.toString()}
            />
            <ModuleCompactStat
              icon={<ClockCountdown className="h-3.5 w-3.5" weight="duotone" />}
              label="Effort left / total"
              value={`${group.remainingEffortDays}/${group.effortDays}d`}
            />
          </div>
          <Button
            aria-label={`Open tickets for ${group.name}`}
            className="h-10 w-10 rounded-full active:scale-[0.96]"
            onClick={() => onOpenTickets(group.name)}
            size="icon"
            variant="outline"
          >
            <PhosphorArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function ModuleReviewFilter({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  tone?: "danger" | "neutral" | "success";
}) {
  return (
    <button
      className={cn(
        "rounded-full border px-2 py-1 font-medium transition-[background-color,border-color,transform] duration-200 hover:bg-muted active:scale-[0.98]",
        tone === "danger" && "border-destructive/25 bg-destructive/10 text-destructive",
        tone === "success" && "border-success/25 bg-success/10 text-success",
        tone === "neutral" && "border-border/70 bg-background/65 text-muted-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ModuleMicroMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: string;
  value: number;
}) {
  return (
    <div className="rounded-md bg-muted/45 px-2 py-2">
      <div className={cn("app-mono text-xs font-semibold text-foreground", tone)}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ModuleCompactStat({
  icon,
  label,
  tone,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className={cn("app-mono font-semibold text-foreground", tone)}>{value}</span>
    </div>
  );
}

function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatTile({
  label,
  value,
  icon,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  sub?: string;
  subTone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/90 p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && (
        <div className={`text-[11px] mt-0.5 ${subTone ?? "text-muted-foreground"}`}>{sub}</div>
      )}
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-sm truncate ${tone ?? ""}`}>{value}</div>
      </div>
    </div>
  );
}

function TicketStatsPanel({ stats }: { stats: TicketFlowStats }) {
  const statusRows = [
    { label: "Completed", count: stats.completed, tone: "bg-success" },
    { label: "In progress", count: stats.inProgress, tone: "bg-info" },
    { label: "Not started", count: stats.notStarted, tone: "bg-muted-foreground/60" },
    { label: "Blocked", count: stats.blocked, tone: "bg-destructive" },
  ];
  const reviewRows = [
    { label: "Passed", count: stats.reviewPassed, tone: "bg-success" },
    { label: "In review/testing", count: stats.reviewInProgress, tone: "bg-info" },
    { label: "Pending", count: stats.reviewPending, tone: "bg-muted-foreground/60" },
    { label: "Failed", count: stats.reviewFailed, tone: "bg-destructive" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatsKpi
          label="Overall progress"
          value={`${stats.overallPct}%`}
          detail={`${stats.modulePct}% ticket · ${stats.reviewPct}% review`}
        />
        <StatsKpi
          label="Ticket completion"
          value={`${stats.completionPct}%`}
          detail={`${stats.completed}/${stats.total} completed`}
        />
        <StatsKpi
          label="Open tickets"
          value={stats.open.toString()}
          detail={`${stats.blocked} blocked`}
        />
        <StatsKpi
          label="Moved back to dev"
          value={stats.hasStatusHistory ? stats.movedBackCount.toString() : "No history"}
          detail={
            stats.hasStatusHistory
              ? stats.movedBackCount > 0
                ? "Review/testing regression events"
                : "No regression events detected"
              : "Needs synced status history"
          }
          tone={stats.movedBackCount > 0 ? "text-destructive" : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <StatsBreakdown title="Ticket status breakdown" total={stats.total} rows={statusRows} />
        <StatsBreakdown title="Review status breakdown" total={stats.total} rows={reviewRows} />
      </div>

      <div className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Moved back analysis</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Counts tickets that moved from review/testing back to dev, not started, or blocked.
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              stats.movedBackCount > 0
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : "bg-muted/60"
            }
          >
            {stats.hasStatusHistory ? `${stats.movedBackCount} event(s)` : "History unavailable"}
          </Badge>
        </div>
        {stats.hasStatusHistory ? (
          stats.movedBackExamples.length > 0 ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Transition paths
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {stats.movedBackByFlow.map(({ from, to, count }) => (
                    <Badge
                      key={`${from}-${to}`}
                      variant="outline"
                      className="gap-2 border-warning/30 bg-warning/10 text-warning-foreground"
                    >
                      <span>
                        {from.replace(/\b\w/g, (character) => character.toUpperCase())}
                        {" → "}
                        {to.replace(/\b\w/g, (character) => character.toUpperCase())}
                      </span>
                      <span className="app-mono rounded-full bg-background/70 px-1.5 py-0.5 text-[10px]">
                        {count}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Ticket examples
                </div>
                {stats.movedBackExamples.map((example, index) => (
                  <div
                    key={`${example}-${index}`}
                    className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-foreground"
                  >
                    {example}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              No review-to-dev movement has been detected from stored ticket history.
            </p>
          )
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The next Notion cron sync should persist ticket status transitions so this metric can
            identify repeated QA failures and dev rework.
          </p>
        )}
      </div>
    </div>
  );
}

function StatsKpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${tone ?? ""}`}>
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

function StatsBreakdown({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: Array<{ label: string; count: number; tone: string }>;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row) => {
          const width = total ? Math.round((row.count / total) * 100) : 0;
          return (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="text-muted-foreground">
                  {row.count}/{total} · {width}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketInsightsPanel({ insights }: { insights: TicketDecisionInsight[] }) {
  const priorityOrder: Record<TicketInsightSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };
  const ordered = insights
    .slice()
    .sort((a, b) => priorityOrder[a.severity] - priorityOrder[b.severity]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Decision signals</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              These are generated from ticket status, review state, dates, and stored Notion status
              history when available.
            </p>
          </div>
          <Badge variant="outline" className="bg-muted/60">
            {ordered.filter((insight) => insight.severity !== "success").length} to watch
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ordered.map((insight) => (
          <div
            key={insight.id}
            className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {insight.title}
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                  {insight.value}
                </div>
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 capitalize ${insightTone[insight.severity]}`}
              >
                {insight.severity}
              </Badge>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{insight.detail}</p>
            {insight.action && (
              <div className="mt-3 rounded-md border border-border/70 bg-background px-3 py-2 text-xs leading-5 text-foreground">
                <span className="font-semibold">Decision: </span>
                {insight.action}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function IndividualAssignmentsPanel({
  developers,
  expanded = false,
  qa,
}: {
  developers: TeamMember[];
  expanded?: boolean;
  qa: TeamMember[];
}) {
  const total = developers.length + qa.length;

  return (
    <div
      className={cn("rounded-lg border border-border/70 bg-card/80", expanded ? "p-4" : "mt-5 p-3")}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Project contributors
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {total ? `${total} individuals assigned` : "No individuals assigned"}
          </div>
        </div>
      </div>
      {total ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TeamColumn label="Dev" names={developers.map((member) => member.name)} />
          <TeamColumn label="QA" names={qa.map((member) => member.name)} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Assign contributors directly from the People tab or project editor.
        </p>
      )}
    </div>
  );
}

function TeamHierarchyPanel({
  expanded = false,
  team,
  teamDevs,
  teamPm,
  teamQa,
}: {
  expanded?: boolean;
  team?: ProjectTeam;
  teamDevs: TeamMember[];
  teamPm?: TeamMember;
  teamQa: TeamMember[];
}) {
  return (
    <div className="mt-5 rounded-lg border border-border/70 bg-card/90 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Team structure
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {team?.name ?? "No project team assigned"}
          </div>
        </div>
        {team && (
          <Badge variant="outline" className="shrink-0">
            {(teamPm ? 1 : 0) + teamDevs.length + teamQa.length} people
          </Badge>
        )}
      </div>

      {team ? (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <TeamColumn label="PM" names={teamPm ? [teamPm.name] : []} />
          <TeamColumn label="Dev" names={teamDevs.map((member) => member.name)} />
          <TeamColumn label="QA" names={teamQa.map((member) => member.name)} />
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Assign a team from the Teams tab or edit the project to show the PM, dev, and QA structure
          here.
        </p>
      )}

      {expanded && team?.description && (
        <p className="mt-3 rounded-md border border-border/70 bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
          {team.description}
        </p>
      )}
    </div>
  );
}

function TeamColumn({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 space-y-1">
        {names.length === 0 ? (
          <div className="text-xs text-muted-foreground">Unassigned</div>
        ) : (
          names.map((name) => (
            <div key={name} className="truncate text-xs font-medium text-foreground">
              {name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function UatStat({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "success" | "info" | "destructive";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "info" ? "text-info" : "text-destructive";
  return (
    <div className="rounded-lg border border-border/70 bg-card/90 p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
        {count}
        <span className="text-sm font-normal text-muted-foreground">/{total}</span>
      </div>
    </div>
  );
}

function Timeline({ project }: { project: Project }) {
  if (project.stages?.length) {
    return <ProjectStagePipeline project={project} />;
  }

  const dated = project.modules
    .map((m) => ({ m, start: m.plannedStart, end: m.plannedEnd }))
    .filter((x) => x.start && x.end);

  if (dated.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Add planned start/end dates to tickets to see the timeline.
      </p>
    );
  }

  const min = Math.min(...dated.map((x) => new Date(x.start!).getTime()));
  const max = Math.max(...dated.map((x) => new Date(x.end!).getTime()));
  const span = Math.max(1, max - min);
  const today = Date.now();
  const todayPct = today >= min && today <= max ? ((today - min) / span) * 100 : null;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{new Date(min).toLocaleDateString()}</span>
        <span>{new Date(max).toLocaleDateString()}</span>
      </div>
      <div className="relative space-y-2">
        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-destructive z-10"
            style={{ left: `${todayPct}%` }}
            title="Today"
          />
        )}
        {project.modules.map((m) => {
          const hasDates = m.plannedStart && m.plannedEnd;
          const left = hasDates ? ((new Date(m.plannedStart!).getTime() - min) / span) * 100 : 0;
          const width = hasDates
            ? Math.max(
                2,
                ((new Date(m.plannedEnd!).getTime() - new Date(m.plannedStart!).getTime()) / span) *
                  100,
              )
            : 0;
          const tone =
            m.status === "completed"
              ? "bg-success"
              : m.status === "blocked"
                ? "bg-destructive"
                : m.status === "in_progress"
                  ? "bg-info"
                  : "bg-muted-foreground/40";
          return (
            <div key={m.id} className="grid grid-cols-[160px_1fr] items-center gap-3">
              <div className="text-xs truncate" title={m.name}>
                {m.name}
              </div>
              <div className="relative h-5 overflow-hidden rounded-full bg-muted/40">
                {hasDates ? (
                  <div
                    className={`absolute top-0 bottom-0 rounded-full ${tone}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${m.plannedStart} → ${m.plannedEnd}`}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center px-2 text-[10px] text-muted-foreground">
                    No dates
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectStagePipeline({ project }: { project: Project }) {
  const stages = project.stages ?? [];

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/80 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            Synced project pipeline
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
            {stages.length} delivery stages
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Authoritative stage dates supplied by the PEN project API.
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-muted/55">
          Current: {stages.find((stage) => stage.id === project.currentStageId)?.label ?? "Not set"}
        </Badge>
      </div>

      <div className="divide-y divide-border/70">
        {stages.map((stage, index) => {
          const state = projectStageState(stage.startDate, stage.endDate);
          const isCurrent = stage.id === project.currentStageId;
          return (
            <div
              className={cn(
                "grid gap-4 px-5 py-5 md:grid-cols-[minmax(180px,0.7fr)_minmax(260px,1fr)_110px] md:items-center",
                isCurrent && "bg-primary/[0.045]",
              )}
              key={`${stage.id}-${index}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_4px_var(--color-card)]"
                  style={{ backgroundColor: stage.color || "var(--color-primary)" }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {stage.label}
                  </div>
                  <div className="app-mono mt-1 truncate text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {stage.id}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    Starts
                  </div>
                  <div className="app-mono mt-1 font-medium text-foreground">
                    {fmt(stage.startDate)}
                  </div>
                </div>
                <PhosphorArrowRight className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    Ends
                  </div>
                  <div className="app-mono mt-1 font-medium text-foreground">
                    {fmt(stage.endDate)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 md:justify-end">
                <span className="app-mono text-[10px] text-muted-foreground">
                  {projectStageDuration(stage.startDate, stage.endDate)}
                </span>
                <Badge
                  className={cn(
                    isCurrent
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : state === "complete"
                        ? "border-success/25 bg-success/10 text-success"
                        : state === "active"
                          ? "border-info/25 bg-info/10 text-info"
                          : "bg-muted/60 text-muted-foreground",
                  )}
                  variant="outline"
                >
                  {isCurrent
                    ? "Current"
                    : state === "complete"
                      ? "Complete"
                      : state === "active"
                        ? "Active"
                        : "Upcoming"}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function projectStageState(startDate?: string, endDate?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate).getTime() : Number.NaN;
  const end = endDate ? new Date(endDate).getTime() : Number.NaN;
  if (!Number.isNaN(end) && end < today.getTime()) return "complete";
  if (!Number.isNaN(start) && start > today.getTime()) return "upcoming";
  return "active";
}

function projectStageDuration(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return "No duration";
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "No duration";
  return `${Math.max(1, Math.round((end - start) / 86400000) + 1)} days`;
}

function Pager({
  label,
  page,
  totalPages,
  totalItems,
  pageSize,
  onPrev,
  onNext,
}: {
  label: string;
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {label} {start}-{end} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={onPrev}
          disabled={page <= 1}
        >
          Prev
        </Button>
        <span className="tabular-nums">
          {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
